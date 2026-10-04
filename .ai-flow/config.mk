# issue-to-pr-flow のプロジェクト設定。ai-flow/Makefile が include する。
# 書式と各値の意味は ai-flow/examples/project/.ai-flow/config.mk と ai-flow/docs/setup.md を参照。
# エージェントはフローのディレクトリ（ai-flow/）をカレントにしてコマンドを実行する。
# npm test はルートの package.json を自分で見つけるのでそのままでよい。

# PR のベースブランチ
BASE_BRANCH = main

# テスト一式（JSDOM 上で content.js / modules/ の DOM 挙動を検証する独自スクリプト test/v6_dom_test.js）
TEST_CMD = npm test

# 使い捨ての確認スクリプト（ai-flow/tmp/ の下に置く）を1本走らせる。ファイル名が後ろに付く。
# DOM に依存しない受入基準（ロケールファイルの構造、manifest.json の値など）の確認に使う
SCRATCH_TEST_CMD = node

# フォーマッタは未導入なので FORMAT_* はすべて空（整形の手順がプロンプトから消え、ファイルごとの検査も飛ばされる）
FORMAT_CHECK_CMD =
FORMAT_FILE_CMD =
FORMAT_FIX_CMD =
FORMAT_GLOBS =

# Issue コメント・コミット・PR などの人向け出力の言語
OUTPUT_LANG = Japanese
