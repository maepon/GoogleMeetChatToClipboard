ISSUE ?= 1

# Number of judging rounds before handing a non-converging verdict to a human
MAX_ROUNDS ?= 3

# Project settings (base branch, test and format commands, output language), in .ai-flow/ at the repository root.
# The extra permissions and the text embedded in prompts live in the same directory. check-project stops if it is missing
AI_FLOW_PROJECT_DIR := $(shell git rev-parse --show-toplevel)/.ai-flow
-include $(AI_FLOW_PROJECT_DIR)/config.mk

# Default when config.mk does not set it (kept in sync with the fallback in scripts/)
BASE_BRANCH ?= main

# The flow uses two model tiers. Which phase gets which tier is decided in run-phase.sh.
# They are named by capability rather than product name because the assignment is a policy, not a name
# (it is actually swapped to experiment, via REVIEW_JUDGE_MODEL).
# These two lines are the only place to touch when changing models.
STRONG_MODEL ?= $(CLAUDE_CODE_OPUS_MODEL)
FAST_MODEL ?= $(CLAUDE_CODE_SONNET_MODEL)

# Build the Issue URL shown in notifications from origin
REPO_URL := $(shell git remote get-url origin | sed -e 's,^git@github.com:,https://github.com/,' -e 's,\.git$$,,')
ISSUE_URL = $(REPO_URL)/issues/$(ISSUE)

# Personal settings. .env is not tracked by git (see .env.example)
-include .env

# Only the judges' model (plan-judge / review-judge) can be swapped. Accepts fast / strong or a raw model ID.
# If unset, run-phase.sh uses the strong model
REVIEW_JUDGE_MODEL ?= $(FAST_MODEL)

# Notifications. run-phase.sh runs NOTIFY_CMD at each ending (done / waiting for a human / aborted) and progress point,
# passing the body on stdin and the rest in AI_FLOW_NOTIFY_* environment variables (contract: docs/setup.md).
# Empty means no notifications. When it is not defined at all, Slack is used if SLACK_WEBHOOK_URL is set, otherwise nothing,
# so a .env with only SLACK_WEBHOOK_URL keeps working and trying the flow needs no chat service.
# origin tells "not defined" apart from "defined as empty" (NOTIFY_CMD = in .env turns notifications off on purpose).
ifeq ($(origin NOTIFY_CMD),undefined)
NOTIFY_CMD := $(if $(strip $(SLACK_WEBHOOK_URL)),./scripts/notify-slack.sh)
endif

# Environment variables holding the notification command's secrets (space-separated names). They are exported for NOTIFY_CMD,
# and claude-run.sh removes the same names from the agents' environment. One list drives both, so forgetting a name
# means the notification does not get its secret (make does not export it), never that the agents can read it.
NOTIFY_SECRET_VARS ?= SLACK_WEBHOOK_URL

export NOTIFY_CMD NOTIFY_SECRET_VARS $(NOTIFY_SECRET_VARS)
export STRONG_MODEL FAST_MODEL MAX_ROUNDS BASE_BRANCH REVIEW_JUDGE_MODEL
export AI_FLOW_PROJECT_DIR TEST_CMD SCRATCH_TEST_CMD FORMAT_CHECK_CMD FORMAT_FILE_CMD FORMAT_FIX_CMD FORMAT_GLOBS OUTPUT_LANG

.PHONY: help spec impl review code-review pr-review create-pr check check-project check-env

.DEFAULT_GOAL := help

help:
	@echo "issue-to-pr-flow (the only human gate is checking the instruction document)"
	@echo
	@echo "  make spec ISSUE=n     The strong model reads the Issue and posts questions OR an instruction document, then stops"
	@echo "                        For questions, answer in an Issue comment and re-run spec"
	@echo
	@echo "  (A human checks the instruction document. To change it, comment on the Issue and re-run spec)"
	@echo
	@echo "  make impl ISSUE=n     Goes from the instruction document all the way to a PR"
	@echo "                        The fast model writes the plan (test scenarios, or verification steps without tests),"
	@echo "                        the judge checks it against the instruction document, and the fast model revises. Once approved it implements;"
	@echo "                        then the judge reviews and the fast model fixes. Once approved it creates the PR,"
	@echo "                        and finally the strong model posts a code review on the PR"
	@echo "                        (a human merges; if it does not converge, it stops and hands over to a human)"
	@echo
	@echo "  make review ISSUE=n   Runs only the second half of impl (review onwards)"
	@echo "                        Use it to resume after impl stopped and you fixed things by hand"
	@echo
	@echo "  make code-review ISSUE=n  Runs only the plain code review of the PR (posted to the current branch's PR)"
	@echo "                        Not a verdict, so nothing it says closes the PR"
	@echo
	@echo "  make pr-review ISSUE=n  Runs only the arguments against the PR (Devil's Advocate)"
	@echo "                        Currently outside the main flow. Run it on its own when needed"
	@echo
	@echo "  make create-pr ISSUE=n  Retries only the push and PR creation (the last step of review)"
	@echo "                        Use it when review is approved and the commit and PR body exist, but review failed"
	@echo "                        only because of push / PR creation (e.g. a wrong BASE_BRANCH). Review is not redone"
	@echo
	@echo "  make check            Runs only the static checks of the tooling files (scripts / .claude / prompts and .ai-flow/)"
	@echo "                        It runs automatically before each phase above, so you rarely need it on its own"
	@echo
	@echo "Variables: ISSUE (target Issue number)  MAX_ROUNDS (maximum judging rounds, default $(MAX_ROUNDS))"
	@echo "      BASE_BRANCH  PR base branch (default $(BASE_BRANCH); the project's value is in .ai-flow/config.mk)"
	@echo "      STRONG_MODEL / FAST_MODEL  strong / fast model IDs (default from environment variables)"
	@echo "      REVIEW_JUDGE_MODEL  model for judging the plan and the implementation. Accepts strong / fast or a raw model ID"
	@echo "                          Default: the fast model. To use the strong model: make impl ISSUE=n REVIEW_JUDGE_MODEL=strong"
	@echo "      NOTIFY_CMD  notification command (default: Slack if SLACK_WEBHOOK_URL is set, otherwise none; empty turns them off)"
	@echo "The whole history stays in the Issue comments (the AI-TAG identifies each type)"

# Static checks of the tooling files. Always run before a phase (contents described at the top of scripts/check-scripts.sh)
check: check-project
	@./scripts/check-scripts.sh

# Project settings. Without them, check (rendering prompts and merging permissions) would fail in confusing ways, so stop first
check-project:
	@if [ ! -f "$(AI_FLOW_PROJECT_DIR)/config.mk" ]; then \
		echo "Error: $(AI_FLOW_PROJECT_DIR)/config.mk is missing. Add the project settings (copy examples/project/.ai-flow; see docs/setup.md)." >&2; \
		exit 1; \
	fi
	@if [ -n "$(strip $(TEST_CMD))" ] && [ -z "$(strip $(SCRATCH_TEST_CMD))" ]; then \
		echo "Error: TEST_CMD is set but SCRATCH_TEST_CMD is not. Set both (or leave both empty for a project without tests) in $(AI_FLOW_PROJECT_DIR)/config.mk." >&2; \
		exit 1; \
	fi

# Prevents a run from failing halfway because something is not set
check-env:
	@case "$(firstword $(NOTIFY_CMD))" in \
		"") echo "Notifications are off (NOTIFY_CMD is empty). To get them, set SLACK_WEBHOOK_URL or NOTIFY_CMD in .env (see docs/setup.md)." >&2 ;; \
		*notify-slack.sh) if [ -z "$(strip $(SLACK_WEBHOOK_URL))" ]; then \
			echo "Error: NOTIFY_CMD uses notify-slack.sh but SLACK_WEBHOOK_URL is not set. Set it in .env, or set NOTIFY_CMD to something else (empty for no notifications)." >&2; \
			exit 1; \
		fi ;; \
	esac
	@# A path is checked with -x: dash's command -v (/bin/sh on Debian / Ubuntu) returns a path without checking that it is executable
	@c="$(firstword $(NOTIFY_CMD))"; \
	if [ -n "$$c" ]; then \
		case "$$c" in \
			*/*) [ -f "$$c" ] && [ -x "$$c" ] ;; \
			*) command -v "$$c" >/dev/null 2>&1 ;; \
		esac || { \
			echo "Error: NOTIFY_CMD ($$c) is not an executable command. Paths are relative to the flow directory; check the path and that it is executable." >&2; \
			exit 1; \
		}; \
	fi
	@if [ -z "$(strip $(STRONG_MODEL))" ] || [ -z "$(strip $(FAST_MODEL))" ]; then \
		echo "Error: the strong / fast model IDs are not set. Set CLAUDE_CODE_OPUS_MODEL / CLAUDE_CODE_SONNET_MODEL, or write STRONG_MODEL / FAST_MODEL in .env." >&2; \
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

create-pr: check check-env
	@./scripts/run-phase.sh create-pr $(ISSUE) "$(ISSUE_URL)"
