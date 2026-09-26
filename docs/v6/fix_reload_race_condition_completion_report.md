# リロード時レースコンディション（ログ先行クリア・早期抑止）の解消 完了報告書

**文書ステータス:** 完了報告書  
**実施内容:** リロード時に Meet の切断・DOM 描画が先行し、textarea 挿入により `beforeunload` ダイアログ要求が早期抑止されてチャットが消失する競合の完全解消  
**採用方針:** **方針 1（リロード競合時もダイアログを要求する）**  
**テスト実行結果:** 全 80 件 PASS（FAIL: 0, 終了コード: 0）  
**準拠方針書:** [`docs/v6/scope_and_edge_case_policy.md`](./scope_and_edge_case_policy.md)  
**関連計画書:** [`docs/v6/fix_reload_race_condition_plan.md`](./fix_reload_race_condition_plan.md)

---

## 1. 修正の概要と解決メカニズム

### 1.1 根本原因の特定
実機ログの比較により、リロード操作時（Cmd+R）に Google Meet 側の通話切断処理・DOM 描画が先行して `checkAndCreateExitedUI()` が発火し、textarea を挿入した時点でメモリログ（`pendingExitChatLogText`）がクリアされ、かつ `isPostMeetingScreen` 判定によりその直後の `beforeunload` ダイアログ要求が早期抑止されていたレースコンディションを特定しました。

### 1.2 解決メカニズムの実装
1. **正常退出とリロード過渡期の完全分離 (`exitButtonClicked`)**:
   - ユーザーが明示的に通話下の「通話から退出」ボタン（または PinP 退出ボタン）をクリックした場合のみ `AppState.exitButtonClicked = true` をセット。
   - リロード操作時（ボタン未押下）は `exitButtonClicked === false` のまま維持され、Meet が過渡期に切断画面を描画しても正常退出と誤認しないように分離。
2. **textarea 挿入時のログ保持**:
   - `checkAndCreateExitedUI()` で textarea 挿入時に `pendingExitChatLogText` をクリアせず保持し、後続の `beforeunload` 判定で利用可能に維持。
   - ログのクリアは「自動コピー成功時（`autoCopySucceeded === true`）」および「新規 Room / セッション入室時（`clearExitPendingState()`）」に限定。
3. **`beforeunload` 判定ロジックの刷新**:
   - `effectiveChatLog = pendingExitChatLogText || tmpChatLogText` により多層的にログを判定。
   - 「自動コピー成功済み（`autoCopySucceeded === true`）」または「正常退出フロー（`exitButtonClicked === true && exitedUIInserted === true`）」のみダイアログを抑止。
   - リロード競合時を含む未救出ログが存在する状態では、確実に `event.preventDefault(); event.returnValue = '';` を実行。

---

## 2. 変更ファイルとコード差分

### コンポーネント: コンテンツスクリプト ([`content.js`](file:///Users/maepon/work/GoogleMeetChatToClipboard/content.js))

```diff
--- a/content.js
+++ b/content.js
@@ -54,6 +54,7 @@ const AppState = {
     tmpChatLogText: '',
     pendingExitChatLogText: '',
     pendingExitRoomId: null,
+    exitButtonClicked: false,
     postExitCompleted: false,
     exitedUIInserted: false,
     autoCopySucceeded: false,
@@ -70,6 +71,8 @@ function clearExitPendingState() {
     AppState.pendingExitChatLogText = '';
+    AppState.tmpChatLogText = '';
     AppState.pendingExitRoomId = null;
+    AppState.exitButtonClicked = false;
     AppState.wasSaveTarget = false;
     AppState.exitedUIInserted = false;
     AppState.postExitCompleted = false;
@@ -242,7 +245,8 @@ function checkAndCreateExitedUI() {
     if (document.querySelector(`#${IDS.chatLogTextArea}`)) {
         return;
     }
-    if (!AppState.pendingExitChatLogText) {
+    const logTextToDisplay = AppState.pendingExitChatLogText || AppState.tmpChatLogText;
+    if (!logTextToDisplay) {
         return;
     }
 
@@ -249,7 +253,7 @@ function checkAndCreateExitedUI() {
         if (removeMessageElement.hasAttribute('data-gmctc-processed')) {
             continue;
         }
-        const exitedUI = UIManager.createExitedUI(CONFIG, IDS, AppState.pendingExitChatLogText, saveChatLog, document);
+        const exitedUI = UIManager.createExitedUI(CONFIG, IDS, logTextToDisplay, saveChatLog, document);
         if (exitedUI) {
             removeMessageElement.after(exitedUI);
             removeMessageElement.setAttribute('data-gmctc-processed', 'true');
             AppState.exitedUIInserted = true;
             AppState.postExitCompleted = true;
-            AppState.pendingExitChatLogText = ''; // textarea への出力完了によりメモリログをクリア
+            // リロード競合時の beforeunload 判定のため、ここでは pendingExitChatLogText をクリアせず保持
             break;
         }
     }
@@ -265,7 +269,12 @@ function getChatMemberName() {
     ChatManager.getChatMemberName(AppState, SELECTORS);
 }
 
-DOMUtils.observeAndAttachEvent(SELECTORS.exitButton, 'click', saveChat, true);
+function handleExitButtonClick() {
+    AppState.exitButtonClicked = true;
+    saveChat();
+}
+
+DOMUtils.observeAndAttachEvent(SELECTORS.exitButton, 'click', handleExitButtonClick, true);
 DOMUtils.observeAndAttachEvent(`#${IDS.copyButton}`, 'click', saveChatManual, true);
@@ -297,38 +306,26 @@ window.addEventListener('beforeunload', (event) => {
         }
     }
 
-    const hasPendingLog = AppState.pendingExitChatLogText !== '';
+    const effectiveChatLog = AppState.pendingExitChatLogText || AppState.tmpChatLogText;
+    const hasPendingLog = effectiveChatLog !== '';
     const isCurrentRoom = AppState.pendingExitRoomId != null &&
         activeRoomId != null &&
         AppState.pendingExitRoomId === activeRoomId;
 
-    // 3. 通話中判定（退出ボタンが存在する間はアクティブな通話中）
-    const isInActiveCall = document.querySelector(SELECTORS.exitButton) != null;
-
-    // 4. 退出後画面（通話終了後）の判定
-    const isPostMeetingScreen = !isInActiveCall && (
-        AppState.postExitCompleted ||
-        AppState.exitedUIInserted ||
-        document.querySelector(SELECTORS.unprocessedRemovedMessage) != null
-    );
-
     // 実機切り分け用の一時デバッグログ（本文は出さずフラグ・文字数のみ）
     console.debug('[GMCTC] beforeunload state', {
         wasSaveTarget: AppState.wasSaveTarget,
         isLiveSaveTarget: ChatManager.isSaveTarget(document, SELECTORS),
         chatTextLength: currentChatText.length,
-        pendingTextLength: AppState.pendingExitChatLogText.length,
+        pendingTextLength: effectiveChatLog.length,
         pendingExitRoomId: AppState.pendingExitRoomId,
         activeRoomId: activeRoomId,
-        isInActiveCall: isInActiveCall,
-        postExitCompleted: AppState.postExitCompleted,
-        isPostMeetingScreen: isPostMeetingScreen,
+        exitButtonClicked: AppState.exitButtonClicked,
+        autoCopySucceeded: AppState.autoCopySucceeded,
+        exitedUIInserted: AppState.exitedUIInserted,
         visibilityState: document.visibilityState
     });
 
     // 1. 退避ログなし、または Room 不一致の場合は要求しない
     if (!hasPendingLog || !isCurrentRoom) {
         return;
     }
 
-    // 6. 既に退出後画面にいる場合はダイアログを要求しない
-    if (isPostMeetingScreen) {
-        return;
-    }
-
-    // 7. 会議中（通話中）の離脱時のみ W3C / ブラウザ標準の確認要求を設定
+    // 2. 自動コピーが成功している場合は要求しない（クリップボード救出完了）
+    if (AppState.autoCopySucceeded) {
        return;
    }
 
+    // 3. 退出ボタンによる正常退出フローで textarea が挿入済みの場合は要求しない（通常遷移）
+    if (AppState.exitButtonClicked && AppState.exitedUIInserted) {
+        return;
+    }
+
+    // 4. それ以外（通話中リロード、またはリロード過渡期の先行切断・textarea先行挿入時）はダイアログを要求
     event.preventDefault();
-    event.returnValue = 'confirm?';
+    event.returnValue = '';
 });
```

---

## 3. テスト検証エビデンス

### 3.1 自動テストの実行結果 (`test/v6_dom_test.js`)
```
==== テスト実行完了: PASS: 80, FAIL: 0 ====
```
- **実行コマンド:** `npm test`
- **終了コード:** `0`
- **タイムアウト:** なし（全タイマー解放処理済み）
- **追加検証された Phase 5 テスト項目 (7件):**
  1. `Phase 5 (1)`: リロード競合時（textarea 先行挿入・ボタン未押下）➔ ダイアログが要求されること（PASS）
  2. `Phase 5 (2)`: 正常退出後遷移（退出ボタン押下・textarea 表示）➔ ダイアログが抑止されること（PASS）
  3. `Phase 5 (3)`: 自動コピー成功後遷移 ➔ ダイアログが抑止されること（PASS）
  4. `Phase 5 (4)`: textarea 先行挿入時のログ保持テスト ➔ `checkAndCreateExitedUI` 実行後もログが保持されること（PASS）
  5. `Phase 5 (5)`: 両ログ空の場合はダイアログが抑止されること（PASS）
  6. `Phase 5 (6)`: 別 Room 入室時に旧 Room の状態が初期化され旧ログによるダイアログ誤判定が抑止されること（PASS）
  7. `Phase 5 (7)`: 同一 Room 再参加時のフラグ分離 ➔ 再参加後の新セッション通話中リロードでダイアログが要求されること（PASS）

---

## 4. 実機手動検証手順

拡張機能リロード後、以下の手順で動作を確認いただけます：

1. **通話中リロード・タブ閉じの確認**:
   - 会議室に入室し、チャットメッセージを受信した状態でリロード（Cmd+R）またはタブ閉じ（Cmd+W）を実行。
   - Meet の切断処理速度にかかわらず、**離脱確認ダイアログ（「このサイトを離れますか？」）が表示されること**を確認。
   - ダイアログで「キャンセル」を押下後、画面に表示された textarea からチャットログがコピーできることを確認。
2. **正常退出後画面からの通常遷移の確認**:
   - 会議中に画面下の「通話から退出」ボタンを押して退出。
   - 自動コピー成功時（または textarea 表示時）に、画面内の「ホーム画面に戻る」や「再参加」をクリックした際、**不要な離脱ダイアログが出ずにスムーズに遷移できること**を確認。
