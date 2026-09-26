# UIManager.js における `chrome.i18n` 未定義・例外スローに対する包括的防御 修正計画書（レビュー反映版）

**文書ステータス:** レビュー反映版（確定・承認待ち）  
**対象機能:** 退出後 UI 生成（`UIManager.createExitedUI`）における `chrome.i18n` API 呼び出しの例外防御、固定フォールバック文言処理、および実経路での UI 生成継続  
**準拠方針書:** [`docs/v6/scope_and_edge_case_policy.md`](./scope_and_edge_case_policy.md)  
**関連文書:** [`docs/v6/log_driven_beforeunload_redesign_plan.md`](./log_driven_beforeunload_redesign_plan.md), [`docs/v6/log_driven_beforeunload_redesign_completion_report.md`](./log_driven_beforeunload_redesign_completion_report.md)

---

## 1. 課題の概要 (Goal Description)

### 1.1 発生している不具合
実機手動テスト（リロード時）において、以下の未処理例外が発生し、スクリプトの実行が中断される事象が確認されました：
```text
Uncaught TypeError: Cannot read properties of undefined (reading 'getMessage')
at modules/UIManager.js:93
```

### 1.2 原因分析
[`modules/UIManager.js`](file:///Users/maepon/work/GoogleMeetChatToClipboard/modules/UIManager.js#L93) の `createExitedUI()` 内において、直接 `chrome.i18n.getMessage('copyButtonText')` を呼び出していました。  
リロードや画面遷移の過渡期、あるいは拡張機能の再読み込み後に拡張機能コンテキストが無効化（Extension Context Invalidated）された状態では、`chrome.i18n` の参照自体が `undefined` となるか、`getMessage()` の呼び出しが例外をスローします。

### 1.3 修正の目的と位置付け
単なる API 存在確認にとどまらず、**i18n API が利用不能（未定義・例外発生・空文字戻り値）な異常状態であっても、退出後 UI の生成とログ救出処理を確実に継続させるための包括的防御処理（`try/catch`）を導入**します。

---

## 2. 仕様・設計方針

### 2.1 例外捕捉とフォールバックの設計
- `chrome` オブジェクトへのアクセス、`chrome.i18n` の確認、`getMessage()` の実行全体を `try/catch` ブロックで囲みます。
- いかなる例外が発生した場合でも、エラーを外部へ漏出（クラッシュ）させず、デフォルトのボタン文言を設定して処理を継続します。
- フォールバック発生時は Console に未処理エラーを出力せず、正常な回復経路として処理します。

### 2.2 多言語フォールバックの方針（方針 A 採用）
- **方針 A（固定フォールバック文言）を採用**:
  - 拡張機能 API が利用できない異常状態に限られるため、フォールバック文言は固定文字列 **`'コピー'`** を使用します。
  - 本改修の主目的は「例外によるクラッシュを防止し、チャットログの救出（コピー）経路を維持すること」であり、異常系における多言語表示の完全性よりもコードの簡潔性と堅牢性を最優先とします。

---

## 3. コード変更仕様

### コンポーネント: UI モジュール (`modules/UIManager.js`)

#### [MODIFY] [`modules/UIManager.js`](file:///Users/maepon/work/GoogleMeetChatToClipboard/modules/UIManager.js)

```javascript
// createExitedUI 内
const copyButton = targetDoc.createElement('button');
let copyButtonText = 'コピー';

try {
    if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
        const msg = chrome.i18n.getMessage('copyButtonText');
        if (msg) {
            copyButtonText = msg;
        }
    }
} catch (error) {
    // 拡張機能コンテキスト無効化等の異常系ではフォールバック文言を使用（例外を外へ漏らさない）
}

copyButton.textContent = copyButtonText;
copyButton.type = 'button';
copyButton.addEventListener('click', () => {
    if (typeof saveChatLogCallback === 'function') {
        saveChatLogCallback(textarea.value);
    }
});
```

---

## 4. テスト計画

### 4.1 自動テスト項目 ([`test/v6_dom_test.js`](file:///Users/maepon/work/GoogleMeetChatToClipboard/test/v6_dom_test.js))

以下の 7 パターンを単体・結合テストとして追加・検証します：

| # | テストケース名 | 検証条件 | 期待動作 |
|---|---|---|---|
| 1 | `chrome` が `undefined` | `window.chrome = undefined` | 例外なく `'コピー'` でボタン生成 |
| 2 | `chrome.i18n` が `undefined` | `window.chrome = {}` | 例外なく `'コピー'` でボタン生成 |
| 3 | `getMessage` が関数でない | `window.chrome = { i18n: {} }` | 例外なく `'コピー'` でボタン生成 |
| 4 | `getMessage()` が空文字列を返す | `getMessage: () => ''` | 例外なく `'コピー'` でボタン生成 |
| 5 | `getMessage()` が例外を投げる | `getMessage: () => { throw new Error('Context invalidated'); }` | 例外なく `'コピー'` でボタン生成 |
| 6 | 正常な i18n API が利用可能 | `getMessage: (key) => 'ローカライズ文言'` | 取得された文言でボタン生成 |
| 7 | 退出後 UI の実経路結合テスト | `window.chrome.i18n = undefined` の状態で `checkAndCreateExitedUI()` 実行 | 中断せず textarea とボタンが挿入され、`pendingExitChatLogText` が消費されること |

---

## 5. 実機手動検証計画

Chrome 実機環境において以下の手順で確認します：

1. 拡張機能を再読み込み・更新後、古い Meet 会議室タブでチャットが存在する状態でリロード（Cmd+R / F5）を実行。
2. DevTools Console で `Uncaught TypeError: Cannot read properties of undefined (reading 'getMessage')` などの未処理例外が発生しないことを確認。
3. ダイアログキャンセル後、退出後 UI（textarea と「コピー」ボタン）が正常に生成されることを確認。
4. コピーボタン押下で textarea の内容がクリップボードへ正常コピーされることを確認。
5. PinP 画面の各ボタン操作でも同様の例外が発生しないことを確認。
