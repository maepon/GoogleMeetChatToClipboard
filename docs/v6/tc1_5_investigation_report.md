# TC-1.5 一時保存テキストエリア不表示 調査報告および確定修正プラン書 (Rev 2: DOM構造 & 状態保持保護 確定版)

`docs/v6/test_result/result003.md` および添付資料 `att_003/dom_sample_fin.txt` にてご報告いただいた **TC-1.5（離脱・退出時に一時保存テキストエリアが表示されない現象）** について、設計レビューフィードバックに基づく完全な原因特定と確定修正プランです。

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

### 原因 ③: コピー未押下時のリアルタイムログ未保持
- **発生メカニズム**:
  ユーザーが通話中に手動で「コピーボタン」や通話内「退出ボタン」をクリックしていない場合、`AppState.tmpChatLogText` が初期値 `''` のままになっていました。

---

## 2. 確定修正プラン (`content.js` / `AppState`)

### ① 状態管理オブジェクト `AppState` の拡張と保護
会議中の状態を退出後画面まで安全に持ち越すため、状態管理を拡張します。

```javascript
const AppState = {
    tmpChatLogText: '',
    pendingExitChatLogText: '', // 退出後 UI 表示用の退避ログ
    exitedUIInserted: false,
    wasSaveTarget: false,       // 会議中に対象ミーティングであったか
    selfName: '',
    currentRoomId: getRoomId(),
    chatContainerElement: null,
    chatContainerRoomId: null,
    previousContainerElement: null
};
```

### ② 通話中のリアルタイムログ保持と `wasSaveTarget` の記憶
`setInterval` 内で、通話中に `isSaveTarget` が `true` である間、`wasSaveTarget = true` を記憶し、最新のチャットログを `tmpChatLogText` および `pendingExitChatLogText` に自動バックアップ・保持します。

```javascript
setInterval(() => {
    checkRoomChangeAndReset();
    getChatMemberName();

    const activeRoomId = getRoomId();
    if (activeRoomId && ChatManager.isSaveTarget(document, SELECTORS)) {
        AppState.wasSaveTarget = true;
        const currentText = ChatManager.getChatText(AppState, SELECTORS, document);
        if (currentText !== '') {
            AppState.tmpChatLogText = currentText;
            AppState.pendingExitChatLogText = currentText;
        }
    }
}, CONFIG.TIMEOUTS.MEMBER_NAME_CHECK);
```

### ③ `resetAppState()` での退出待ちログの保護
`resetAppState()` 実行時、通常の遷移リセットでは `pendingExitChatLogText` を維持し、新しい Room ID へ入室したタイミングでのみ完全にクリアします。

### ④ `removedMessageObserver` の判定ロジック刷新
退出後 DOM に `div.hsLqkc` がなくても、通話中に `wasSaveTarget === true` であり `pendingExitChatLogText !== ''` であれば、退出後 UI（テキストエリア＋コピーボタン）を確実に挿入します。

```javascript
const removedMessageObserver = ObserverManager.observeForElement(
    SELECTORS.unprocessedRemovedMessage,
    (removeMessageElement) => {
        // 会議前、または非保存対象ミーティングだった場合はスキップ
        if (!AppState.wasSaveTarget) {
            return;
        }

        if (removeMessageElement.hasAttribute('data-gmctc-processed')) {
            return;
        }

        if (document.querySelector(`#${IDS.chatLogTextArea}`)) {
            return;
        }

        if (AppState.pendingExitChatLogText === '') {
            removeMessageElement.setAttribute('data-gmctc-processed', 'true');
            return;
        }

        const exitedUI = UIManager.createExitedUI(CONFIG, IDS, AppState.pendingExitChatLogText, saveChatLog, document);
        if (exitedUI) {
            removeMessageElement.after(exitedUI);
            removeMessageElement.setAttribute('data-gmctc-processed', 'true');
            AppState.exitedUIInserted = true;
        }
    },
    false
);
```

---

## 3. 追加自動テスト計画 (`test/v6_dom_test.js`)

以下を検証する自動ユニットテストを追加いたします。

1. コピーボタン未押下でも `pendingExitChatLogText` が自動保持されること
2. 退出後 DOM に `div.hsLqkc` が存在しない場合でも `wasSaveTarget === true` により退出後 UI が挿入されること
3. 空ログ時は UI が挿入されないこと
4. 新 Room ID への遷移時に旧 Room の `pendingExitChatLogText` が混入せずリセットされること
