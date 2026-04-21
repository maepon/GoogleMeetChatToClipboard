# スペイン語対応 (i18n) 実装計画

## 概要

Google Meet Chat to Clipboard 拡張機能にスペイン語（es）のサポートを追加します。これにより、スペイン語圏のユーザーに対してより親しみやすいインターフェースを提供します。

## 実装内容

### 1. メッセージファイルの作成
- `_locales/es/messages.json` を新規作成します。
- 既存の英語（en）、日本語（ja）、韓国語（ko）の `messages.json` と同じキー構造を維持します。

#### 翻訳予定内容 (スペイン語)

| キー | 翻訳内容 | 説明 |
| :--- | :--- | :--- |
| `appName` | `Google Meet Chat to Clipboard` | 拡張機能名（通常は翻訳せずそのまま） |
| `appDesc` | `Copia los mensajes del chat de Google Meet en el portapapeles con un solo clic. Compatible con el modo Imagen en imagen (Picture-in-Picture).` | Chrome Web Store 用の説明文 |
| `copyButtonText` | `Copiar` | 退出後のUIに表示されるコピーボタンのテキスト |
| `clipboardWriteError` | `Error al copiar al portapapeles:` | クリップボード書き込み失敗時のエラーメッセージ |

### 2. 動作確認
- Chrome の言語設定をスペイン語に変更し、拡張機能の名称、説明、および UI（コピーボタン等）がスペイン語で表示されることを確認します。
- Google Meet 内でのチャットコピー機能が正常に動作することを確認します。

## 作業手順

1. **ブランチ作成**: `feature/add-spanish-support` (完了)
2. **計画書作成**: `docs/development/spanish_i18n_plan.md` (現在)
3. **ディレクトリ作成**: `_locales/es/` ディレクトリを作成
4. **翻訳ファイル作成**: `_locales/es/messages.json` を作成
5. **検証**: ブラウザの言語設定を切り替えて動作確認

## 完了条件

- [ ] `_locales/es/messages.json` が正しく作成されていること
- [ ] スペイン語環境で拡張機能名と説明がスペイン語（または設定通り）で表示されること
- [ ] 退出後の UI のボタンテキストが "Copiar" になっていること
- [ ] 全体的な機能（コピー、PinP 対応）に影響がないこと
