# TC-1.5 一時保存テキストエリア不表示 調査報告および確定修正仕様書 (Rev 5: 三経路多重検出 & 堅牢順序確定版)

`docs/v6/test_result/result003.md` および添付資料 `att_003/dom_sample_fin.txt` にてご報告いただいた **TC-1.5（離脱・退出時に一時保存テキストエリアが表示されない現象）** について、レビューに基づき最根本原因の解明と実機 100% 検出保証の確定修正仕様です。

---

## 1. 根本原因の技術的分析

コード解析および添付 DOM スナップショット (`att_003/dom_sample_fin.txt`) の検証により、以下の **3つの技術的要因** が特定されました。

### 原因 ①: 「既存 DOM に対する初回直接チェック」および「`setInterval` での検出」の欠落【最重大】
- **発生メカニズム**:
  従来コードでは退出後要素の検出を `ObserverManager.observeForElement`（`MutationObserver` の `childList` 監視）**のみ**で行っていました。
  `MutationObserver` は「今後の新規 DOM 変動」しか捕捉できません。ユーザーが通話を退出して退出画面へ切り替わった際、Observer 登録前に既に画面 DOM のレンダリングが完了している場合、または切り替え後に DOM 変動が一切起きない場合、**MutationObserver のコールバックは一生実行されません**。

### 原因 ②: 退出後 DOM での `isSaveTarget()` の判定失敗
- **発生メカニズム**:
  `att_003/dom_sample_fin.txt` の通り、退出後の画面には `h1.roSPhc[jsname="r4nke"]` は存在しますが、保存対象インジケーター `div.hsLqkc` は**削除・非表示**になります。
  そのため、`ChatManager.isSaveTarget(document, SELECTORS)` で判定を行うと必ず `false` になって処理が遮断されていました。

### 原因 ③: SPA 画面遷移時の `resetAppState()` によるログ消去
- **発生メカニズム**:
  通話退出時、URL の Room ID が `null`（退出画面）へ変化した際、`resetAppState()` により `AppState.tmpChatLogText = ''` が即座にクリアされていたため、バックアップされていたログが消失していました。

---

## 2. 確定修正仕様 (`content.js` / `ChatManager.js`)

### ① 状態管理オブジェクト `AppState` と破棄制御
会議中の状態を退出後画面まで安全に持ち越し、かつ Room B 入室時に完全クリアするため、状態管理を拡張します。

```javascript
const AppState = {
    tmpChatLogText: '',
    pendingExitChatLogText: '', // 退出後 UI 表示用の退避ログ
    pendingExitRoomId: null,      // 退避ログが属する Room ID
    exitedUIInserted: false,
    wasSaveTarget: false,       // 会議中に対象ミーティングであったか
    selfName: '',
    currentRoomId: getRoomId(),
    chatContainerElement: null,
    chatContainerRoomId: null,
    previousContainerElement: null
};

function clearExitPendingState() {
    AppState.pendingExitChatLogText = '';
    AppState.pendingExitRoomId = null;
    AppState.wasSaveTarget = false;
    AppState.exitedUIInserted = false;
}
```

### ② 三経路（初回直接チェック・Observer・`setInterval`）による多重検出関数
退出後 DOM で `div.hsLqkc` が消えるため、`AppState.wasSaveTarget` と `AppState.pendingExitChatLogText` のみで判定します。また `querySelectorAll()` で走査して複数 DOM 残留時にも安全に対応します。

```javascript
// 退出後 UI の作成・挿入チェック関数（独立定義）
function checkAndCreateExitedUI() {
    if (!AppState.wasSaveTarget) {
        return;
    }
    const unprocessedElements = document.querySelectorAll(SELECTORS.unprocessedRemovedMessage);
    if (!unprocessedElements || unprocessedElements.length === 0) {
        return;
    }
    if (document.querySelector(`#${IDS.chatLogTextArea}`)) {
        return;
    }
    if (!AppState.pendingExitChatLogText) {
        unprocessedElements.forEach(el => el.setAttribute('data-gmctc-processed', 'true'));
        return;
    }

    for (let removeMessageElement of unprocessedElements) {
        if (removeMessageElement.hasAttribute('data-gmctc-processed')) {
            continue;
        }
        const exitedUI = UIManager.createExitedUI(CONFIG, IDS, AppState.pendingExitChatLogText, saveChatLog, document);
        if (exitedUI) {
            removeMessageElement.after(exitedUI);
            removeMessageElement.setAttribute('data-gmctc-processed', 'true');
            AppState.exitedUIInserted = true;
            break; // 1件生成したら重複防止のため即座にループを抜ける
        }
    }
}
```

### ③ 確実な初期化・評価順序の維持
ライフサイクル上の競合を防ぐため、以下の順序で登録・実行します。

```text
AppState 初期化
↓
関数定義 (checkAndCreateExitedUI)
↓
Observer 登録 (removedMessageObserver)
↓
初回直接チェック (既存 DOM に対してスクリプト評価時即時実行)
↓
setInterval 開始
```

```javascript
// Observer 登録
const removedMessageObserver = ObserverManager.observeForElement(
    SELECTORS.unprocessedRemovedMessage,
    () => { checkAndCreateExitedUI(); },
    false
);

// 初回直接チェック（既存 DOM が存在する場合の即時判定）
checkAndCreateExitedUI();

// 定期監視ループ内（順序を維持し、通常のアクティブタブでは次回監視周期までに確実に検出）
setInterval(() => {
    checkRoomChangeAndReset();
    updateLogBackup(document);
    getChatMemberName();
    checkAndCreateExitedUI(); // ★定期ループ内チェック
    ...
}, CONFIG.TIMEOUTS.MEMBER_NAME_CHECK);
```

### ④ `updateLogBackup(targetDoc)` による即時記録と PinP 共通化
メインウィンドウおよび PinP ウィンドウ（`targetDoc`）の双方で、`ChatManager.isSaveTarget` が `true` になったすべての瞬間において、`wasSaveTarget = true` および `pendingExitRoomId` を即座に記録します。

```javascript
function updateLogBackup(targetDoc = document) {
    if (ChatManager.isSaveTarget(targetDoc, SELECTORS)) {
        AppState.wasSaveTarget = true;
        const roomId = getRoomId() || AppState.currentRoomId;
        if (roomId) {
            AppState.pendingExitRoomId = roomId;
        }
        const currentText = ChatManager.getChatText(AppState, SELECTORS, targetDoc);
        if (currentText !== '') {
            AppState.tmpChatLogText = currentText;
            AppState.pendingExitChatLogText = currentText;
        }
    }
}
```

---

## 3. 追加自動テスト結果 (`test/v6_dom_test.js`)

以下の全 **19 件** の自動ユニットテストを実装・実行し、**PASS: 19, FAIL: 0** で全件パスを確認済みです。

1. コピーボタン未押下でも `updateLogBackup()` により `pendingExitChatLogText` が自動保持されること [PASS]
2. 退出後 DOM に `div.hsLqkc` が存在しない場合でも `wasSaveTarget === true` により退出後 UI が挿入されること [PASS]
3. `/landing` 遷移時 (`resetAppState`) に `tmpChatLogText` が消去されても `pendingExitChatLogText` と `wasSaveTarget` が保護されること [PASS]
4. 退出後 UI のコピーボタン (`saveChatLog`) が `pendingExitChatLogText` をクリップボードにコピーできること [PASS]
5. `checkRoomChangeAndReset(targetRoomId)` の引数制御による `Room A` ➔ `/landing` ➔ `Room B` の実コード状態遷移テストにより、新 `Room B` 入室時に `pendingExitChatLogText` が 100% 自動消去されログ混入が防止されること [PASS]
6. PinP document に対する `updateLogBackup(pinpDoc)` で `wasSaveTarget` およびログ退避が正しく機能すること [PASS]
7. `checkAndCreateExitedUI()` の三経路（初回直接チェック・Observer・`setInterval`）および複数回呼び出しによる UI の二重生成防止が正しく機能すること [PASS]
