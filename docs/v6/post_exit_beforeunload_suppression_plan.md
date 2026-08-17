# 退出後画面および遷移時における `beforeunload` ダイアログ抑止 設計・実装仕様書

**文書ステータス:** 実装完了・自動テスト完了（60件PASS）・実機検証待ち  
**対象:** 挙動メモ①・結果メモ②（退出後画面からの「ホームに戻る」「再参加」遷移時の不要ダイアログ抑止、および会議中コピー後の未保存ログ保護維持）  
**準拠方針書:** [`docs/v6/scope_and_edge_case_policy.md`](./scope_and_edge_case_policy.md)  
**関連文書:** [`docs/v6/manual_test_behavior_memos.md`](./manual_test_behavior_memos.md), [`docs/v6/post_exit_beforeunload_fix_completion_report.md`](./post_exit_beforeunload_fix_completion_report.md)

---

## 1. 現状ステータスと本仕様書のスコープ

### 1.1 背景と目的
1. **Phase 1 改修の成果**:
   - `TC-1.5` の基本改修（退避ログ中心の判定、`preventDefault()` + `returnValue = ''`、`getRoomId()` live 判定）が完了し、会議中のリロード・タブ閉じ時に確実に離脱確認ダイアログが表示されるようになった。
2. **Phase 2 改修のスコープ**:
   - 実機手動テスト（[`manual_test_behavior_memos.md`](./manual_test_behavior_memos.md)）で判明した **「正常退出後の退出後画面からホーム・再参加へ遷移する際にダイアログが表示されてしまう課題」** を解消する。
   - 会議中の「コピー」ボタン押下（手動コピー）と退出時コピーを明確に分離し、会議中に手動コピーを行った後でも未保存ログの保護ダイアログが維持されるようにする。
   - 同一 Room 再参加時（`Room A → /landing → Room A`）や SPA 監視間隔内の高速再参加において、新規セッションとして旧セッションの退出状態を確実にリセットする。

---

## 2. 原因分析と課題の構造

### 2.1 `beforeunload` ダイアログの本来の目的
`beforeunload` による離脱確認の目的は、**「会議中（通話中）のユーザーが誤ってタブを閉じたりリロードしたりした際、未保存のチャットログが失われるのを防ぐこと」** です。通話が正常終了した後の退出画面からの意図的なページ遷移（「ホーム画面に戻る」「再参加」）ではダイアログを要求すべきではありません。

### 2.2 課題の構造
1. **退出後画面での不要ダイアログ**:
   - 会議終了後もメモリ上に `wasSaveTarget` や `pendingExitChatLogText` が保持されているため、退出後画面からの意図的な離脱遷移でも `beforeunload` がダイアログを要求していた。
2. **コピー成功フラグ (`autoCopySucceeded`) の意味の広さ**:
   - 会議中の手動コピーボタン押下時にも `saveChat()` が実行されて `autoCopySucceeded = true` となっていた。これを退出完了判定に使用すると、会議中にコピーボタンを押した後のリロード確認が誤抑止される脆弱性があった。
3. **正常退出時の処理済み化経路**:
   - 正常退出で自動コピーが成功した場合、`checkAndCreateExitedUI()` は退出要素に `data-gmctc-processed="true"` を付与して終了するため、フォールバック UI（`exitedUIInserted`）は挿入されず未処理要素（`unprocessedRemovedMessage`）も無くなる。
4. **同一 Room 再参加時のセッション状態持ち越し**:
   - `Room A → /landing → Room A` で再入室した際、ポーリング遅延や旧セッション状態の持ち越しによって新セッションの会議中ダイアログが誤抑止されるリスクがあった。

---

## 3. 解決アプローチ

### 3.1 手動コピーと退出自動コピーの分離 (`saveChatManual` vs `saveChat`)
- **`saveChat(appState, selectors, targetDoc, isAutoCopy = true)`**:
  - 退出ボタン（`SELECTORS.exitButton`）および PinP 退出ハンドラーから呼ばれる。
  - 成功時に `AppState.autoCopySucceeded = true`, `AppState.copiedSuccessfully = true` を設定する。
- **`saveChatManual()`**:
  - 会議中のコピーボタン（`#GMCTC-copyButton`）専用ハンドラー。
  - `ChatManager.saveChat(..., false)` を呼び出し、手動コピーフラグ（`AppState.fallbackCopySucceeded = true`）のみを設定し、`AppState.autoCopySucceeded` は **`false` のまま維持**する。
  - これにより、会議中に手動コピーを行った後に退出ボタンを経由せずに通話が終了した場合でも、`checkAndCreateExitedUI()` がフォールバック textarea を正常生成できる。

### 3.2 専用状態 `AppState.postExitCompleted` の設計
- **初期値**: `false`
- **設定タイミング (`checkAndCreateExitedUI`)**:
  - `unprocessedRemovedMessage` を検知し、自動コピー成功により処理済み属性を付与した時点、またはフォールバック UI を挿入した時点で `AppState.postExitCompleted = true` を設定する。
- **リセットタイミング (`clearExitPendingState`)**:
  - 新 Room 入室時、および `/landing` からの再入室時に `AppState.postExitCompleted = false` へリセットする。

### 3.3 通話中ガード (`isInActiveCall`) と退出後判定 (`isPostMeetingScreen`)
- **通話中判定 (`isInActiveCall`)**:
  - `document.querySelector(SELECTORS.exitButton) != null`
  - アクティブな退出ボタンが存在する間は、たとえ過去のフラグが残留していても確実に通話中とみなす。
- **退出後画面判定 (`isPostMeetingScreen`)**:
  - `!isInActiveCall && (AppState.postExitCompleted || AppState.exitedUIInserted || document.querySelector(SELECTORS.unprocessedRemovedMessage) != null)`
  - 通話中ではない（退出ボタン不在）かつ退出シグナルが存在する場合にのみ `true` となり、`beforeunload` ダイアログを抑止する。

### 3.4 同一 Room 再参加時（Room A ➔ /landing ➔ Room A）の即時セッションリセット
1. **イベント同期リセット**:
   - `beforeunload` および `updateLogBackup()` の冒頭で `checkRoomChangeAndReset()` を同期実行。
2. **`/landing` 経由の入室リセット**:
   - `previousRoomId === null`（`/landing`）から Room へ入室した際は、同一 Room ID であっても新規セッションの開始として `clearExitPendingState()` を無条件に実行し、`postExitCompleted` や旧退避ログを完全リセット。

---

## 4. 詳細設計とコード修正仕様

### 4.1 `content.js` の改修仕様

```javascript
// 1. AppState の初期化
const AppState = {
    // ...
    postExitCompleted: false,
    // ...
};

function clearExitPendingState() {
    AppState.pendingExitChatLogText = '';
    AppState.pendingExitRoomId = null;
    AppState.wasSaveTarget = false;
    AppState.exitedUIInserted = false;
    AppState.postExitCompleted = false;
    AppState.autoCopySucceeded = false;
    AppState.fallbackCopySucceeded = false;
    AppState.copyInProgress = false;
    AppState.copiedSuccessfully = false;
}

// 2. Room 変更・再参加時のリセット
function checkRoomChangeAndReset(overrideRoomId = undefined) {
    const newRoomId = overrideRoomId !== undefined ? overrideRoomId : getRoomId();
    if (AppState.currentRoomId !== newRoomId) {
        const previousRoomId = AppState.currentRoomId;
        AppState.currentRoomId = newRoomId;

        if (previousRoomId !== null) {
            resetAppState(previousRoomId);
        }

        // 別 Room への移動、または /landing からの入室（新規会議セッション）時に退出待機状態を完全リセット
        if (newRoomId !== null && (previousRoomId === null || newRoomId !== AppState.pendingExitRoomId)) {
            clearExitPendingState();
        }
    }
}

// 3. 手動コピーと退出コピーの分離
function saveChat() {
    updateLogBackup(document);
    if (!ChatManager.isSaveTarget(document, SELECTORS)) {
        return;
    }
    const result = ChatManager.saveChat(AppState, SELECTORS, document, true);
    if (AppState.tmpChatLogText !== '') {
        AppState.pendingExitChatLogText = AppState.tmpChatLogText;
    }
    return result;
}

function saveChatManual() {
    updateLogBackup(document);
    if (!ChatManager.isSaveTarget(document, SELECTORS)) {
        return;
    }
    const result = ChatManager.saveChat(AppState, SELECTORS, document, false);
    if (AppState.tmpChatLogText !== '') {
        AppState.pendingExitChatLogText = AppState.tmpChatLogText;
    }
    return result;
}

DOMUtils.observeAndAttachEvent(SELECTORS.exitButton, 'click', saveChat, true);
DOMUtils.observeAndAttachEvent(`#${IDS.copyButton}`, 'click', saveChatManual, true);

// 4. checkAndCreateExitedUI での postExitCompleted 設定
function checkAndCreateExitedUI() {
    if (!AppState.wasSaveTarget || AppState.copyInProgress) {
        return;
    }
    const unprocessedElements = document.querySelectorAll(SELECTORS.unprocessedRemovedMessage);
    if (!unprocessedElements || unprocessedElements.length === 0) {
        return;
    }
    if (AppState.autoCopySucceeded) {
        unprocessedElements.forEach(el => {
            el.setAttribute('data-gmctc-processed', 'true');
        });
        AppState.postExitCompleted = true;
        return;
    }
    // ... フォールバック textarea 挿入時 ...
    if (exitedUI) {
        removeMessageElement.after(exitedUI);
        removeMessageElement.setAttribute('data-gmctc-processed', 'true');
        AppState.exitedUIInserted = true;
        AppState.postExitCompleted = true;
        break;
    }
}

// 5. beforeunload ハンドラー
window.addEventListener('beforeunload', (event) => {
    checkRoomChangeAndReset();
    updateLogBackup(document);

    const activeRoomId = getRoomId();
    let currentChatText = '';

    if (activeRoomId != null && (AppState.pendingExitRoomId == null || AppState.pendingExitRoomId === activeRoomId)) {
        currentChatText = ChatManager.getChatText(AppState, SELECTORS, document);
        if (currentChatText !== '') {
            AppState.tmpChatLogText = currentChatText;
            AppState.pendingExitChatLogText = currentChatText;
        }
    }

    const hasPendingLog = AppState.pendingExitChatLogText !== '';
    const isCurrentRoom = AppState.pendingExitRoomId != null &&
        activeRoomId != null &&
        AppState.pendingExitRoomId === activeRoomId;

    const isInActiveCall = document.querySelector(SELECTORS.exitButton) != null;
    const isPostMeetingScreen = !isInActiveCall && (
        AppState.postExitCompleted ||
        AppState.exitedUIInserted ||
        document.querySelector(SELECTORS.unprocessedRemovedMessage) != null
    );

    if (!AppState.wasSaveTarget || !hasPendingLog || !isCurrentRoom) {
        return;
    }

    if (isPostMeetingScreen) {
        return;
    }

    event.preventDefault();
    event.returnValue = '';
});
```

---

## 5. 自動テスト設計と実装結果 (`test/v6_dom_test.js`)

Phase 2 として以下の 14 ケースを追加し、全 60 件 PASS を確認済みです。

### 5.1 テストケース一覧

| # | テスト種別 | 検証内容 | 結果 |
|---|---|---|:---:|
| 1 | 会議中コピー負のテスト | `autoCopySucceeded === true` 単独でも会議中ダイアログ要求が維持されること | **PASS** |
| 2 | 会議中コピー負のテスト | `copiedSuccessfully === true` 単独でも会議中ダイアログ要求が維持されること | **PASS** |
| 3 | 会議中コピー負のテスト | 両フラグ `true` でも会議中ダイアログ要求が維持されること | **PASS** |
| 4 | キャンセル後再リロード | 同一会議室内での 2 回目の beforeunload でもダイアログ要求が維持されること | **PASS** |
| 5 | 正常退出後抑止 | `checkAndCreateExitedUI` で自動コピー成功処理済み化後にダイアログが抑止されること | **PASS** |
| 6 | 未処理退出要素抑止 | DOM 内に `unprocessedRemovedMessage` が存在する場合にダイアログが抑止されること | **PASS** |
| 7 | フォールバック挿入後抑止 | `postExitCompleted === true` かつ `exitedUIInserted === true` で抑止されること | **PASS** |
| 8 | UI 挿入単独抑止 | `postExitCompleted === false` でも `exitedUIInserted === true` で抑止されること | **PASS** |
| 9 | 旧 Room 要素残留時 | 旧 Room の processed 要素があっても新 Room の会議中ダイアログを誤抑止しないこと | **PASS** |
| 10 | 同一 Room 再参加 | `/landing` 経由で再入室時に旧セッション状態がリセットされ会議中ダイアログが維持されること | **PASS** |
| 11 | 手動コピー後新着退出 | 手動コピー後に新着ありで退出ボタン押さずに退出要素出現時、textarea が生成されること | **PASS** |
| 12 | 退出ボタン実経路 | 退出ボタン押下による自動コピー成功で textarea なし・beforeunload 抑止を検証 | **PASS** |
| 13 | 監視間隔内高速再参加 | 300ms ポーリングを待たずに即時セッション判定により新会議中ダイアログが維持されること | **PASS** |
| 14 | `copiedSuccessfully` 単独 | 退出完了扱いせずフォールバック UI を生成すること | **PASS** |

---

## 6. 次のステップ

1. Chrome 実機での手動検証（[`docs/v6/manual_testing_scenario.md`](./manual_testing_scenario.md) に基づく検証）
2. 実機検証完了後のステータス更新
