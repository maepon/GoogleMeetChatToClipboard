# `beforeunload` の `event.returnValue` 修正計画書 (軽量版)

## 1. 目的
[`content.js`](file:///Users/maepon/work/GoogleMeetChatToClipboard/content.js) の 342行目を空文字列から非空文字列（`'confirm?'`）へ変更し、Chromium の `beforeunload` ダイアログを正常に発火させます。

---

## 2. 変更内容

### [`content.js`](file:///Users/maepon/work/GoogleMeetChatToClipboard/content.js)

```diff
--- a/content.js
+++ b/content.js
@@ -340,4 +340,4 @@ window.addEventListener('beforeunload', (event) => {
     // 7. 会議中（通話中）の離脱時のみ W3C / ブラウザ標準の確認要求を設定
     event.preventDefault();
-    event.returnValue = '';
+    event.returnValue = 'confirm?';
 });
```

---

## 3. 検証
1. `npm test` による全テスト PASS 確認
2. Chrome 実機でのリロード・タブ閉じ時のダイアログ表示確認
