# リロード時レースコンディション（ログ先行クリア・早期抑止）の解消 再設計計画書（完全整合版）

**文書ステータス:** 再設計計画書（改訂整合版・承認待ち）  
**対象事象:** リロード時に Meet の切断・DOM 描画が先行し、textarea 挿入により `beforeunload` ダイアログ要求が早期抑止されてチャットが消失する競合の解消  
**採用方針:** **方針 1（リロード競合時もダイアログを要求する）**  
**準拠方針書:** [`docs/v6/scope_and_edge_case_policy.md`](./scope_and_edge_case_policy.md)  
**関連文書との位置付け:** 本書は [`docs/v6/log_driven_beforeunload_redesign_plan.md`](./log_driven_beforeunload_redesign_plan.md) の発展改訂版であり、「textarea 挿入時の即時ログクリア」を「リロード競合時のログ保持・ダイアログ要求」へと更新・上位適用します。

---

## 1. 状態の分離と判定基準の再定義

### 1.1 状態の明確な分離

| 状態 | 意味 | ダイアログ要求 |
|---|---|:---:|
| **① 未救出ログあり** | `pendingExitChatLogText` または `tmpChatLogText` が非空 | **要求する** |
| **② 退出後 UI 挿入直後 (リロード競合時)** | `exitButtonClicked === false` かつ `exitedUIInserted === true`<br>（ユーザーは離脱確認ダイアログの「キャンセル」を押しておらず、このままではリロードで textarea が消滅する） | **要求する** |
| **③ 救出完了・安全遷移** | ・退出ボタン押下で自動コピー成功済み（`autoCopySucceeded === true`）<br>・退出ボタンクリックによる正常退出フローで textarea 表示済み（`exitButtonClicked === true && exitedUIInserted === true`） | **抑止する** |

### 1.2 ログの保持・クリア方針（完全統一）
- **クリアする条件（限定）**:
  1. 明示的な退出ボタン経由で自動コピーが成功した場合（`AppState.autoCopySucceeded === true`）
  2. Room / セッションが確実に切り替わった場合（`clearExitPendingState()`）
- **クリアしない条件**:
  - `checkAndCreateExitedUI()` による textarea 挿入時（リロード競合時のログ救出のため、メモリログを保持し続けます）

### 1.3 `exitButtonClicked` のライフサイクル

| 状態遷移 | `exitButtonClicked` | 設定・リセット箇所 |
|---|:---:|---|
| 会議中初期状態 | `false` | `AppState` 初期値 |
| メイン退出ボタン押下 | `true` | `handleExitButtonClick()` イベントハンドラー |
| PinP 退出ボタン押下 | `true` | PinP イベント受信リスナー |
| リロード開始（ボタン未押下） | `false` | 変更なし（初期値のまま） |
| `/landing` 遷移時 | `false` | `clearExitPendingState()` |
| 別 Room 入室時 | `false` | `clearExitPendingState()` |
| 同一 Room 再参加時 | `false` | `clearExitPendingState()` |

---

## 2. 実装仕様 ([`content.js`](file:///Users/maepon/work/GoogleMeetChatToClipboard/content.js))

### 2.1 状態オブジェクトの定義
```javascript
const AppState = {
    tmpChatLogText: '',
    pendingExitChatLogText: '',
    pendingExitRoomId: null,
    exitButtonClicked: false,     // 明示的な退出ボタンクリックの追跡
    postExitCompleted: false,
    exitedUIInserted: false,
    autoCopySucceeded: false,
    fallbackCopySucceeded: false,
    copyInProgress: false,
    copiedSuccessfully: false,
    wasSaveTarget: false,
    selfName: '',
    currentRoomId: getRoomId(),
    chatContainerElement: null,
    chatContainerRoomId: null,
    previousContainerElement: null
};
```

### 2.2 セッション初期化・リセット関数
```javascript
function clearExitPendingState() {
    AppState.pendingExitChatLogText = '';
    AppState.tmpChatLogText = '';
    AppState.pendingExitRoomId = null;
    AppState.exitButtonClicked = false;
    AppState.wasSaveTarget = false;
    AppState.exitedUIInserted = false;
    AppState.postExitCompleted = false;
    AppState.autoCopySucceeded = false;
    AppState.fallbackCopySucceeded = false;
    AppState.copyInProgress = false;
    AppState.copiedSuccessfully = false;
}
```

### 2.3 退出ボタンのイベントハンドラー分離
```javascript
// 明示的なメイン退出ボタンクリック時のみフラグを立てる
function handleExitButtonClick() {
    AppState.exitButtonClicked = true;
    saveChat();
}

// イベント登録
DOMUtils.observeAndAttachEvent(SELECTORS.exitButton, 'click', handleExitButtonClick, true);

// PinP メッセージリスナー
window.addEventListener('message', (event) => {
    ...
    if (event.data.type === 'PINP_EVENT') {
        if (event.data.eventType === 'click') {
            if (event.data.selector === SELECTORS.exitButton) {
                AppState.exitButtonClicked = true; // PinP 退出も正常退出として追跡
                saveChatFromPinP();
            }
            ...
        }
    }
});
```

### 2.4 退出後 UI 挿入関数（textarea 挿入時のログクリアを撤廃）
```javascript
function checkAndCreateExitedUI() {
    if (!AppState.wasSaveTarget) {
        return;
    }
    if (AppState.copyInProgress) {
        return;
    }
    const unprocessedElements = document.querySelectorAll(SELECTORS.unprocessedRemovedMessage);
    if (!unprocessedElements || unprocessedElements.length === 0) {
        return;
    }
    // 自動コピー成功時は処理済み化してログを消費
    if (AppState.autoCopySucceeded) {
        unprocessedElements.forEach(el => {
            el.setAttribute('data-gmctc-processed', 'true');
        });
        AppState.postExitCompleted = true;
        AppState.pendingExitChatLogText = '';
        return;
    }
    if (document.querySelector(`#${IDS.chatLogTextArea}`)) {
        return;
    }
    const logTextToDisplay = AppState.pendingExitChatLogText || AppState.tmpChatLogText;
    if (!logTextToDisplay) {
        return;
    }

    for (let removeMessageElement of unprocessedElements) {
        if (removeMessageElement.hasAttribute('data-gmctc-processed')) {
            continue;
        }
        const exitedUI = UIManager.createExitedUI(CONFIG, IDS, logTextToDisplay, saveChatLog, document);
        if (exitedUI) {
            removeMessageElement.after(exitedUI);
            removeMessageElement.setAttribute('data-gmctc-processed', 'true');
            AppState.exitedUIInserted = true;
            AppState.postExitCompleted = true;
            // 【重要】リロード競合時の beforeunload 判定のため、ここでは pendingExitChatLogText をクリアせず保持
            break;
        }
    }
}
```

### 2.5 `beforeunload` リスナー（新ロジックへ完全統一）
```javascript
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
            AppState.pendingExitRoomId = activeRoomId;
        }
    }

    const effectiveChatLog = AppState.pendingExitChatLogText || AppState.tmpChatLogText;
    const hasPendingLog = effectiveChatLog !== '';
    const isCurrentRoom = AppState.pendingExitRoomId != null &&
        activeRoomId != null &&
        AppState.pendingExitRoomId === activeRoomId;

    // 1. 退避ログなし、または Room 不一致の場合は要求しない
    if (!hasPendingLog || !isCurrentRoom) {
        return;
    }

    // 2. 自動コピー成功時は要求しない（クリップボード救出完了）
    if (AppState.autoCopySucceeded) {
        return;
    }

    // 3. 退出ボタンによる正常退出フローで textarea が挿入済みの場合は要求しない（通常遷移）
    if (AppState.exitButtonClicked && AppState.exitedUIInserted) {
        return;
    }

    // 4. それ以外（通話中リロード、またはリロード過渡期の先行切断・textarea先行挿入時）はダイアログを要求
    event.preventDefault();
    event.returnValue = '';
});
```

---

## 3. 自動テスト計画 ([`test/v6_dom_test.js`](file:///Users/maepon/work/GoogleMeetChatToClipboard/test/v6_dom_test.js))

以下の 7 パターンを単体・結合テストとして追加・検証します：

| # | テストケース名 | 検証条件 | 期待動作 |
|---|---|---|---|
| 1 | リロード競合時（textarea 先行挿入・ボタン未押下） | `exitButtonClicked === false`, `exitedUIInserted === true`, ログあり | **ダイアログ要求されること**（`defaultPrevented === true`） |
| 2 | 正常退出後遷移（退出ボタン押下・textarea 表示） | `exitButtonClicked === true`, `exitedUIInserted === true` | **ダイアログ抑止されること**（`defaultPrevented === false`） |
| 3 | 自動コピー成功後遷移 | `autoCopySucceeded === true` | **ダイアログ抑止されること**（`defaultPrevented === false`） |
| 4 | textarea 先行挿入時のログ保持テスト | `checkAndCreateExitedUI()` 実行後 | `pendingExitChatLogText` または `tmpChatLogText` が保持されていること |
| 5 | 両ログ空 | `pendingExitChatLogText === ''`, `tmpChatLogText === ''` | **ダイアログ抑止されること**（`defaultPrevented === false`） |
| 6 | Room 変更・セッションリセット時 | `/landing` 経由でリセットされた状態 | `pendingExitChatLogText === ''`, `tmpChatLogText === ''`, `exitButtonClicked === false`, `pendingExitRoomId === null` となり**ダイアログ抑止されること** |
| 7 | 同一 Room 再参加時のフラグ分離 | 退出ボタン押下 ➔ `/landing` ➔ 同一 Room 再参加で新ログ受信 | `exitButtonClicked === false` となり**新セッションの通話中リロードでダイアログ要求されること** |

---

## 4. 実機手動検証計画

Chrome 実機にて、定義した P0 条件下（チャットログ保持状態）で以下を検証します：

1. 定義した P0 条件下で複数回のリロードおよびタブ閉じ操作を行い、Meet の DOM 描画順序に依存せず確認ダイアログが要求されることを確認する。
2. ダイアログで「キャンセル」を押下後、画面に留まり textarea からチャットログがコピーできることを確認する。
3. 退出ボタンを押して退出した後の画面から「ホーム画面に戻る」または「再参加」を押した際、ダイアログが出ずにスムーズに遷移できることを確認する。
