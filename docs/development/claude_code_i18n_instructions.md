# Chrome拡張機能 i18n対応 作業指示書

## 概要

GoogleMeetChatToClipboard Chrome拡張機能を多言語対応（英語・日本語）に変更する。
既存機能への影響を最小限に抑え、Chrome Web Storeでの海外展開を可能にする。

## 目標

- Chrome拡張機能のmanifest.jsonをi18n対応に変更
- 英語・日本語の言語ファイルを作成
- ユーザーのブラウザ言語設定に応じて拡張機能名・説明文が自動切り替わるようにする

## 現在のファイル構造

```
GoogleMeetChatToClipboard/
├── manifest.json
├── modules/
│   ├── ObserverManager.js
│   ├── DOMUtils.js
│   ├── ChatManager.js
│   └── UIManager.js
├── content.js
└── images/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 実装手順

### Step 1: _localesフォルダ構造を作成

以下のフォルダ構造を作成：

```
_locales/
├── en/
└── ja/
```

### Step 2: 英語版メッセージファイルを作成

ファイル: `_locales/en/messages.json`

```json
{
  "appName": {
    "message": "Google Meet Chat to Clipboard",
    "description": "Extension name"
  },
  "appDesc": {
    "message": "Save Google Meet chat messages to clipboard with one click. Supports Picture-in-Picture mode.",
    "description": "Extension description for Chrome Web Store"
  }
}
```

### Step 3: 日本語版メッセージファイルを作成

ファイル: `_locales/ja/messages.json`

```json
{
  "appName": {
    "message": "Google Meet Chat to Clipboard",
    "description": "拡張機能名"
  },
  "appDesc": {
    "message": "Google Meetのチャットの内容をクリップボードに保存する機能を追加する拡張機能です。",
    "description": "Chrome Web Store用の拡張機能説明文"
  }
}
```

### Step 4: manifest.jsonを更新

現在のmanifest.json:
```json
{
  "manifest_version": 3,
  "name": "Google Meet Chat to Clipboard",
  "version": "5.0.0",
  "permissions": ["clipboardWrite"],
  "action": {
    "default_icon": {
      "16": "images/icon16.png",
      "48": "images/icon48.png",
      "128": "images/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["*://meet.google.com/*"],
      "js": ["modules/ObserverManager.js", "modules/DOMUtils.js", "modules/ChatManager.js", "modules/UIManager.js", "content.js"]
    }
  ]
}
```

更新後のmanifest.json:
```json
{
  "manifest_version": 3,
  "name": "__MSG_appName__",
  "description": "__MSG_appDesc__",
  "version": "5.0.1",
  "default_locale": "en",
  "permissions": ["clipboardWrite"],
  "action": {
    "default_icon": {
      "16": "images/icon16.png",
      "48": "images/icon48.png",
      "128": "images/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["*://meet.google.com/*"],
      "js": ["modules/ObserverManager.js", "modules/DOMUtils.js", "modules/ChatManager.js", "modules/UIManager.js", "content.js"]
    }
  ]
}
```

**変更点:**
- `name`: `"__MSG_appName__"`に変更
- `description`: `"__MSG_appDesc__"`を新規追加
- `version`: `"5.0.1"`に変更
- `default_locale`: `"en"`を新規追加

### Step 5: 完成後のファイル構造確認

```
GoogleMeetChatToClipboard/
├── manifest.json                    # 更新済み
├── _locales/                        # 新規作成
│   ├── en/
│   │   └── messages.json           # 新規作成
│   └── ja/
│       └── messages.json           # 新規作成
├── modules/                         # 既存（変更なし）
│   ├── ObserverManager.js
│   ├── DOMUtils.js
│   ├── ChatManager.js
│   └── UIManager.js
├── content.js                       # 既存（変更なし）
└── images/                          # 既存（変更なし）
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## テスト手順

### 1. 拡張機能の読み込みテスト

1. Chrome拡張機能管理画面（chrome://extensions/）を開く
2. 「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」でフォルダを選択
4. エラーが出ないことを確認

### 2. 英語表示テスト

1. Chrome設定 → 詳細設定 → 言語
2. 「English (United States)」を一番上に移動
3. Chromeを完全再起動（全プロセス終了）
4. 拡張機能管理画面で名前と説明が英語で表示されることを確認

### 3. 日本語表示テスト

1. Chrome設定 → 詳細設定 → 言語
2. 「日本語」を一番上に移動
3. Chromeを完全再起動
4. 拡張機能管理画面で名前と説明が日本語で表示されることを確認

### 4. 機能テスト

1. Google Meet（https://meet.google.com/）にアクセス
2. 会議を開始またはテスト用会議に参加
3. チャット機能が正常に動作することを確認
4. クリップボードへのコピー機能が正常に動作することを確認

## エラー対処法

### エラー: "Invalid value for 'default_locale'"
**原因:** _locales/en/messages.json が存在しないか、形式が正しくない
**対処:** en フォルダと messages.json ファイルが正しく作成されているか確認

### エラー: "Could not load manifest"
**原因:** manifest.json の JSON 形式が正しくない
**対処:** JSON 構文をチェック（末尾のカンマ、クォートの対応など）

### 言語が切り替わらない
**原因:** Chrome のキャッシュが残っている
**対処:** 
1. Chrome を完全終了（タスクマネージャーでプロセス終了）
2. 拡張機能を一度削除して再読み込み
3. 再度言語設定を確認

### 拡張機能が動作しない
**原因:** content_scripts の読み込みに問題
**対処:** ブラウザの開発者ツールのコンソールでエラーメッセージを確認

## パッケージ化手順

テスト完了後、Chrome Web Store用パッケージを作成：

1. 拡張機能管理画面で「パッケージ化」をクリック
2. 拡張機能のルートディレクトリを選択
3. .crx ファイルが生成されることを確認
4. zip ファイルとしても保存（Chrome Web Store アップロード用）

## 完了チェックリスト

- [ ] _locales/en/messages.json が作成されている
- [ ] _locales/ja/messages.json が作成されている
- [ ] manifest.json が正しく更新されている
- [ ] 拡張機能がエラーなしで読み込まれる
- [ ] 英語環境で英語表示される
- [ ] 日本語環境で日本語表示される
- [ ] Google Meet でチャット機能が正常動作する
- [ ] クリップボードコピー機能が正常動作する
- [ ] パッケージ化が正常に完了する

## 注意事項

1. **既存ファイルのバックアップ:** manifest.json は必ずバックアップを取る
2. **段階的テスト:** 各ファイル作成後に都度動作確認する
3. **Chrome再起動:** 言語切り替え時は必ず Chrome を完全再起動する
4. **JSON形式:** messages.json は厳密な JSON 形式を守る
5. **権限変更なし:** permissions は変更しない（既存機能への影響回避）

## 今後の拡張案

他言語サポート追加時は以下のファイルを追加：
- `_locales/ko/messages.json` （韓国語）
- `_locales/zh/messages.json` （中国語簡体字）
- `_locales/zh_TW/messages.json` （中国語繁体字）

各言語の messages.json に同じキー（appName, appDesc）を追加するだけで対応可能。