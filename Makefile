ISSUE ?= 1

# 判定が収束しなかったら人に投げるまでの周回数
MAX_ROUNDS ?= 3

# PR のベースにするブランチ。scripts/ と prompts/ はこの値だけを使う（直書きは make check が落とす）
# 移植先の既定ブランチに合わせて変える（GitHub の新規リポジトリは main、古いリポジトリは master のことがある）
BASE_BRANCH ?= main

# フローが使うモデルは2ティア。どのフェーズにどちらを割り当てるかは run-phase.sh 側にある。
# 製品名ではなく能力で名付けてあるのは、割り当てが名前ではなく方針だから
# （REVIEW_JUDGE_MODEL で実際に入れ替えて試している）。
# 使うモデルを変えるときに触るのはこの2行だけ。
STRONG_MODEL ?= $(CLAUDE_CODE_OPUS_MODEL)
FAST_MODEL ?= $(CLAUDE_CODE_SONNET_MODEL)

# 通知に載せる Issue URL を origin から組み立てる
REPO_URL := $(shell git remote get-url origin | sed -e 's,^git@github.com:,https://github.com/,' -e 's,\.git$$,,')
ISSUE_URL = $(REPO_URL)/issues/$(ISSUE)

# 各自の設定。.env は git 管理外（.env.example 参照）
-include .env

# impl内レビューの判定モデルだけ差し替えられる。fast / strong か、生のモデルIDを受ける。
# 未設定なら run-phase.sh が強モデルを使う
REVIEW_JUDGE_MODEL ?= $(FAST_MODEL)

export SLACK_WEBHOOK_URL STRONG_MODEL FAST_MODEL MAX_ROUNDS BASE_BRANCH REVIEW_JUDGE_MODEL

.PHONY: help spec impl review code-review pr-review check check-env

.DEFAULT_GOAL := help

help:
	@echo "AI開発フロー（人間ゲートは指示書の確認1箇所）"
	@echo
	@echo "  make spec ISSUE=n     強モデルが Issue を読み、質問状 または 指示書 を投稿して止まる"
	@echo "                        質問状なら、Issue にコメントで回答して spec を再実行"
	@echo
	@echo "  （人が指示書を確認する。直したければ Issue にコメントして spec を再実行）"
	@echo
	@echo "  make impl ISSUE=n     指示書から PR まで一気に進む"
	@echo "                        高速モデルが計画書とテストシナリオを作り、強モデルが指示書"
	@echo "                        との齟齬を判定、高速モデルが改訂。承認されたら実装し、続けて"
	@echo "                        強モデルがレビュー、高速モデルが修正。承認されたら PR を作り、"
	@echo "                        最後に強モデルがコードレビューとして PR にコメントする"
	@echo "                        （マージは人。収束しなければ止まって人に投げる）"
	@echo
	@echo "  make review ISSUE=n   impl の後半（レビュー以降）だけを回す"
	@echo "                        impl が止まったあと、手で直して再開するときに使う"
	@echo
	@echo "  make code-review ISSUE=n  PR への純粋なコードレビューだけを回す（現在のブランチの PR に投稿）"
	@echo "                        判定ではないので、何が出ても PR は閉じない"
	@echo
	@echo "  make pr-review ISSUE=n  PR への反論（Devil's Advocate）だけを回す"
	@echo "                        現在メインフローから外してある。必要なときに単独で実行する"
	@echo
	@echo "  make check            基盤ファイル（scripts / .claude / prompts）の静的検査だけを走らせる"
	@echo "                        上の各フェーズの前に自動で通るので、普段は単独で呼ばなくてよい"
	@echo
	@echo "変数: ISSUE（対象Issue番号） MAX_ROUNDS（判定の最大周回数、既定 $(MAX_ROUNDS)）"
	@echo "      BASE_BRANCH  PR のベースブランチ（既定 $(BASE_BRANCH)）"
	@echo "      STRONG_MODEL / FAST_MODEL  強モデル・高速モデルのID（既定は環境変数から）"
	@echo "      REVIEW_JUDGE_MODEL  実装レビューの判定モデル。strong / fast か生のモデルIDを受ける"
	@echo "                          未設定なら強モデル"
	@echo "                          高速モデルで足りるかを試すとき: make impl ISSUE=n REVIEW_JUDGE_MODEL=fast"
	@echo "                          （計画の判定は文章同士の突き合わせなので強モデル固定）"
	@echo "経緯はすべて Issue のコメントに残る（AI-TAG で種別を識別）"

# 基盤ファイルの静的検査。フェーズの前に必ず通す（内容は scripts/check-scripts.sh の冒頭）
check:
	@./scripts/check-scripts.sh

# 未設定のまま走らせて途中で落ちるのを防ぐ
check-env:
	@if [ -z "$(strip $(SLACK_WEBHOOK_URL))" ]; then \
		echo "Error: SLACK_WEBHOOK_URL が未設定です。.env.example を .env にコピーして設定してください。" >&2; \
		exit 1; \
	fi
	@if [ -z "$(strip $(STRONG_MODEL))" ] || [ -z "$(strip $(FAST_MODEL))" ]; then \
		echo "Error: 強モデル / 高速モデルのIDが未設定です。参照元の CLAUDE_CODE_OPUS_MODEL / CLAUDE_CODE_SONNET_MODEL を設定するか、.env に STRONG_MODEL / FAST_MODEL を書いてください。" >&2; \
		exit 1; \
	fi

spec: check check-env
	@./scripts/run-phase.sh spec $(ISSUE) "$(ISSUE_URL)"

impl: check check-env
	@./scripts/run-phase.sh impl $(ISSUE) "$(ISSUE_URL)"

review: check check-env
	@./scripts/run-phase.sh review $(ISSUE) "$(ISSUE_URL)"

code-review: check check-env
	@./scripts/run-phase.sh code-review $(ISSUE) "$(ISSUE_URL)"

pr-review: check check-env
	@./scripts/run-phase.sh pr-review $(ISSUE) "$(ISSUE_URL)"
