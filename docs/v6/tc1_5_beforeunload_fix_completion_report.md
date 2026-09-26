# TC-1.5 `beforeunload` ダイアログ要求改修 報告書 (自動テスト完了・実機検証待ち)

**文書ステータス:** 自動テスト完了・実機検証待ち  
**準拠方針書:** [`docs/v6/scope_and_edge_case_policy.md`](./scope_and_edge_case_policy.md)  
**実装指示書:** [`docs/v6/tc1_5_beforeunload_investigation_and_implementation_instructions.md`](./tc1_5_beforeunload_investigation_and_implementation_instructions.md)  
**実機検証手順書:** [`docs/v6/manual_testing_scenario.md`](./manual_testing_scenario.md)

---

## 1. 概要

本ドキュメントは、手動テストシナリオ `TC-1.5` で発生した **「チャットログ保持状態でのリロード・タブ閉じ時に `beforeunload` 確認ダイアログ要求へ到達しない」** 問題に対するコード改修、JSDOM 自動テスト結果（全 46 件 PASS）、および実機検証待ちスコープをまとめた報告書です。

> **スコープ境界の遵守:**  
> 本改修はリロード・タブ閉じ時の確認ダイアログ要求到達にスコープを限定しています。textarea の一瞬表示やその表示抑止ライフサイクル（`AppState.isUnloading` 等）は今回の判定対象外として切り離しています。

---

## 2. 根本原因と改修内容

### 2.1 根本原因の整理
1. **Live DOM 依存（二重チェックによる早期 return）**:
   - `content.js` の `beforeunload` リスナー内で、直前に `updateLogBackup()` を実行しているにもかかわらず、再度 `ChatManager.isSaveTarget(document)` を評価していたため、画面遷移やリロード開始時に `div.hsLqkc` が DOM から消失していると `return` してダイアログ要求へ進まなかった。
2. **チャット本文取得の瞬間依存**:
   - 発火時点で live DOM のチャットコンテナが空化していると、退避ログ（`pendingExitChatLogText`）が存在していても `returnValue` 設定に到達しなかった。
3. **イベントキャンセル要求の補強不足**:
   - `e.preventDefault()` が呼ばれておらず、ブラウザ標準のキャンセル要求契約（`preventDefault()` + `returnValue = ''`）になっていなかった。
4. **SPA 遷移直後の stale Room リスク**:
   - 定期処理の遅延更新による `AppState.currentRoomId` ではなく、発火時点の live URL から取得した `getRoomId()` と `pendingExitRoomId` を厳格に照合する必要があった。

---

### 2.2 実装コードの変更 ([`content.js:261-295`](file:///Users/maepon/work/GoogleMeetChatToClipboard/content.js#L261-L295))

```javascript
window.addEventListener('beforeunload', (event) => {
    const activeRoomId = getRoomId();
    let currentChatText = '';

    // 1. 同一 Room または初回のみ退避処理を実行（別 Room の live DOM で旧退避ログを上書きしない）
    if (activeRoomId != null && (AppState.pendingExitRoomId == null || AppState.pendingExitRoomId === activeRoomId)) {
        updateLogBackup(document);

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

    // 2. 実機切り分け用の一時デバッグログ（本文は出さずフラグ・文字数のみ）
    console.debug('[GMCTC] beforeunload state', {
        wasSaveTarget: AppState.wasSaveTarget,
        isLiveSaveTarget: ChatManager.isSaveTarget(document, SELECTORS),
        chatTextLength: currentChatText.length,
        pendingTextLength: AppState.pendingExitChatLogText.length,
        pendingExitRoomId: AppState.pendingExitRoomId,
        activeRoomId: activeRoomId,
        visibilityState: document.visibilityState
    });

    // 3. 保存対象・退避ログあり・Room一致のすべてを満たさない場合は要求しない
    if (!AppState.wasSaveTarget || !hasPendingLog || !isCurrentRoom) {
        return;
    }

    // 4. W3C / ブラウザ標準の確認要求を設定
    event.preventDefault();
    event.returnValue = '';
});
```

---

## 3. 自動テスト検証結果 (`test/v6_dom_test.js`)

`test/v6_dom_test.js` に `beforeunload` イベントの検証ケースを追加し、`npm test` を実行しました。

### 3.1 `beforeunload` 関連テスト一覧

| テストケース | 検証内容 | 結果 |
|---|---|:---:|
| **初回 unload 退避** | 事前に退避状態がなくても、保存対象 DOM から退避した上で `defaultPrevented === true` となること | **PASS** |
| **Live `div.hsLqkc` 消失** | `div.hsLqkc` 消失後も退避状態と Room 一致で `defaultPrevented === true` となること（原因1） | **PASS** |
| **Live 本文空** | live チャット本文が空でも既存の退避ログと Room 一致で `defaultPrevented === true` となること（原因2） | **PASS** |
| **非保存対象抑止** | 保存対象外ミーティングでは `defaultPrevented === false` であること | **PASS** |
| **空ログ抑止** | 退避ログが空の場合は `defaultPrevented === false` であること | **PASS** |
| **Room 不一致抑止** | `pendingExitRoomId` と発火時 `getRoomId()` が不一致の場合は `defaultPrevented === false` であること | **PASS** |
| **SPA 遷移直後抑止** | `/landing` 画面（`getRoomId() === null`）では旧ログで要求せず `defaultPrevented === false` であること | **PASS** |
| **Room ID 欠落抑止** | `pendingExitRoomId` が `null` の場合は安全側に抑止され `defaultPrevented === false` であること | **PASS** |

### 3.2 テストスイート全体の実測結果

```text
> google-meet-chat-to-clipboard@6.0.0 test
> node test/v6_dom_test.js

==== v6 DOM & content.js 実体統合ユニットテスト開始 ====
...
[PASS] beforeunload (1): 初回 unload で保存対象 DOM から退避しキャンセル要求が設定されること
[PASS] beforeunload (2): live DOM から div.hsLqkc が消失していても退避状態と Room 一致でキャンセル要求が設定されること (原因1の検証)
[PASS] beforeunload (3): live 本文が空でも既存の退避ログと Room 一致でキャンセル要求が設定されること (原因2の検証)
[PASS] beforeunload (4): 非保存対象ミーティングではキャンセル要求が設定されないこと
[PASS] beforeunload (5): 退避ログが空の場合はキャンセル要求が設定されないこと
[PASS] beforeunload (6): Room ID が不一致の場合はキャンセル要求が設定されないこと (stale Room 抑止)
[PASS] beforeunload (7): SPA 遷移直後 (/landing) で live getRoomId() が null の場合はキャンセル要求が設定されないこと
[PASS] beforeunload (8): pendingExitRoomId が null の場合はキャンセル要求が設定されないこと

==== テスト実行完了: PASS: 46, FAIL: 0 ====
実行時間: 1.2s / 終了コード: 0 (自然終了確認済み)
```

---

## 4. 未対応事項と実機検証待ちスコープ

`scope_and_edge_case_policy.md` に基づき、検証境界を明記します。

### 4.1 P0 実機手動検証待ち項目 ([`docs/v6/manual_testing_scenario.md`](./manual_testing_scenario.md) TC-1.5)
- Chrome 実機環境でユーザー操作（sticky activation）後にリロード（Cmd+R / F5）およびタブ閉じ（Cmd+W）を行い、Chrome 標準の確認ダイアログが表示されること。
- 「キャンセル」を選択した際に同一ページに留まり、退避ログを用いたコピーが可能なこと。

### 4.2 未対応 P1 課題（将来の改善項目）
- コピー世代管理（Token / ID）。
- SPA 遷移後の旧非同期 Promise / PinP `setTimeout` 無効化。
- `autoCopySucceeded` 単独化リファクタリング。
- PinP 待機中 (100ms) の超高速遷移・タブ破棄。
- 本番常駐 `setInterval` のライフサイクル破棄ハンドル。

### 4.3 P2 対象外事項
- 完全リロード後の新 JavaScript コンテキストでのログ復元。
- ブラウザクラッシュ・強制終了。
- Chrome の表示制御（ダイアログ連続表示抑制等）。

---

## 5. 結論

コード改修および JSDOM 自動テスト（全 46 件 PASS、終了コード 0、自然終了）により、**「条件成立時（`wasSaveTarget === true`、非空退避ログ、Room ID 一致）における `beforeunload` キャンセル要求の確実な実行」** を確認しました。

現時点でのステータスは **「自動テスト完了・実機検証待ち」** であり、`TC-1.5` の最終完了判定には [`docs/v6/manual_testing_scenario.md`](./manual_testing_scenario.md) に基づく Chrome 実機手動テストの実施が必要です。
