#!/bin/bash
# フェーズを1つ回す。使い方: ./scripts/run-phase.sh <spec|impl|review|code-review|pr-review> <Issue番号> <IssueURL>
#
# 人間ゲートは spec の後の1箇所だけ。
#   spec        : 質問状 または 指示書 を投稿して止まる（人が指示書を確認する）
#   impl        : 計画書 → 判定 → 改訂 を APPROVED まで（最大 MAX_ROUNDS 周）→ 実装
#                 → レビュー → 修正 を APPROVED まで → コミットして PR 作成 → コードレビュー
#   review      : impl の後半（レビュー以降）だけを回す。halt したあと人が直して再開する入口
#   code-review : PR への純粋なコードレビュー。impl / review の最後に自動で走る。
#                 単独で叩くのは、PRはできたのに投稿だけ失敗したときの再実行用
#   pr-review   : PR への反論（Devil's Advocate）。コストを見て現在メインフローから外してある。
#                 受入基準そのものを疑わせたいときに人が単独で叩く
#
# 状態は GitHub Issue のコメントに持つ（AI-TAG で種別を識別）。人が同じ場所で経緯を読めるようにするため。
# ローカルの tmp/ は作業用で、消えても Issue から再開できる。
#
# 収束しなかったら止めて人に投げる。自動で先に進めるとレビューが形式だけになるため。

# メッセージ中で変数を展開するときは ${x} と書く。全角文字（）や。）が変数名の直後に来る形で
# $x と書くと、macOS 同梱の bash 3.2 は変数名のパースがマルチバイト非対応なため
# 全角文字の先頭バイトを変数名に取り込み、set -u で unbound variable になる。
# エラー文の中で起きるので、普段は動いていて失敗したときだけ落ちる。
set -uo pipefail

PHASE="${1:?フェーズ名が必要です}"
ISSUE="${2:?Issue番号が必要です}"
ISSUE_URL="${3:?IssueURL が必要です}"

MAX_ROUNDS="${MAX_ROUNDS:-3}"
# 既定値は Makefile にある。直接叩いたとき用のフォールバック
BASE_BRANCH="${BASE_BRANCH:-main}"
export BASE_BRANCH
STRONG="${STRONG_MODEL:-}"
FAST="${FAST_MODEL:-}"

BASE_PROFILE=".claude/phase-permissions.json"
COMMIT_PROFILE=".claude/commit-permissions.json"
PR_REVIEW_PROFILE=".claude/pr-review-permissions.json"

VERDICT_FILE="./tmp/verdict-issue$ISSUE.txt"
COST_LOG="./tmp/cost-issue$ISSUE.txt"
PR_TITLE_FILE="./tmp/pr-title-issue$ISSUE.txt"
PR_BODY_FILE="./tmp/pr-body-issue$ISSUE.md"
export VERDICT_FILE COST_LOG PR_TITLE_FILE PR_BODY_FILE

# コメントファイルは claude-run.sh がプロンプト名から組み立てる {{COMMENT_FILE}} と
# 同じパスでなければならない（./tmp/issue<N>-<プロンプト名>.md）。投稿はこちらで行う。
CODE_REVIEW_FILE="./tmp/issue$ISSUE-code-review.md"
PR_REVIEW_FILE="./tmp/issue$ISSUE-pr-review.md"

# create_pr が作った PR。code-review / pr-review を単独で叩いたときは現在のブランチから引く
PR_URL=""

# 基盤ファイル。案件のコミットに混ざってはいけない（基盤は人が BASE_BRANCH に直接入れる。一覧は prompts/_rules.md / prompts/pr.md と揃える）
# docs/ はこのリポジトリでは案件のドキュメント（docs/development/ 等）にも使っているため、
# フロー自体の導入ガイド（docs/ai-workflow-setup.md）だけをファイル単位で保護する。
# .github/ は CI 設定（.github/workflows/）を人の手だけに残すため。
TOOLING_PATHS='^(Makefile|scripts/|prompts/|\.claude/|docs/ai-workflow-setup\.md|\.gitignore|\.env\.example|\.github/)'

mkdir -p tmp
# コストは Issue 1件あたりで積む。起動ごとに切り詰めると、1周を make impl → make review と
# 分けて回したときに前半の記録が消え、通知の累計が実際より小さく出る（実際に起きたことがある）。
# 追記にして、どこで実行が切り替わったかが読めるように見出し行を1行入れる。
printf '# %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$PHASE" >> "$COST_LOG"

notify() {
  ./scripts/notify-slack.sh "$ISSUE_URL" "$1" \
    || echo "警告: [$PHASE] Slack通知の送信に失敗しました。" >&2
}

# 見出し行（# 始まり）を飛ばして、この Issue にかかった総額を出す
total_cost() { awk '/^[0-9]/ {s+=$1} END {printf "%.2f", s+0}' "$COST_LOG"; }

fail() {
  echo "Error: [$PHASE] $1" >&2
  notify ":x: *$PHASE 中断*
$1

累計コスト: \$$(total_cost)"
  exit 1
}

# 人待ちで止まる。失敗ではないので終了コードは 0
halt() {
  echo "[$PHASE] $1" >&2
  notify "$2

累計コスト: \$$(total_cost)"
  exit 0
}

# 作業ツリーに出ているパスを1行1件、クォートなしで出す。
# 普通の --porcelain は非 ASCII やスペースを含むパスを "docs/\350..." とクォートするので、
# 先頭に " が付いて TOOLING_PATHS の ^ に当たらず、基盤ファイルの改変が素通りする
# （core.quotePath=false でもスペースはクォートされる）。-z はクォートしない。
# リネームは「移動先\0移動元\0」の2件で来るので、両方出す（基盤から出す移動も基盤の改変）。
worktree_paths() {
  local entry
  git status --porcelain -z --untracked-files=all | while IFS= read -r -d '' entry; do
    printf '%s\n' "${entry:3}"
    case "${entry:0:2}" in
      *R*|*C*) IFS= read -r -d '' entry && printf '%s\n' "$entry" ;;
    esac
  done
}

# Write / Edit にパスを付けた権限ルールは効かない（scripts/claude-run.sh 冒頭）。
# 代わりに、基盤ファイルが書き換えられていないかを作業ツリーで確認する。
# .claude/ は Claude Code 自身が書き込みを塞ぐが、prompts/ や scripts/ は素通りする。
# gitignore 対象（.env tmp/）はここに出ない。
tooling_state() {
  worktree_paths | grep -E "$TOOLING_PATHS" | sort || true
}
TOOLING_BEFORE=$(tooling_state)

# 整形チェックの言語依存部分。移植先で直すのはこの3つだけ。
#   format_target : 整形チェックの対象なら真
#   format_ok     : 整形済みなら真。判定は終了コードで返す
#   FORMAT_FIX    : 中断メッセージで案内する、エージェントに掛けさせるコマンド
#
# このリポジトリは現時点で Prettier 等のフォーマッタを導入していないため、
# format_target() を常に偽にして整形チェック自体を無効化してある
# （docs/porting-guide.md §2 A-1 が挙げる「フォーマッタが無い言語・整形を強制しない
# 方針のリポジトリでは常に偽にしてよい」という扱いに従った）。
# フォーマッタを導入したら、対象拡張子の判定を format_target() に、チェックコマンドを
# format_ok() に、案内コマンドを FORMAT_FIX に書き戻す。
format_target() { return 1; }
format_ok() { return 0; }
FORMAT_FIX="(未設定: フォーマッタ未導入)"

# 変更・追加されたファイルが整形済みかを見る。ここでは整形しない。
# シェルが勝手に書き換えると、レビュアーが読んだ差分と実際の差分が食い違うため。
# 対象は作業ツリーに出ているファイルだけなので、コミット済みのファイルは巻き込まない。
unformatted_files() {
  local f out=""
  while IFS= read -r f; do
    format_target "$f" || continue
    [ -f "$f" ] || continue   # 削除・リネーム元は対象外
    format_ok "$f" || out="$out$f
"
  done <<EOF
$(worktree_paths)
EOF
  printf '%s' "$out"
}

# 返答は RESULT に入れる。$(...) の中で fail を呼ぶとサブシェルだけ終わって
# 呼び出し元が続行してしまうため、代入と判定を分けている
RESULT=""
run_step() {
  local label="$1" prompt="$2" model="$3" profile="${4:-$BASE_PROFILE}"
  echo "--- [$PHASE] $label" >&2
  RESULT=$(./scripts/claude-run.sh "$prompt" "$model" "$ISSUE" "$profile")
  local st=$?
  [ $st -eq 0 ] || fail "$label が失敗しました（終了コード ${st}）。"
  if [ "$(tooling_state)" != "$TOOLING_BEFORE" ]; then
    fail "$label が基盤ファイルを書き換えました。フローの土台なのでエージェントには触らせません。git で戻してから再実行してください:
$(tooling_state)"
  fi
  local unformatted
  unformatted=$(unformatted_files)
  if [ -n "$unformatted" ]; then
    fail "$label が整形チェックを通らないファイルを残しました（未整形か、チェック自体が失敗）。${FORMAT_FIX} を掛けてから make review で再開してください:
$unformatted"
  fi
  printf '%s\n' "$RESULT"
}

read_verdict() {
  [ -f "$VERDICT_FILE" ] || return 0
  tr -d '[:space:]' < "$VERDICT_FILE" | tr '[:lower:]' '[:upper:]'
}

# 人間ゲートの実効化。指示書が無いのに先へ進めない。
# 行頭のタグそのものを探す。部分一致にすると「指示書（AI-TAG: INSTRUCTION）がありません」と
# 書いた人のコメントや、このフローについて論じたコメントに当たってゲートが通ってしまう
# （このメッセージ自身がその形をしている）。フローで唯一の人間ゲートを機械的に担保している
# 場所なので、緩い一致で済ませてはいけない。
#
# gh issue view の出力を直接 grep -q にパイプしないこと（実測でハマった）。
# コメントが増えて出力が大きくなると、grep -q は先頭付近でマッチした時点で読み込みをやめて
# 終了するため、まだ書き込み中の gh 側が SIGPIPE を受けて終了コード 141 で終わる。
# set -o pipefail の下では、grep 自身はマッチに成功していてもパイプライン全体が失敗扱いになり、
# 指示書が実在するのに「指示書がありません」で落ちる。一時ファイルに落としてから grep すれば
# 書き込み側にパイプが無くなるので、この競合は起きない。
require_instruction() {
  local tmp matched=1
  tmp=$(mktemp) || fail "一時ファイルを作れませんでした。"
  gh issue view "$ISSUE" --comments >"$tmp" 2>/dev/null
  grep -q '^<!-- AI-TAG: INSTRUCTION -->' "$tmp" || matched=0
  rm -f "$tmp"
  [ "$matched" -eq 1 ] \
    || fail "Issue #$ISSUE に指示書がありません。先に make spec を実行し、指示書を人が確認してください。"
}

# push と PR 作成はエージェントに渡さず、ここで行う。
# 外向きの操作の直前に、ブランチ名とコミット対象を機械的に検査したいため。
# 権限ルールの列挙で危険な push の形を塞ぐのは漏れるので、そもそも渡さない。
create_pr() {
  local branch title body_lines mixed commits
  branch=$(git branch --show-current)

  case "$branch" in
    feature/*) ;;
    "") fail "HEAD が detached です。PRを作れません。" ;;
    *)  fail "ブランチ名が feature/ で始まっていません（${branch}）。案件の変更は feature/ ブランチに載せる決まりです。" ;;
  esac

  # ベースが無いと、下の混入検査は git diff のエラーを || true が飲んで素通りする。先に確かめる
  git rev-parse --verify --quiet "origin/${BASE_BRANCH}" >/dev/null \
    || fail "origin/${BASE_BRANCH} が見つかりません。Makefile の BASE_BRANCH が既定ブランチと合っているか確認してください。"

  commits=$(git rev-list --count "origin/${BASE_BRANCH}..${branch}")
  [ "$commits" -gt 0 ] || fail "origin/${BASE_BRANCH} と差がありません。エージェントがコミットしていない可能性があります。"

  # 案件のコミットに基盤ファイルが混ざっていないか。
  # -z はクォート対策（worktree_paths と同じ理由）。--no-renames は、リネームだと
  # 移動先しか出ず、基盤から外へ出す移動を見落とすため。
  mixed=$(git diff --name-only -z --no-renames "origin/${BASE_BRANCH}..${branch}" | tr '\0' '\n' | grep -E "$TOOLING_PATHS" || true)
  if [ -n "$mixed" ]; then
    fail "案件のコミットに基盤ファイルが混ざっています。別コミットにしてください:
$mixed"
  fi

  title=$(head -n 1 "$PR_TITLE_FILE")
  [ -n "$title" ] || fail "$PR_TITLE_FILE が空です。"
  body_lines=$(wc -l < "$PR_BODY_FILE" | tr -d ' ')
  [ "$body_lines" -gt 0 ] || fail "$PR_BODY_FILE が空です。"

  echo "--- [$PHASE] push と PR 作成（make が実行）" >&2
  git push -u origin "$branch" >&2 || fail "push に失敗しました。"

  PR_URL=$(gh pr create --base "$BASE_BRANCH" --head "$branch" \
    --title "$title" --body-file "$PR_BODY_FILE") \
    || fail "gh pr create に失敗しました。ブランチは push 済みなので、PRは手で作れます。"

  echo "$PR_URL" >&2
  notify ":white_check_mark: *review 完了 — PRを作成しました*（レビューは${round}周目で承認）
$PR_URL

マージ前に人が確認してください。

$RESULT

累計コスト: \$$(total_cost)"
}

[ -n "$STRONG" ] || fail "STRONG_MODEL が空です。CLAUDE_CODE_OPUS_MODEL を確認するか、.env に STRONG_MODEL を書いてください（.zshrc 定義の場合、非対話実行では読まれません）。"
[ -n "$FAST" ]   || fail "FAST_MODEL が空です。CLAUDE_CODE_SONNET_MODEL を確認するか、.env に FAST_MODEL を書いてください。"

# 実装レビューの判定モデルだけ差し替えられるようにしてある。既定は強モデル。
# review-judge は実装を相手にするのでテスト実行・整形チェック・差分で裏を取れる
# （差し戻しが「指示書が挙げた複数文書のうち1つが未更新」の突き合わせだったことがある）。
# 高速モデルで足りるかを、案件を重ねながら A/B する。REVIEW_JUDGE_MODEL=fast で切り替える。
#
# plan-judge は分けていない。あちらは文章同士（指示書 vs 計画書）の突き合わせで実行による
# 裏取りができず、差し戻しが「提案されたテストは実装を壊しても通る」という、プロンプトが
# 要求していない推論だったことがある。高速モデルに落とすと最初に失われる種類の指摘。
#
# 実際に使ったモデルIDは claude-run.sh がステップごとに stderr へ出すので、
# どちらで回したかはログで区別できる。
case "${REVIEW_JUDGE_MODEL:-}" in
  ""|strong) REVIEW_JUDGE="$STRONG" ;;
  fast)      REVIEW_JUDGE="$FAST" ;;
  *)         REVIEW_JUDGE="$REVIEW_JUDGE_MODEL" ;;
esac

phase_spec() {
  PHASE=spec
  : > "$VERDICT_FILE"
  run_step "指示書の作成" prompts/spec.md "$STRONG"
  case "$(read_verdict)" in
    INSTRUCTION_READY)
      halt "指示書ができました。人の確認待ちです。" ":memo: *spec 完了 — 指示書ができました*
確認して問題なければ \`make impl ISSUE=$ISSUE\` に進んでください。直したいところがあれば Issue にコメントして \`make spec ISSUE=$ISSUE\` を再実行してください。

$RESULT"
      ;;
    NEED_ANSWERS)
      halt "質問状を投稿しました。回答待ちです。" ":raising_hand: *spec — 回答待ち*
質問状を投稿しました。Issue にコメントで回答してから \`make spec ISSUE=$ISSUE\` を再実行してください。

$RESULT"
      ;;
    *)
      fail "判定ファイルの内容が想定外です: '$(read_verdict)'（INSTRUCTION_READY か NEED_ANSWERS を期待）。Issue のコメントを確認してください。"
      ;;
  esac
}

phase_impl() {
  PHASE=impl
  require_instruction
  run_step "実装計画書・テストシナリオの作成" prompts/plan.md "$FAST"

  round=1
  while : ; do
    : > "$VERDICT_FILE"
    run_step "指示書との齟齬判定 ${round}/${MAX_ROUNDS} 周" prompts/plan-judge.md "$REVIEW_JUDGE"
    verdict=$(read_verdict)
    [ "$verdict" = "APPROVED" ] && break
    [ "$verdict" = "CHANGES_REQUESTED" ] \
      || fail "判定ファイルの内容が想定外です: '$verdict'（APPROVED か CHANGES_REQUESTED を期待）。"
    if [ "$round" -ge "$MAX_ROUNDS" ]; then
      halt "${MAX_ROUNDS}周しても計画が承認されませんでした。" ":raising_hand: *impl — 計画が収束しませんでした*
${MAX_ROUNDS}周しても指示書との齟齬が解消しませんでした。Issue のやり取りを読んで、指示書の受入基準を見直してください。受入基準が曖昧なときにこうなります。

$RESULT"
    fi
    run_step "計画の改訂" prompts/plan-revise.md "$FAST"
    round=$((round + 1))
  done

  run_step "実装" prompts/implement.md "$FAST"
  notify ":hammer: *実装できました*（計画は${round}周目で承認）
このままレビューに進みます。

$RESULT

ここまでのコスト: \$$(total_cost)"
}

phase_review() {
  PHASE=review
  require_instruction

  round=1
  while : ; do
    : > "$VERDICT_FILE"
    run_step "実装レビュー ${round}/${MAX_ROUNDS} 周" prompts/review-judge.md "$REVIEW_JUDGE"
    verdict=$(read_verdict)
    [ "$verdict" = "APPROVED" ] && break
    [ "$verdict" = "CHANGES_REQUESTED" ] \
      || fail "判定ファイルの内容が想定外です: '$verdict'（APPROVED か CHANGES_REQUESTED を期待）。"
    if [ "$round" -ge "$MAX_ROUNDS" ]; then
      halt "${MAX_ROUNDS}周しても実装が承認されませんでした。" ":raising_hand: *review — レビューが収束しませんでした*
${MAX_ROUNDS}周しても受入基準の未達が残りました。作業ツリーの差分と Issue のやり取りを確認してください。

$RESULT"
    fi
    run_step "指摘の修正" prompts/review-fix.md "$FAST"
    round=$((round + 1))
  done

  : > "$PR_TITLE_FILE"
  : > "$PR_BODY_FILE"
  run_step "コミットとPR本文の作成" prompts/pr.md "$STRONG" "$COMMIT_PROFILE"
  create_pr
}

# PR ができた後の純粋なコードレビュー。判定ではないので、ここで何が出ても PR は閉じない
# （マージの判断は人）。review-judge は AC を満たしているかしか見ないため、AC に書かれていない
# バグ・セキュリティ・エラー処理の抜けをここで補う。
#
# 権限は pr-review のプロファイルを使い回す。このフェーズに git restore は要らないが、
# ベースのプロファイルと違って gh issue comment を渡していない点が要る（投稿先は PR で、
# Issue に書かせない）。
#
# gh pr はエージェントに渡していないので、本文はファイルに書かせて投稿はここで行う。
phase_code_review() {
  PHASE=code-review
  local url before after

  url="${PR_URL:-$(gh pr view --json url -q .url 2>/dev/null)}"
  [ -n "$url" ] || fail "PR が見つかりません。現在のブランチに対応する PR があるか確認してください。"

  # このフェーズはコードを直さない決まりだが、Write / Edit はパスを絞れないので渡っている。
  # run_step の検査は基盤ファイルと未整形のファイルしか見ず、整形済みの書き換えは素通りする。
  # PR は push 済みなので、直されても PR には入らず作業ツリーにだけ残る。前後比較で捕まえる。
  before=$(git status --porcelain --untracked-files=all)

  : > "${CODE_REVIEW_FILE}"
  run_step "コードレビュー" prompts/code-review.md "$STRONG" "$PR_REVIEW_PROFILE"

  after=$(git status --porcelain --untracked-files=all)
  if [ "$after" != "$before" ]; then
    fail "コードレビューが作業ツリーを変更したまま終わりました。このフェーズはコードを直しません。git restore で戻してから make code-review ISSUE=$ISSUE で再実行してください:
$after"
  fi

  [ -s "${CODE_REVIEW_FILE}" ] \
    || fail "${CODE_REVIEW_FILE} が空です。PRは作成済みなので make code-review ISSUE=$ISSUE で再実行できます。"

  gh pr comment "$url" --body-file "${CODE_REVIEW_FILE}" >&2 \
    || fail "PRへのコメント投稿に失敗しました。本文は ${CODE_REVIEW_FILE} に残っています。"

  notify ":mag: *PRへのコードレビューを投稿しました*
${url}

判定ではありません。マージするかどうかは人が決めます。

$RESULT

累計コスト: \$$(total_cost)"
}

# PR ができた後の反論レビュー（Devil's Advocate）。現在メインフローからは外してある。
# 受入基準そのものが間違っていなかったかを問う。単独実行は make pr-review で可能。
#
# gh pr はエージェントに渡していないので、本文はファイルに書かせて投稿はここで行う。
phase_pr_review() {
  PHASE=pr-review
  local url before after

  url="${PR_URL:-$(gh pr view --json url -q .url 2>/dev/null)}"
  [ -n "$url" ] || fail "PR が見つかりません。現在のブランチに対応する PR があるか確認してください。"

  # 主張2（テストを壊して落ちるか見る）で書き換えた実装が戻っているかを、前後の比較で見る。
  # 整形チェックは素通りする（壊した行が整形済みなら通る）ので、ここで見るしかない。
  before=$(git status --porcelain --untracked-files=all)

  : > "$PR_REVIEW_FILE"
  run_step "PR への反論レビュー" prompts/pr-review.md "$STRONG" "$PR_REVIEW_PROFILE"

  after=$(git status --porcelain --untracked-files=all)
  if [ "$after" != "$before" ]; then
    fail "反論レビューが作業ツリーを変更したまま終わりました。壊した実装を git restore で戻してから make pr-review ISSUE=$ISSUE で再実行してください:
$after"
  fi

  [ -s "$PR_REVIEW_FILE" ] \
    || fail "$PR_REVIEW_FILE が空です。PRは作成済みなので make pr-review ISSUE=$ISSUE で再実行できます。"

  gh pr comment "$url" --body-file "$PR_REVIEW_FILE" >&2 \
    || fail "PRへのコメント投稿に失敗しました。本文は $PR_REVIEW_FILE に残っています。"

  notify ":smiling_imp: *PRへの反論レビューを投稿しました*
$url

判定ではありません。マージするかどうかは人が決めます。

$RESULT

累計コスト: \$$(total_cost)"
}

# impl はレビューまで通す。実装できた時点で人に返す理由がなく、レビューの指摘は
# 高速モデルが直せるため。収束しなければ halt して人に投げるので、止まる場所は変わらない。
# review 単独は、halt から人が直して再開するときの入口として残してある。
# code-review 単独は、投稿だけ失敗したときの再実行用。
# pr-review（Devil's Advocate）はメインフローから外してある。単独実行は残す。
case "$PHASE" in
  spec)        phase_spec ;;
  impl)        phase_impl; phase_review; phase_code_review ;;
  review)      phase_review; phase_code_review ;;
  code-review) phase_code_review ;;
  pr-review)   phase_pr_review ;;
  *)           fail "不明なフェーズです: ${PHASE}（spec / impl / review / code-review / pr-review のいずれか）" ;;
esac
