<!--
プロジェクト文脈。全プロンプトの末尾に「Project context」見出しの下で挿入される（ここにトップレベル見出しを書かない）。
毎ステップ課金されるので短く保つ。{{ROOT_REL}} / {{FLOW_DIR}} は埋められる。
-->
- ルートの `CLAUDE.md` と `README.md` に従う。仕様を確かめるときは必ず読む。特に `CLAUDE.md` の「報告・レビュー・品質基準ルール」（誇大表現の禁止、P0/P1/P2 分類は `docs/v6/scope_and_edge_case_policy.md` が唯一の真実源）を守る
- プロジェクトのファイルはルートからの相対パスで読む（例: `{{ROOT_REL}}content.js`、`{{ROOT_REL}}modules/ChatManager.js`）。リポジトリはフラットな単一パッケージで、Manifest V3 の Chrome 拡張機能
- 自動テストは `npm test`（`{{ROOT_REL}}test/v6_dom_test.js`）。標準のテストフレームワークではなく、JSDOM 上で `content.js` / `modules/` の DOM 挙動を検証する独自の PASS/FAIL 集計スクリプト。新しいテストケースはこのファイルに追記し、既存の `createEnvironment` などのヘルパーとケースの書き方に合わせる
- DOM に依存しない受入基準（`_locales/` のロケールファイルの構造、`manifest.json` の値など）は、`tmp/` の下に確認用スクリプトを `Write` で作り `node tmp/<ファイル名>.js` で確かめる。スクリプトから読むパスは `{{ROOT_REL}}` 起点で書く
- Google Meet の内部セレクター（`content.js` の `SELECTORS`）は実機の DOM に依存する。実機でしか確かめられないことは推論で「動作する」と書かず、手動確認が必要と明記する
- 変更に応じて更新しうるドキュメント: `README.md`（変更履歴を含む）/ `CLAUDE.md` / ルートの `docs/`。バージョンを上げる変更では `manifest.json` と `package.json` の version を揃える
