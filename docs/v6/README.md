# v6 DOM Selector Workspace

Google Meet の新しい画面構成に合わせて、`content.js` / `ChatManager.js` / `UIManager.js` で使う selector を再採番するための作業領域です。

## 目的

- 旧 DOM 前提の selector を洗い替える
- 各 selector の意味と利用箇所を固定する
- 実際に置き換える前の調査結果を1か所に集める

## ここまでで見えてきた方針

- 退出ボタンは `button[jsname="CQylAd"]` を起点に追う
- 見出しは `chatTitle` を基準にし、そこへコピー ボタンを差し込む
- チャット取得は「チャット一覧全体」ではなく「1件のメッセージブロック」を単位に扱う
- メッセージ本文、時刻、発信者表示を分けて読む
- 発信者表示がないメッセージは自分発言として扱う
- 旧DOMの「あなた」ラベル前提の判定は追わない
- PinP は別系統だが、selector の考え方は同じで、document の参照先だけ分ける

## Google Chat 保存判定

`保存されない状態` だけを起動条件にする。`保存される状態` を個別に判定するのではなく、`保存されない状態` の DOM が見えたときだけ拡張機能を有効化する。

### 判定案

- 判定タイミングは現行スクリプトの踏襲でよい。DOM監視の流れで `保存されない状態` を見つけたら有効化し、見つからなければ監視継続にする
- `content.js` は入室前画面から読み込まれるため、初期実行時に判定結果を確定しない
- 既存の `MutationObserver` / 定期監視 / 操作実行時の流れに条件判定を差し込み、判定のためだけに新しい起動タイミングを作らない
- 通常起動条件は `div.hsLqkc` の情報ブロックと `chatTitle` 構造の組み合わせで判定する
- `chatTitle` 構造はコピーボタンの配置にも使うため、通常起動条件に含めることで「保存されない状態として起動できること」と「コピー ボタンを置けること」を同時に確認する
- 退室時コピーのフォールバックでは、`chatTitle` 構造が見つからない場合でも `div.hsLqkc` があれば保存対象として扱う
- そのとき `aria-label` や表示文言は使わない
- 4言語提供を前提に、言語依存の属性やテキストではなく DOM の配置と役割だけで判定する
- 補助判定は、保存可側にだけ現れる要素との差分を探す方がよい。共通に出る入力領域は条件に入れない
- 固定ボタンや `information-message-id` は主判定に使わない

### 運用方針

- 基本的な動作フローは大きく変えない
- 既存の監視、イベント登録、コピー処理の流れを維持し、起動条件、操作対象、取得対象の変更として扱う
- 既存コードと同じく、対象 DOM がマッチした場合だけイベント登録や UI 注入を行う
- `保存されない状態` の判定も、事前に状態を確定するのではなく、DOM マッチを起点に機能を有効化する
- 退室ボタンのイベント登録は `chatTitle` に依存させない。既存どおり退室ボタンの DOM マッチで登録し、実行時に `div.hsLqkc` で保存対象か判定する
- コピーボタンの UI 注入は `div.hsLqkc` と `chatTitle` 構造が揃った場合だけ行う
- 上の条件を満たしたときだけ、チャット取得・コピー・退室時の自動保存を動かす
- 条件を満たさない場合は何もしない
- `GoogleChatDisableDom.txt` を主判定の基準にして、`GoogleChatEnableDom.txt` は非対象パターンの確認用に残す

### 実装時の確認事項

- `div.hsLqkc` と `chatTitle` の安定性は、Google Meet の DOM 変更に追随する前提で受け入れる
- 通常の保存対象判定や UI 注入では `div.hsLqkc` を使用する
- メインウィンドウの `beforeunload` 判定は、チャットパネル開閉状態に左右されないよう退避ログ（`pendingExitChatLogText`）と Room 一致を主軸にする
- PinP 側の `beforeunload` は今回の退避ログ駆動改修の対象外であり、既存の live DOM 判定を維持する
- 退室クリック時に `div.hsLqkc` がまだ参照できるかは、実装後に実機で確認する

## 作業ファイル

- [selector-workspace.md](./selector-workspace.md)

## 共有方針

- [スコープおよびエッジケース対応方針](./scope_and_edge_case_policy.md): v6 共通の P0/P1/P2、完了条件、対象外事項、レビュー基準。
- [TC-1.5 調査報告および確定修正仕様書](./tc1_5_investigation_report.md): 退出後 textarea 不表示の個別調査・修正記録。
- [TC-1.5 `beforeunload` 調査および実装指示](./tc1_5_beforeunload_investigation_and_implementation_instructions.md): 確認ダイアログ不表示と textarea 一瞬表示の原因切り分け・再修正指示。
- [コピー制御・非同期競合防止 改修完了報告書](./review_fix_completion_report.md): コピー状態管理の個別改修記録。
- [退避ログ駆動型 beforeunload 再設計 実装計画書](./log_driven_beforeunload_redesign_plan.md): 退避ログ基準のダイアログ判定・ライフサイクル再設計計画。
- [退避ログ駆動型 beforeunload 再設計 改修完了報告書](./log_driven_beforeunload_redesign_completion_report.md): 退避ログ駆動型判定・textarea 直接コピー実装の完了報告。
- [chrome.i18n 例外防御 修正計画書](./fix_chrome_i18n_undefined_error_plan.md): UIManager における i18n API 呼び出しの包括的例外防御・フォールバック計画。
- [chrome.i18n 例外防御 改修完了報告書](./fix_chrome_i18n_undefined_error_completion_report.md): i18n 例外防御・フォールバック実装の完了報告。
- [リロード時レースコンディション解消 再設計計画書](./fix_reload_race_condition_plan.md): リロード競合時のログ先行クリア・早期抑止解消のための再設計計画。
- [リロード時レースコンディション解消 完了報告書](./fix_reload_race_condition_completion_report.md): リロード競合解消、状態分離、ダイアログ確実化の実装完了報告。
