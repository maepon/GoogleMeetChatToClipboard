# 同一ブロック内連続メッセージの出力フォーマット改修計画書 (Rev 2: 完全アサート・確定版)

ユーザーからの実機テストフィードバック（`docs/v6/test_result/result002.md`）およびコードレビューに基づき、同一メンバーによる連続送信メッセージの出力フォーマットを実際の Google Meet 画面表示と一致させるための改修プランです。

---

## 1. 現状の挙動とユーザーからの改善要望

### 【現状の出力結果】
現在、同一人物が同一時刻に連続送信したメッセージ（例：「相手の送信6」「相手の送信7」）において、メッセージ本文ごとに発信者名と時刻が繰り返し出力されています。

```text
機能拡張テスト用ボット
12:58
相手の送信6
機能拡張テスト用ボット
12:58
相手の送信7
```

### 【画面表示に合わせた期待される出力フォーマット】
Google Meet 画面上では、1つのメッセージ親ブロック `Ss4fHf` 内に複数のメッセージレコード `RLrADb` が並び、ブロック冒頭に発言者名と時刻が 1 度だけ表示され、その下に連続メッセージ本文が並びます。コピー結果もこれと同一の自然なフォーマットに統一します。

```text
機能拡張テスト用ボット
12:58
相手の送信6
相手の送信7
```

---

## 2. 修正方針とコード設計 (`modules/ChatManager.js`)

`ChatManager.getChatText` において、1つのメッセージ親ブロック (`block`) ごとに発信者名 (`sender`) と時刻 (`time`) をブロック冒頭に **1度だけ** `blockLines` へ追加し、その配下に含まれる全メッセージレコードの本文 (`textElements`) を順次追加して改修します。

### 【修正案コード】

```javascript
messageBlocks.forEach(block => {
    const textElements = block.querySelectorAll(selectors.messageText);
    if (!textElements || textElements.length === 0) return;

    const timeEl = block.querySelector(selectors.messageTime);
    const senderEl = block.querySelector(selectors.messageSender);

    const getTextContent = (el) => {
        if (!el) return '';
        const value = typeof el.innerText === 'string' ? el.innerText : el.textContent;
        return (value || '').trim();
    };

    const sender = senderEl ? getTextContent(senderEl) : (appState ? (appState.selfName || '') : '');
    const time = getTextContent(timeEl);

    // ブロック単位の配列を生成（ヘッダー情報を冒頭に一度だけ追加）
    const blockLines = [];
    if (sender) blockLines.push(sender);
    if (time) blockLines.push(time);

    let hasValidText = false;
    textElements.forEach(textEl => {
        const text = getTextContent(textEl);
        if (text) {
            blockLines.push(text);
            hasValidText = true;
        }
    });

    if (hasValidText && blockLines.length > 0) {
        chatMessages.push(blockLines.join('\n'));
    }
});
```

---

## 3. 実装およびテストアサートの決定事項

1. **`ChatManager.js` 内の廃止済み `chatOutputFlag` 代入の完全削除**:
   - `_execCommandClipboard` や `saveChatFromPinP` 等の代入を完全に排除します。

2. **完全一致テスト（`assert.strictEqual`）による厳格なアサートの適用**:
   - `att_002/dom.txt` のテストにおいて、抽出文字列全体が期待される完全フォーマット（話者名・時刻がブロックごとに 1 度だけ出現し、本文が順序通り並ぶ文字列）と完全一致することをアサート検証します。

3. **フォーマット専用テストケースの追加**:
   - 「話者あり連続発言」「話者なし・`selfName`あり」「話者なし・`selfName`なし」「単独発言（従来形式維持）」を最小構成 HTML Fixture で網羅的にテストします。
