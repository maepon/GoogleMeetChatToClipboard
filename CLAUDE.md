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

## 報告・レビュー・品質基準ルール / Evidence-Based Reporting & Review Policy

今後新規作成・更新される報告書、コードレビュー、ステータス更新において、誇大表現（Over-claiming）を防止し、厳格なエビデンスベースで記述するために以下のリポジトリ規約を常時遵守すること（※過去の調査記録等の歴史的文書を除く）：

1. **テスト環境と本番実装の厳格な分離**:
   - JSDOM やモック環境でタイマーを解放してテストが自然終了したことを、本番コードの破棄ライフサイクルまで「対応済み」と表現しない。
   - 本番用ライフサイクルや停止ハンドルが未実装の場合は、テストが通っていても「検証環境上の確認」「部分対応」と正確に記載する。
2. **ステータス判定の客観的規律**:
   - 実機手動テスト（`manual_testing_scenario.md` 等）の受入チェックが未完了の段階で、文書ステータスや結論を「完了」「確定版」「すべて解決」と断定しない。必ず「自動テスト完了・実機検証待ち」と表現する。
3. **P0 / P1 / P2 分類の厳密遵守**:
   - `docs/v6/scope_and_edge_case_policy.md` を単一の真実源（Single Source of Truth）とし、独自判断で P1 項目を P0 に混入させたり、未対応 P1 項目を対応済みと誤認させない。
4. **禁止表現の自発的抑止**:
   - 「100%」「すべて解消」「絶対に」「確実に動作する」などの絶対的表現を使用せず、「確認した範囲（JSDOM 30件）において動作を確認」「定義された P0 条件下で検証」と条件を明記する。

### [Pre-flight Check] 回答・ドキュメント作成前の自己確認項目
回答やドキュメントを提示する前に、以下の 4 点を必ず自己確認する：
- [ ] テスト環境だけの動作確認を「本番機能対応」と表現していないか？
- [ ] 実機チェック欄（`manual_testing_scenario.md`）が未完了の状態で「完了/確定」と断定していないか？
- [ ] P0/P1/P2 の分類が `scope_and_edge_case_policy.md` と完全一致しているか？
- [ ] 「完全」「確実」「すべて」「100%」などの誇大・絶対的形容詞が含まれていないか？

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

## 現在の開発状況 / Current Development Status

### 完了済み / Completed
- **Phase 1: 状態管理とCONFIG設定の外部化** ✅
  - AppStateオブジェクトによる状態管理統合
  - CONFIGオブジェクトによる設定値外部化
  - コードの保守性向上完了

- **Phase 2: 関数の責務分離** ✅
  - モジュール分割と単一責任原則の適用完了
  - DOMUtils, ChatManager, UIManager等の作成完了
  - 各モジュールの責務：
    - DOMUtils: DOM操作とObserver関連
    - ChatManager: チャット処理と状態管理
    - UIManager: UI作成とスタイル処理

- **Phase 3: Observer機能の統一** ✅
  - ObserverManagerモジュールによる汎用Observer機能の作成完了
  - 全てのMutationObserver処理を統一
  - UIManagerのsetTimeout → MutationObserver移行完了
  - Copilotレビュー指摘事項の改善完了

- **Phase 4: PinP対応の統合** ✅
  - Picture-in-Picture機能の完全実装
  - PinP内での退出ボタンとコピーボタンのイベントリスナー実装
  - メインウィンドウとPinPウィンドウ間のpostMessage通信機能
  - PinP内でのUIManager初期化とコピーボタン作成機能
  - PinPウィンドウのbeforeunloadイベント対応
  - 統合アプローチによる既存機能との一貫性を保持

- **Phase 5: Chrome Web Store登録準備** ✅
  - 多言語対応（日本語、英語、韓国語）の実装完了
  - i18n対応によるメッセージの国際化
  - プライバシーポリシーの作成完了
  - UI要素のローカライゼーション（コピーボタン、エラーメッセージ）
  - Chrome Web Store登録に必要な要件の完備

### 進行中・予定 / In Progress / Planned
- **将来的な改善項目** 📋
  - エラーハンドリングの強化
  - パフォーマンスの最適化

### 参考資料 / References
- 詳細な計画: `docs/development/リファクタリングプラン.md`
- PinP対応: `docs/development/PinP対応プラン.md`