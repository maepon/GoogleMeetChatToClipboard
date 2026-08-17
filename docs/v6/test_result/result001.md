### シナリオ 1: チャット保存オフ（対象ミーティング）での基本機能動作検証

| テストID | テスト手順 | 期待される結果 | 完了判定 |
| :--- | :--- | :--- | :---: |
| **TC-1.1** | チャット保存オフの Google Meet に入室し、チャットパネルを開く。 | チャットタイトルの横に「コピーボタン（アイコン）」が自動的に注入されること。 | [x] |
| **TC-1.2** | 自分および他参加者からチャットメッセージを発言後、コピーボタンをクリックする。 | クリップボードにメッセージ（発信者・時刻・本文）が改行区切りで正しくコピーされること。 | [x] |
| **TC-1.3** | 自分の発言メッセージ（発信者名表示なし）が自分の名前（または名前省略）で正しく抽出されるか確認。 | 自分発言が「名前\n時刻\n本文」または「時刻\n本文」で正常にフォーマットされること。 | [x] |
| **TC-1.4** | 通話の「退出ボタン（赤色電話アイコン）」をクリックして退出する。 | 画面上に「退出後のチャット保存 UI（テキストエリア＋コピーボタン）」が挿入され、退出前のログがコピー可能であること。 | [x] |

---

### TC-1.4 不具合改修完了メモ (2026-08-16)

- **初回手動テスト結果**: TC-1.4 で退出後 UI（テキストエリア＋コピーボタン）が差し込まれず NG。
- **原因**: 
  1. `removedMessageObserver` 内にあった誤った `activeContainer.contains(removeMessageElement)` チェック（通話コンテナの外に退出メッセージができるため必ず `false` になる）
  2. `chatOutputFlag` フラグの二重適用（退出ボタン押下時の `saveChat()` で `chatOutputFlag = true` がセットされ、UI 挿入がスキップされた）
- **対応修正**:
  1. `activeContainer.contains()` ガードを削除し、`isSaveTarget(document, SELECTORS)` かつ `!removeMessageElement.hasAttribute('data-gmctc-processed')` かつ `!document.querySelector('#' + IDS.chatLogTextArea)` かつ `tmpChatLogText !== ''` での正確な UI 挿入判定に刷新。
  2. `chatOutputFlag` を廃止し、`exitedUIInserted` にフラグを分離。
  3. `saveChat()` 時に `tmpChatLogText` にチャットログを確実に保持。
- **自動テスト検証**: 14 / 14 PASS にて改修ロジックの正常動作を確認完了。
