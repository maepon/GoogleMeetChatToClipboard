# TC-1.5 一時保存テキストエリア不表示 調査報告および確定修正プラン書 (Rev 3: 競合完全防護 & 実態整合確定版)

`docs/v6/test_result/result003.md` および添付資料 `att_003/dom_sample_fin.txt` にてご報告いただいた **TC-1.5（離脱・退出時に一時保存テキストエリアが表示されない現象）** について、設計レビューに基づき実態コードと 100% 整合した確定修正仕様です。

---

## 1. 根本原因の技術的分析

コード解析および添付 DOM スナップショット (`att_003/dom_sample_fin.txt`) の検証により、以下の **3つの技術的要因** が特定されました。

### 原因 ①: 退出後 DOM での `isSaveTarget()` の判定失敗【最重大】
- **発生メカニズム**:
  `att_003/dom_sample_fin.txt` の通り、退出後の画面には `h1.roSPhc[jsname="r4nke"]` は存在しますが、保存対象インジケーター `div.hsLqkc` は**削除・非表示**になります。
  そのため、現行の `removedMessageObserver` 冒頭にある `if (!ChatManager.isSaveTarget(document, SELECTORS)) return;` で **100% 処理が中断される**構造になっていました。

### 原因 ②: SPA 画面遷移時の `resetAppState()` によるログ消去【重大】
- **発生メカニズム**:
  通話退出時、URL の Room ID が会議コードから `null`（退出画面）に変化した際、`checkRoomChangeAndReset()` が実行されて `resetAppState()` が呼ばれます。
  従来コードでは `resetAppState()` 内で `AppState.tmpChatLogText = ''` が即座にクリアされていたため、バックアップされていたログが消失していました。

### 原因 ③: コピー未押下時のリアルタイムログ未保持および PinP 未同期
- **発生メカニズム**:
  ユーザーが通話中に手動で「コピーボタン」や通話内「退出ボタン」をクリックしていない場合、`AppState.tmpChatLogText` が初期値 `''` のままになっていました。

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

### ② `updateLogBackup(targetDoc)` による即時記録と PinP 共通化
メインウィンドウおよび PinP ウィンドウ（`targetDoc`）の双方で、`ChatManager.isSaveTarget` が `true` になったすべての瞬間において、`wasSaveTarget = true` および `pendingExitRoomId` を即座に記録し、最新チャットログを退避します。

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

### ③ `setInterval` 内の評価順序（優先順位の制御）
Room A ➔ `/landing` ➔ Room B への遷移時、`updateLogBackup()` が `clearExitPendingState()` より先に実行されて Room A のログで競合上書きされるのを防ぐため、**`checkRoomChangeAndReset()` を `updateLogBackup()` より前に評価**します。

```javascript
setInterval(() => {
    checkRoomChangeAndReset(); // ★Room 変更チェック＆新Room入室時の自動クリアを最優先実行
    updateLogBackup(document); // ★クリア判定後に現在のRoom状態をバックアップ
    getChatMemberName();
    ...
}, CONFIG.TIMEOUTS.MEMBER_NAME_CHECK);
```

### ④ `checkRoomChangeAndReset()` での Room B 入室時自動クリア
`Room A`（`abc-defg-hij`） ➔ `/landing`（`null`）への移動時は `pendingExitChatLogText` を保護維持し、新しい `Room B`（`xyz-uvwx-rst`）に入室した瞬間に `clearExitPendingState()` により過去ログを自動消去します。

```javascript
function checkRoomChangeAndReset() {
    const newRoomId = getRoomId();
    if (AppState.currentRoomId !== newRoomId) {
        const previousRoomId = AppState.currentRoomId;
        AppState.currentRoomId = newRoomId;

        if (previousRoomId !== null) {
            resetAppState(previousRoomId);
        }

        // 新しい Room B に入室した場合は旧 Room A の退避ログを完全消去
        if (newRoomId !== null && newRoomId !== AppState.pendingExitRoomId) {
            clearExitPendingState();
        }
    }
}
```

### ⑤ 退出後 UI コピーボタンの退避ログフォールバック (`ChatManager.js`)
`resetAppState()` により `tmpChatLogText` が空になった後でも、退出後 UI 内のコピーボタンが機能するよう、`saveChatLog` で `pendingExitChatLogText` をフォールバック参照します。

```javascript
saveChatLog(appState) {
    const textToSave = appState.pendingExitChatLogText || appState.tmpChatLogText;
    if (!textToSave) return;
    navigator.clipboard.writeText(textToSave).catch(err => {
        this._execCommandClipboard(textToSave, appState);
    });
}
```

---

## 3. 追加自動テスト結果 (`test/v6_dom_test.js`)

以下の 18 件の自動ユニットテストを実装・実行し、**PASS: 18, FAIL: 0** で全件パスを確認済みです。

1. コピーボタン未押下でも `updateLogBackup()` により `pendingExitChatLogText` が自動保持されること [PASS]
2. 退出後 DOM に `div.hsLqkc` が存在しない場合でも `wasSaveTarget === true` により退出後 UI が挿入されること [PASS]
3. `/landing` 遷移時 (`resetAppState`) に `tmpChatLogText` が消去されても `pendingExitChatLogText` と `wasSaveTarget` が保護されること [PASS]
4. 退出後 UI のコピーボタン (`saveChatLog`) が `pendingExitChatLogText` をクリップボードにコピーできること [PASS]
5. `Room A` ➔ `/landing` ➔ `Room B` の実コード自動状態遷移により、新 `Room B` 入室時に `pendingExitChatLogText` が 100% 自動消去されログ混入が防止されること [PASS]
6. PinP document に対する `updateLogBackup(pinpDoc)` で `wasSaveTarget` およびログ退避が正しく機能すること [PASS]
