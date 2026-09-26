# TC-1.4 NG 調査報告および最終対応方針書 (Rev 2)

`docs/v6/test_result/result001.md` にてご報告いただいた **TC-1.4（通話退出時の退出後 UI 不表示）の NG** について、分析結果、設計レビューでの改善フィードバック、および確定修正仕様をまとめました。

---

## 1. 現事象と不具合の要約

- **対象テスト**: TC-1.4（通話の「退出ボタン（赤色電話アイコン）」をクリックして退出する）
- **期待結果**: 画面上に「退出後のチャット保存 UI（テキストエリア＋コピーボタン）」が挿入され、退出前のログがコピー可能であること。
- **実際の現象**: 退出ボタンをクリックして退出した後、画面上に退出後 UI（テキストエリア＋コピーボタン）が差し込まれない。

---

## 2. 根本原因の技術的分析

コード解析の結果、以下の **2つの技術的要因** により退出後 UI の挿入ロジックが阻害されていました。

### 原因 ①: `activeContainer.contains(removeMessageElement)` による誤ガード
- **コード箇所**: `content.js`（`removedMessageObserver` コールバック内）
  ```javascript
  const activeContainer = (AppState.chatContainerRoomId === AppState.currentRoomId)
      ? AppState.chatContainerElement
      : null;

  if (!activeContainer || !activeContainer.contains(removeMessageElement)) {
      return; // ★ここで処理が中断されていた
  }
  ```
- **発生メカニズム**:
  Google Meet で通話から退出すると、通話中のチャット一覧コンテナ (`chatContainer`: `div[jsname="xySENc"][aria-live="polite"]`) は画面上から削除・非表示になります。一方、退出メッセージ要素 (`removeMessageElement`: `.lAqQo .roSPhc[jsname="r4nke"]`) は退出後の新画面（「通話から退出しました」の画面）に独立して生成されます。
  そのため、`activeContainer.contains(removeMessageElement)`（「退出要素が通話中のチャットコンテナ配下に存在するか」）の判定が **100% 偽 (`false`)** となり、挿入処理が実行されません。

### 原因 ②: `chatOutputFlag` の二重責務による判定ブロック
- **発生メカニズム**:
  通話の退出ボタンをクリックした際、`saveChat()` が実行され、内部で `AppState.chatOutputFlag = true` がセットされていました。
  `chatOutputFlag` が「コピー成功」と「退出後 UI 挿入済み」の両方のフラグとして混同されていたため、退出ボタンでコピーが成功した時点で `chatOutputFlag` が `true` になり、直後に発火した `removedMessageObserver` の `if (AppState.chatOutputFlag === false)` チェックで UI 挿入がスキップされていました。

---

## 3. 確定対応方針（詳細設計）

レビューフィードバックに基づき、以下の確実かつ堅牢な設計に変更いたします。

### ① `chatOutputFlag` の責務分離
- `chatOutputFlag` を廃止・分離し、状態を明確に定義します。
  - `AppState.tmpChatLogText`: 一時保存されたチャットログ文字列
  - `AppState.exitedUIInserted`: 退出後 UI が挿入されたかを示すフラグ（初期値 `false`）
- `saveChat()` 実行時は `AppState.tmpChatLogText` へのログ保持とクリップボード書き込みのみを行い、`exitedUIInserted` を汚染しないようにします。

### ② `removedMessageObserver` の判定条件の最適化
- 誤った `activeContainer.contains(removeMessageElement)` チェックを削除。
- 以下のマルチガードを適用します。
  1. `isSaveTarget(document, SELECTORS)` であること。
  2. `!removeMessageElement.hasAttribute('data-gmctc-processed')` であること（未処理要素）。
  3. `!document.querySelector('#' + IDS.chatLogTextArea)`（DOM 上に既に UI テキストエリアが存在しないこと）。
  4. `AppState.tmpChatLogText !== ''` であること（ログが存在する場合のみ UI を生成。空ログ時は生成しない仕様）。

### ③ 二重挿入防止とマーク処理
- UI 挿入時（または空ログによるスキップ時）に `removeMessageElement.setAttribute('data-gmctc-processed', 'true')` を付与し、繰り返し処理を防止。

---

## 4. 実機環境での確認事項

修正コードを適用するにあたり、以下の実機 Console 確認を実施します。

- 通話退出後の画面でデベロッパーツール (Console) を開き、以下を実行：
  ```javascript
  // 1. 退出メッセージ要素が存在するか
  document.querySelector('.lAqQo .roSPhc[jsname="r4nke"]')

  // 2. 退出後画面でも div.hsLqkc が DOM 上に残っているか
  document.querySelector('div.hsLqkc')
  ```

---

上記設計・方針に基づき、コード修正を実施いたします。
