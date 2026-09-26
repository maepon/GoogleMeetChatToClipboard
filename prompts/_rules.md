---

# 共通ルール（全フェーズ）

## シェルコマンドの書き方

**1回の呼び出しで1コマンド、単独形で書く。** Claude Code は権限判定のためにコマンドを
分割するので、次の形は**許可済みのコマンドでも拒否される**。これはどのコマンドにも当てはまる。

- `cd X && cmd` / `cmd1; cmd2` / `cmd1 && cmd2` — 複合コマンド
- `for … do … done` などの制御構文
- `VAR=値 cmd` の変数代入前置、コマンド置換、パイプ、ヒアドキュメント
- `git -C <path>` — `-C` 形は許可していない
  （`git -C` は `git push` の deny を迂回できるため意図的に外してある）

**このリポジトリはフラットな単一パッケージ**（サブモジュールやモノレポ分割は無い）。

**`npm test`（`test/v6_dom_test.js`）による自動テストがあります。** JSDOM 上で
`content.js` / `modules/` の DOM 挙動を検証する、独自の PASS/FAIL 集計を持つ単一の
テストスクリプトです。新しいテストケースはこのファイルに追記します（既存の
`createEnvironment` 等のヘルパーとテストケースの書き方に合わせる）。標準的な
テストフレームワーク（Jest 等）は使っていません。

**Prettier 等のフォーマッタは現時点で導入していません。** そのため整形チェックは
無効化してあります（`scripts/run-phase.sh` の `format_target()`）。

`test/v6_dom_test.js` の対象は Google Meet の DOM に依存する挙動です。ロケール
ファイルの構造検証や `manifest.json` の値検査など、DOM に依存しない静的ファイルの
確認は、`tmp/` の下に確認用スクリプトを `Write` で作り、`node tmp/<ファイル名>.js`
として実行し、対象の値やファイルを直接読んで確かめる方法を使います。

`cd` は許可済みで、**カレントディレクトリは呼び出しをまたいで持続する**が、
このリポジトリではルート以外に移動する必要はない。

終了コードは呼び出しの結果に出るので、`; echo "$?"` を付ける必要はない。

**テスト用の入力ファイルは `Write` ツールで作る。** `cp` は許可していない
（`cp ./.env /tmp/x` で `Read(./.env)` の deny を迂回できてしまうため）。
`mkdir` は許可済みなので、`tmp/` の下に作業ディレクトリを作ってから Write で置く。

## Issue へのコメント投稿

必ずこの手順で行う。

1. 本文を Write ツールで `{{COMMENT_FILE}}` に書く
2. 単独のコマンドとして `gh issue comment {{ISSUE}} --body-file {{COMMENT_FILE}}` を実行する

## 判定ファイル

判定を求められたフェーズは、`{{VERDICT_FILE}}` に**指定された1語だけ**を Write ツールで書く。
説明文や前後の飾りを足さない。make がこのファイルを読んで次に進むかを決めるため、
1語以外が入っていると人待ちで止まる。

## この案件の約束

- ルートの `CLAUDE.md` / `README.md` に従う
- 基盤ファイル（`Makefile`、`scripts/`、`prompts/`、`.claude/`、`docs/ai-workflow-setup.md`、`.gitignore`、`.env.example`、`.github/`）は変更しない
  （案件の変更対象になるドキュメントは `README.md` / `CLAUDE.md` / `docs/development/` など、この案件側のものだけ。
  `docs/` 配下は `docs/ai-workflow-setup.md` 以外は自由に変更してよい）
- Slack 通知は自分で送らない。make が送る
