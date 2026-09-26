#!/bin/bash
# 基盤ファイルの静的検査。make の各フェーズが走る前に通す。使い方: ./scripts/check-scripts.sh
#
# フローの fail / halt はフェーズが失敗したときにしか通らない経路なので、書いたまま一度も
# 実行されずに残る。実際に踏んだことがあり、原因は「エラー文の中の変数展開」だった。
# 静かに壊れて、壊れていることが失敗したときにしか分からない種類のバグだけをここで見る。
#
# 検査は使うたびに走るので、外部コマンドは macOS 同梱のものだけで済ませる。
# システムの grep は BSD grep で -P が無いため、バイト単位の判定は awk に寄せている。
set -uo pipefail

status=0
ng() { echo "NG: $1" >&2; status=1; }

# 1. シェルの文法。実行しないと分からない範囲は見られないが、タイプミスはここで落ちる
for f in scripts/*.sh; do
  bash -n "${f}" 2>/dev/null || ng "${f}: bash -n が通りません。"
done

# 2. 変数展開の直後に非 ASCII 文字が来る形（${x} と書かねばならない箇所）。
#    macOS 同梱の bash 3.2 は変数名のパースがマルチバイト非対応で、後続文字の先頭バイトを
#    変数名に取り込む。set -u と組み合わさると unbound variable で落ちる。
#    全角文字に限らず非 ASCII 全般（é でも落ちる）なので、バイト値で見る。
#    $1 のような位置パラメータは1桁で切れるので対象外。
offenders=$(LC_ALL=C awk '
  /\$[A-Za-z_][A-Za-z_0-9]*[\200-\377]/ { printf "  %s:%d: %s\n", FILENAME, FNR, $0 }
' scripts/*.sh Makefile)
if [ -n "${offenders}" ]; then
  ng "変数展開の直後に非 ASCII 文字が来ています。bash 3.2 が変数名を取り違えるので \${x} と書いてください:
${offenders}"
fi

# 3. 権限プロファイル。JSON が壊れているとフェーズは起動してから落ちる（課金が発生する）
for p in .claude/*-permissions.json; do
  jq -e . "${p}" >/dev/null 2>&1 || { ng "${p}: JSON として読めません。"; continue; }

  # どのプロファイルでも塞がっていなければならない操作。deny は前置一致でベースコマンドの
  # allow にも勝つ。allow していないコマンドはそもそも拒否されるので、これは二重の防御。
  deny=$(jq -r '.permissions.deny[]' "${p}")
  while IFS= read -r rule; do
    printf '%s\n' "${deny}" | LC_ALL=C grep -qxF "${rule}" \
      || ng "${p}: deny に ${rule} がありません。"
  done <<'EOF'
Read(./.env)
Bash(git push)
Bash(git push:*)
Bash(gh pr:*)
Bash(rm:*)
Bash(git rebase:*)
Bash(git reset --hard:*)
EOF

  # 通してはいけないコマンドが allow に混ざっていないか。
  # ファイルを読める汎用コマンド（grep / cat / sed / awk / head / cp）は Read(./.env) の
  # deny を素通りできる。git -C / go -C は前置一致をずらして git push の deny を迂回できる。
  # シェルとインタプリタは、裸か一行実行（-c / -e / -p）か -m の後ろが空の形だと1コマンドで何でも走る。
  # python -m pytest:* のようにモジュール名まで絞った形は通す。
  bad=$(jq -r '.permissions.allow[]' "${p}" \
    | LC_ALL=C grep -E 'Bash\((grep|cat|sed|awk|head|tail|cp|mv|chmod|curl|ln|tee|xargs|find|git -C|go -C|bash|sh|zsh|env|eval|exec)[ :)]|Bash\((python3?|node|ruby|perl|deno|bun|npx)(:|\)| -[cepE][ :)]| -m[:)])|Bash\(git:|Bash\(gh:|Bash\(\*|Bash\(:' || true)
  if [ -n "${bad}" ]; then
    ng "${p}: allow に通してはいけないコマンドがあります:
${bad}"
  fi
done

# 4. 人間ゲートの実効化に使っているタグが、プロンプト側の指示と一致しているか。
#    run-phase.sh の require_instruction はこの文字列を行頭で探して spec の後の
#    人間ゲートを担保している。プロンプトを書き換えてタグ名がずれると、ゲートは
#    「常に失敗する」のではなく「常に通らない」側に倒れる（気づけるが止まる）。
#    逆に require_instruction 側だけを緩めると、ゲートが静かに無効になる。
LC_ALL=C grep -qF '<!-- AI-TAG: INSTRUCTION -->' prompts/spec.md \
  || ng "prompts/spec.md が <!-- AI-TAG: INSTRUCTION --> を書かせていません。run-phase.sh の require_instruction が探すタグです。"
LC_ALL=C grep -qF "'^<!-- AI-TAG: INSTRUCTION -->'" scripts/run-phase.sh \
  || ng "scripts/run-phase.sh の require_instruction が行頭アンカー付きで指示書タグを探していません。本文中の言及に一致してゲートが無効になります。"

# 5. ベースブランチの直書き。PR のベースは Makefile の BASE_BRANCH だけで決める。
#    直書きが1つ残ると、BASE_BRANCH を変えたときにそこだけ古いブランチを見る。
#    create_pr の混入検査がそうなると git diff のエラーを飲んで素通りする（静かに壊れる）。
#    変数（${BASE_BRANCH}）とプレースホルダ（{{BASE_BRANCH}}）の形は英数字で始まらないので当たらない。
offenders=$(LC_ALL=C grep -nE 'origin/[A-Za-z0-9_]|--base +[A-Za-z0-9_]' scripts/*.sh prompts/*.md || true)
if [ -n "${offenders}" ]; then
  ng "ベースブランチが直書きされています。\${BASE_BRANCH} か {{BASE_BRANCH}} を使ってください（値は Makefile の BASE_BRANCH）:
${offenders}"
fi

[ "${status}" -eq 0 ] && echo "check: 基盤ファイルの静的検査は問題なしです。"
exit "${status}"
