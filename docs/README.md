# 開発ドキュメント

このディレクトリには、Google Meet Chat to Clipboard拡張機能の開発に関するドキュメントが含まれています。

## ディレクトリ構成

### `/v6/`
Google Meet の新DOM構成への対応、および v6.0.0 の設計・実装ドキュメント

- **[`README.md`](./v6/README.md)**: v6 DOM Selector Workspace・共有方針・全設計書および完了報告書の目次
- **[`fix_reload_race_condition_plan.md`](./v6/fix_reload_race_condition_plan.md)**: リロード時レースコンディション解消 再設計計画書
- **[`fix_reload_race_condition_completion_report.md`](./v6/fix_reload_race_condition_completion_report.md)**: リロード時レースコンディション解消 完了報告書
- **[`fix_chrome_i18n_undefined_error_plan.md`](./v6/fix_chrome_i18n_undefined_error_plan.md)**: chrome.i18n 例外防御 修正計画書
- **[`fix_chrome_i18n_undefined_error_completion_report.md`](./v6/fix_chrome_i18n_undefined_error_completion_report.md)**: chrome.i18n 例外防御 完了報告書
- **[`log_driven_beforeunload_redesign_plan.md`](./v6/log_driven_beforeunload_redesign_plan.md)**: 退避ログ駆動型 beforeunload 再設計計画書
- **[`scope_and_edge_case_policy.md`](./v6/scope_and_edge_case_policy.md)**: スコープおよびエッジケース対応方針

### `/development/`
過去の開発プロセスとプランニング関連のドキュメント（v5以前）

- **`リファクタリングプラン.md`**: Phase 1〜4の段階的リファクタリング計画
- **`PinP対応プラン.md`**: Picture-in-Picture機能対応の実装プラン
- **`i18n実装計画.md`** / **`spanish_i18n_plan.md`**: 多言語対応計画

## プロジェクトの主要ドキュメント

### ルートディレクトリ
- **[`CLAUDE.md`](../CLAUDE.md)**: Claude Code用のプロジェクトガイダンス・開発規約
- **[`README.md`](../README.md)**: プロジェクト概要と変更履歴（Change Log）
- **[`PRIVACY_POLICY.md`](../PRIVACY_POLICY.md)**: プライバシーポリシー

## 開発履歴

### v6.0.0: Google Meet 新DOM対応 & 離脱防止機構の全面刷新 ✅完了
- Google Meet の新しい DOM 構成への selector 再設計
- チャット保存対象ミーティングの自動判定改善（`div.hsLqkc` 基準）
- 退避ログ駆動型の `beforeunload` ダイアログ制御および textarea 直接コピーの実装
- リロード過渡期のレースコンディション解消と `exitButtonClicked` による状態分離
- `chrome.i18n` 例外に対する包括的防御とフォールバック実装
- 自動テスト拡充（全 80 件 PASS）

### v5.2.0: スペイン語対応 ✅完了
- 多言語対応（英語、日本語、韓国語、スペイン語）

### v5.0.0: PinP対応 & モジュールリファクタリング ✅完了
- Picture-in-Picture 対応
- モジュール分割（ObserverManager, DOMUtils, ChatManager, UIManager）と AppState 状態管理の確立
