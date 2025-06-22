# CLAUDE.md

このファイルは、このリポジトリでClaude Code (claude.ai/code) が動作する際のガイダンスを提供します。
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 使用言語 / Communication Language

すべてのコミュニケーションは日本語で行ってください。以下の項目で日本語を使用してください：
All communication should be conducted in Japanese. Use Japanese for:
- コードのコメントと説明 / Code comments and explanations
- コンソール出力とデバッグメッセージ / Console output and debugging messages
- エラーメッセージとステータス更新 / Error messages and status updates
- ドキュメントとコミットメッセージ / Documentation and commit messages

## プロジェクト概要 / Project Overview

これは、ユーザーが会議を退出する際にGoogle Meetのチャットメッセージを自動的にクリップボードにコピーするChrome拡張機能です。この拡張機能はManifest V3で構築され、コンテンツスクリプトを使用してGoogle MeetのDOMと対話します。
This is a Chrome extension that automatically copies Google Meet chat messages to the clipboard when users exit a meeting. The extension is built with Manifest V3 and uses content scripts to interact with Google Meet's DOM.

## アーキテクチャ / Architecture

### 主要コンポーネント / Core Components

- **`manifest.json`**: 権限とコンテンツスクリプトの注入を定義するChrome拡張機能のマニフェスト / Chrome extension manifest defining permissions and content script injection
- **`content.js`**: DOM監視、チャット抽出、クリップボード操作を処理するメインコンテンツスクリプト / Main content script that handles DOM observation, chat extraction, and clipboard operations
- **`images/`**: 拡張機能のアイコン（16px、48px、128px） / Extension icons (16px, 48px, 128px)

### 主要機能 / Key Functionality

拡張機能は以下の主要メカニズムで動作します：
The extension operates through several core mechanisms:

1. **DOM監視**: MutationObserverを使用してGoogle Meet UIの変更を監視 / **DOM Observation**: Uses MutationObserver to watch for Google Meet UI changes
2. **イベント添付**: 退出ボタンとコピーボタンにクリックハンドラーを動的に添付 / **Event Attachment**: Dynamically attaches click handlers to exit buttons and copy buttons
3. **チャット抽出**: 特定のCSSセレクターを使用してチャットメッセージを解析 / **Chat Extraction**: Parses chat messages using specific CSS selectors
4. **自己名検出**: チャットログ内のユーザーの表示ラベルを識別し置換 / **Self-Name Detection**: Identifies and replaces the user's display label in chat logs
5. **クリップボード統合**: Clipboard APIを使用してチャットコンテンツを保存 / **Clipboard Integration**: Uses the Clipboard API to save chat content

### 重要なセレクター / Critical Selectors

拡張機能はGoogle Meetの内部CSSセレクターに依存しています（content.js:1-13）：
The extension relies on Google Meet's internal CSS selectors (content.js:1-13):
- 退出ボタン / Exit button: `[jsname="CQylAd"]`
- チャットメッセージ / Chat messages: `[jsname="dTKtvb"]`, `[jsname="Ypafjf"] [jsname="biJjHb"]`, `.poVWob`
- 自己名要素 / Self-name elements: `.Ss4fHf:has(.ym5LMd) .poVWob`

これらのセレクターは脆弱で、GoogleがMeetのDOM構造を変更した際に頻繁な更新が必要です。
These selectors are fragile and frequently require updates when Google changes Meet's DOM structure.

## 開発ワークフロー / Development Workflow

### 変更のテスト / Testing Changes
- Chrome拡張機能を`chrome://extensions/`の開発者モードで読み込み / Load the extension in Chrome via `chrome://extensions/` in Developer Mode
- ライブ会議環境で`meet.google.com`でテスト / Test on `meet.google.com` in a live meeting environment
- 会議退出時にチャットコピーが動作することを確認 / Verify chat copying works when exiting meetings

### デバッグ / Debugging
- Chrome DevToolsコンソールを使用してDOM変更を検査 / Use Chrome DevTools Console to inspect DOM changes
- Google Meetがインターフェースをアップデートしたときのセレクター更新を確認 / Check for selector updates when Google Meet updates its interface
- DOM変更のMutationObserverコールバックを監視 / Monitor MutationObserver callbacks for DOM changes

## 一般的なメンテナンスタスク / Common Maintenance Tasks

### セレクターの更新 / Updating Selectors
Google MeetがDOM構造を変更した場合：
When Google Meet changes its DOM structure:
1. DevToolsで新しいDOM要素を検査 / Inspect the new DOM elements in DevTools
2. content.js:3-13の`SELECTORS`オブジェクトを更新 / Update the `SELECTORS` object in content.js:3-13
3. 実際の会議で徹底的にテスト / Test thoroughly with actual meetings
4. manifest.jsonのバージョンを更新 / Update version in manifest.json

### バージョン管理 / Version Management
- `manifest.json`のバージョンフィールドを更新 / Update `manifest.json` version field
- README.mdの変更履歴に変更を記録 / Document changes in README.md changelog
- DOM変更についての説明的なメッセージでコミット / Commit with descriptive messages about DOM changes

## 拡張機能の権限 / Extension Permissions

拡張機能には最小限の権限が必要です：
The extension requires minimal permissions:
- `clipboardWrite`: チャットコンテンツをクリップボードにコピーするため / For copying chat content to clipboard
- `*://meet.google.com/*`へのコンテンツスクリプトアクセス / Content script access to `*://meet.google.com/*`

## 既知の制限事項 / Known Limitations

- Google Meetの内部CSSクラスとDOM構造に依存 / Dependent on Google Meet's internal CSS classes and DOM structure
- GoogleがMeetのインターフェースを変更した際に頻繁な更新が必要 / Requires frequent updates when Google changes Meet's interface
- Google Meetのみで動作（他のビデオ会議プラットフォームでは動作しない） / Only works with Google Meet (not other video conferencing platforms)