# v6 Selector Workspace

Google Meet の DOM 改修に伴い、ここで各 selector を再定義する。

## 使い方

1. 現在の selector を確認する
2. 新DOM上で対応要素を特定する
3. 旧 selector を残したまま、新 selector をこの表に書き込む
4. 実装ファイルへ反映する前に、ここで一度レビューする

## 参照元

- `content.js`
- `modules/ChatManager.js`
- `modules/UIManager.js`

## Selector 一覧

| 名称 | 現在値 | 新値 | 役割 | 利用箇所 | 確認メモ |
| --- | --- | --- | --- | --- | --- |
| `exitButton` | `[jsname="CQylAd"]` | `button[jsname="CQylAd"]` | 退出ボタン | `content.js` | まずはこれで十分。`aria-label` はローカライズされるので避ける。 |
| `chatContainer` |  | `div[jsname="xySENc"][aria-live="polite"]` | チャット一覧の親コンテナ | `content.js`, `modules/ChatManager.js` |  |
| `chatMessage` | `[jsname="dTKtvb"] , [jsname="Ypafjf"]  [jsname="biJjHb"] , .poVWob` | `div[jsname="xySENc"][aria-live="polite"] > div.Ss4fHf[jsname="Ypafjf"]` | 1件分のメッセージブロック | `content.js`, `modules/ChatManager.js` | この粒度にすると、自分発言は発信者表示の有無で判定しやすい。 |
| `messageText` |  | `div[jsname="dTKtvb"]` | メッセージ本文 | `content.js`, `modules/ChatManager.js` |  |
| `messageTime` |  | `div[jsname="biJjHb"]` | 時刻表示 | `content.js`, `modules/ChatManager.js` |  |
| `messageSender` |  | `.poVWob` | 発信者表示。無い場合は自分発言扱いの前提 | `content.js`, `modules/ChatManager.js` |  |
| `removedMessage` | `.lAqQo .roSPhc[jsname="r4nke"]` |  | 退出後メッセージ検出 | `content.js` |  |
| `chatTitle` | `[jsname="uPuGNe"][role="heading"]` | `div[jsname="uPuGNe"] [role="heading"]` | チャット見出し。コピー ボタンはここに `after()` で差し込む | `content.js`, `modules/UIManager.js` | これは `保存されない状態` 側の DOM で生きているアンカー候補。`GoogleChat有効` 側では成立しない前提で扱う。`hsLqkc` ほどの主判定ではないが、補助の負シグナルにはなりうる。 |
| `chatMemberName` | `.ASy21[title]` |  | 自分の表示名取得 | `content.js`, `modules/ChatManager.js` | 生きていることを確認済み。現状は変更不要。 |
| `selfNameElement` | `.Ss4fHf:has(.ym5LMd) .poVWob` |  | 旧DOMでの自分ラベル取得 | `content.js`, `modules/ChatManager.js` | 新DOMでは使わない。発信者表示の有無で自分発言を判定する方針に切り替える。 |
| `selfNameTextElement` | `[role="tooltip"]` |  | 旧DOMでの補助確認用 | `content.js` | 新DOMでは未使用。 |
## メモ

- `jsname` は変更されやすいので、可能なら役割ベースの selector を優先する
- 文字列の再利用先が複数あるため、変更はこの表を更新してから実装に入る
- PinP 側の DOM も同時に確認する
