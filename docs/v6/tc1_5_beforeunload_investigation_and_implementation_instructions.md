# TC-1.5 `beforeunload` ダイアログ要求不達 調査および実装指示書

**文書ステータス:** 履歴資料（旧設計・参照用）  
**対象:** `TC-1.5`（チャットログ存在時のリロード・タブ閉じ開始、`beforeunload` ダイアログ要求）  
**準拠方針書:** [`docs/v6/scope_and_edge_case_policy.md`](./scope_and_edge_case_policy.md)  
**実機検証手順書:** [`docs/v6/manual_testing_scenario.md`](./manual_testing_scenario.md)  
**現行仕様:** 本書の実装指示は旧設計に基づく履歴資料です。現行の退避ログ駆動型ダイアログ判定および最新仕様は [`docs/v6/log_driven_beforeunload_redesign_plan.md`](./log_driven_beforeunload_redesign_plan.md) および [`docs/v6/log_driven_beforeunload_redesign_completion_report.md`](./log_driven_beforeunload_redesign_completion_report.md) を参照してください。

---

## 1. 事象と目的

### 1.1 発生した事象
対象ミーティングにおいてチャットログを保持した状態でブラウザのリロードまたはタブ閉じを開始した際、**想定していた `beforeunload` の確認ダイアログ要求へ到達せず、ダイアログが表示されない**事象が確認された。

### 1.2 本指示書の目的とスコープ境界
本書は、チャットログが存在する状態でのリロードおよびタブ閉じ時に **「条件成立時に `beforeunload` のキャンセル要求を実行すること」** にスコープを絞り、原因分析、実装修正仕様、および自動テスト・実機検証の境界を定める。

> **スコープの分離について:**  
> リロード前後に退出後 textarea が一瞬表示される現象やその表示抑止ライフサイクル（`AppState.isUnloading` の追加等）は、本指示書の判定対象から切り離し、別課題として扱う。本書ではダイアログ要求の成立条件（保存状態判定とブラウザイベント契約）のみを主対象とする。

---

## 2. 現行実装と原因の切り分け

### 2.1 現行の `beforeunload` 実装 (`content.js:256-267`)

```javascript
window.addEventListener('beforeunload', (e) => {
    updateLogBackup(document);
    if (!ChatManager.isSaveTarget(document, SELECTORS)) {
        return;
    }
    const chatText = ChatManager.getChatText(AppState, SELECTORS, document);
    if (chatText !== '') {
        AppState.tmpChatLogText = chatText;
        AppState.pendingExitChatLogText = chatText;
        e.returnValue = 'Remove?';
    }
});
```

### 2.2 コード上で確認できる主因

#### 原因 1: 保存対象判定の Live DOM 依存（二重チェックによる早期 return）
現行ハンドラーは冒頭で `updateLogBackup(document)` を呼び出した後、直後で再度 `ChatManager.isSaveTarget(document, SELECTORS)` を評価している。  
リロードや画面遷移の開始時に Google Meet が DOM 切り替えを開始し `div.hsLqkc` が消失していると、会議中に確定した `AppState.wasSaveTarget` が `true` であっても、ここで `return` してダイアログ要求へ到達しない。

#### 原因 2: チャット本文取得の瞬間依存
発火時点で DOM のチャットコンテナがアンマウント・空化していると、`ChatManager.getChatText(...)` が空文字列 `''` を返し、既に `AppState.pendingExitChatLogText` に退避済みのログが存在していても `e.returnValue` の設定に到達しない。

#### 原因 3: イベントキャンセル要求の補強不足（`preventDefault()` の欠落）
現行コードは `e.returnValue = 'Remove?'` のみを代入しており、標準的な `e.preventDefault()` を併用していない。W3C / HTML 標準に準拠した形式（`preventDefault()` + `returnValue = ''`）で要求する必要がある。

#### 原因 4: SPA 遷移直後の stale state リスク
`AppState.currentRoomId` は 500ms 間隔の定期処理で更新されるため、SPA 遷移直後には旧 Room ID が残っている可能性がある。発火時点の live URL から取得した `getRoomId()` と比較しなければ、旧 Room のログで誤ってダイアログを要求してしまうリスクがある。

### 2.3 実機環境に依存する要因（検証上の注意）
Chrome の確認ダイアログ表示は、コード上の要求成立に加え以下のブラウザ仕様に依存する：
- ページがユーザー操作を受けていること（sticky activation）。
- 同一ページで短時間の連続表示抑制や自動化制御がかかっていないこと。

---

## 3. 実装担当者への修正指示

### 3.1 退避処理の実行順序と状態保持契約
1. **バックアップ処理の先行実行**: ハンドラー冒頭で必ず `updateLogBackup(document)` を実行する。これにより、定期バックアップが未実行の初期段階で unload が発生した場合でも、live DOM から `wasSaveTarget`、`pendingExitRoomId`、`pendingExitChatLogText` が記録される。
2. **既存退避状態の保持**: live DOM から `div.hsLqkc` が消失した場合でも、`updateLogBackup()` は既存の `wasSaveTarget` や退避ログを消去・上書きしない（既存契約を維持）。
3. **退避状態中心の判定**: Live DOM のインジケーター消失や本文空化に依存せず、会議中に確定した `AppState.wasSaveTarget`、非空の `AppState.pendingExitChatLogText`、および発火時点の live `getRoomId()` と `pendingExitRoomId` の厳格な一致（双方非 null かつ等しい）を主判定条件とする。

### 3.2 コード契約仕様

[`content.js`](file:///Users/maepon/work/GoogleMeetChatToClipboard/content.js#L256-L267) のメイン `beforeunload` リスナーを以下のように改修する：

```javascript
window.addEventListener('beforeunload', (event) => {
    // 1. まず退避処理を実行し、初回 unload でも保存対象・Room・ログを記録
    updateLogBackup(document);

    // 2. 発火時点の live DOM から本文が取得可能なら退避ログを更新
    const chatText = ChatManager.getChatText(AppState, SELECTORS, document);
    if (chatText !== '') {
        AppState.tmpChatLogText = chatText;
        AppState.pendingExitChatLogText = chatText;
    }

    const hasPendingLog = AppState.pendingExitChatLogText !== '';
    const activeRoomId = getRoomId();
    const isCurrentRoom = AppState.pendingExitRoomId != null &&
        activeRoomId != null &&
        AppState.pendingExitRoomId === activeRoomId;

    // 3. 実機切り分け用の一時デバッグログ（本文は出さずフラグ・文字数のみ）
    console.debug('[GMCTC] beforeunload state', {
        wasSaveTarget: AppState.wasSaveTarget,
        isLiveSaveTarget: ChatManager.isSaveTarget(document, SELECTORS),
        chatTextLength: chatText.length,
        pendingTextLength: AppState.pendingExitChatLogText.length,
        pendingExitRoomId: AppState.pendingExitRoomId,
        activeRoomId: activeRoomId,
        visibilityState: document.visibilityState
    });

    // 4. 保存対象・退避ログあり・Room一致のすべてを満たさない場合は要求しない
    if (!AppState.wasSaveTarget || !hasPendingLog || !isCurrentRoom) {
        return;
    }

    // 5. W3C / ブラウザ標準の確認要求を設定
    event.preventDefault();
    event.returnValue = '';
});
```

### 3.3 判定マトリクス

| ケース | `wasSaveTarget` | live `div.hsLqkc` | 退避ログ | `pendingExitRoomId` | live `getRoomId()` | 期待される動作 |
|---|:---:|:---:|:---:|:---:|:---:|---|
| **正常系 (1): 初回 unload** | (未設定) ➔ `true` | あり | (未設定) ➔ あり | (未設定) ➔ `abc` | `abc` | `updateLogBackup` で退避後、`preventDefault()` + `returnValue = ''` を設定 |
| **正常系 (2): 会議中リロード** | `true` | あり | あり | `abc-defg-hij` | `abc-defg-hij` | `preventDefault()` + `returnValue = ''` を設定 |
| **正常系 (3): インジケーター消失後** | `true` | **なし** | あり | `abc-defg-hij` | `abc-defg-hij` | `preventDefault()` + `returnValue = ''` を設定 |
| **正常系 (4): live 本文取得不可** | `true` | なし | **退避ログあり** | `abc-defg-hij` | `abc-defg-hij` | `preventDefault()` + `returnValue = ''` を設定 |
| **抑止系 (1): 非対象ミーティング** | `false` | なし | なし | `abc-defg-hij` | `abc-defg-hij` | 確認要求を設定しない（早期 return） |
| **抑止系 (2): ログ空** | `true` | あり | **空** | `abc-defg-hij` | `abc-defg-hij` | 確認要求を設定しない（早期 return） |
| **抑止系 (3): Room 不一致 (stale)** | `true` | なし | あり (旧Room) | `old-room-id` | `new-room-id` | 確認要求を設定しない（早期 return） |
| **抑止系 (4): SPA遷移直後 (/landing)** | `true` | なし | あり (旧Room) | `old-room-id` | `null` (/landing) | 確認要求を設定しない（早期 return） |
| **抑止系 (5): Room ID 欠落 (null)** | `true` | なし | あり | `null` | `abc-defg-hij` | 確認要求を設定しない（安全側に抑止） |

---

## 4. 自動テスト設計 (`test/v6_dom_test.js`)

実装修正後、`test/v6_dom_test.js` に JSDOM を用いた以下のテストケースを追加・検証する（JSDOM では cancelable な `beforeunload` イベントの `event.defaultPrevented === true` を主 assertion とする）：

1. **初回 unload での退避と確認要求**:
   - 事前に `wasSaveTarget` や退避ログを設定せず、保存対象 DOM と非空チャットを用意した状態で `beforeunload` を発火し、`updateLogBackup(document)` により退避された上で `event.defaultPrevented === true` となること。
2. **Live DOM 消失時の確認要求（原因1の検証）**:
   - `wasSaveTarget = true`, `pendingExitChatLogText = "text"`, Room 一致の状態で、DOM から `div.hsLqkc` を削除して `beforeunload` イベントを発火した場合に `event.defaultPrevented === true` となること。
3. **Live 本文空時の退避ログ利用（原因2の検証）**:
   - `div.hsLqkc` は存在するがチャットコンテナが空の状態で、既存の `pendingExitChatLogText` が非空なら `event.defaultPrevented === true` となること。
4. **非保存対象での抑止**:
   - `wasSaveTarget = false` の場合、`event.defaultPrevented === false` であること。
5. **空ログでの抑止**:
   - `pendingExitChatLogText = ''` の場合、`event.defaultPrevented === false` であること。
6. **Room 不一致での抑止**:
   - `pendingExitRoomId` と発火時の `getRoomId()` が不一致の場合、`event.defaultPrevented === false` であること。
7. **SPA 遷移直後 (/landing) での抑止**:
   - `pendingExitRoomId` が設定されていても、URL が `/landing`（`getRoomId() === null`）の場合は `event.defaultPrevented === false` であること。
8. **Room ID 欠落での抑止**:
   - `pendingExitRoomId` が `null` の場合、`event.defaultPrevented === false` であること。

---

## 5. 実機手動検証手順 (`TC-1.5`)

[`docs/v6/manual_testing_scenario.md`](./manual_testing_scenario.md) に基づき、Chrome 実機にて以下を検証する：

1. **手動リロード時のダイアログ要求**:
   - 保存対象ミーティングでチャットログを作成後、手動でリロード（Cmd+R / F5）を開始。
   - Chrome 標準の確認ダイアログが表示されることを確認。
   - 「キャンセル」を選択して同一ページに留まれることを確認。
2. **タブ閉じ時のダイアログ要求**:
   - 同様にチャットログが存在する状態でタブを閉じる操作（Cmd+W）を行い、確認ダイアログが表示されることを確認。
3. **非対象・空ログ時の確認**:
   - チャット非保存ミーティングまたは空ログ状態でリロードし、ダイアログが表示されずに即時リロードされることを確認。

---

## 6. 受入基準 (P0)

- [ ] `wasSaveTarget === true`（または初回 `updateLogBackup` で記録）かつ `pendingExitChatLogText` が非空で、`pendingExitRoomId` と発火時 `getRoomId()` が一致する場合、live `div.hsLqkc` が消えていても `beforeunload` ハンドラーが `preventDefault()` と `returnValue = ''` を設定する（JSDOM 自動テストで検証）。
- [ ] 非対象ミーティング、空ログ、Room 不一致、SPA 遷移直後 (/landing)、Room ID 欠落の場合は確認要求が設定されない（JSDOM 自動テストで検証）。
- [ ] リロードとタブ閉じが同じメイン `beforeunload` 経路を通る（コード構造で確認）。
- [ ] Chrome 実機でユーザー操作後にリロード・タブ閉じを行った際、確認ダイアログが表示される（実機手動テストで検証）。
- [ ] PinP の `beforeunload` ハンドラーおよび既存のコピー機能に回帰がない（全ユニットテスト PASS で確認）。
