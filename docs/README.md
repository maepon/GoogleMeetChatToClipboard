# 開発ドキュメント

このディレクトリには、Google Meet Chat to Clipboard拡張機能の開発に関するドキュメントが含まれています。

## ディレクトリ構成

### `/development/`
開発プロセスとプランニング関連のドキュメント

- **`リファクタリングプラン.md`**: Phase 1〜4の段階的リファクタリング計画
- **`PinP対応プラン.md`**: Picture-in-Picture機能対応の実装プラン

### `/v6/`
Google Meet の新DOM向け selector 再設計用の作業領域

- **`selector-workspace.md`**: 旧 selector と新 selector を並べて管理する作業シート

## プロジェクトの主要ドキュメント

### ルートディレクトリ
- **`CLAUDE.md`**: Claude Code用のプロジェクトガイダンス
- **`README.md`**: プロジェクト概要と変更履歴

## 開発履歴

### Phase 1: 状態管理とCONFIG設定の外部化 ✅完了
- 2025-06-22: PR #1でマージ完了
- グローバル変数をAppStateオブジェクトに集約
- 設定値の外部化とコードの保守性向上

### Phase 2: 関数の責務分離 🚧準備中
- モジュール分割と単一責任原則の適用
- Picture-in-Picture対応の準備

## 参照

開発の詳細については、各フェーズの計画書を参照してください：
- [リファクタリング全体計画](development/リファクタリングプラン.md)
- [PinP対応計画](development/PinP対応プラン.md)
