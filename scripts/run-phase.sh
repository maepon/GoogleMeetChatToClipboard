#!/bin/bash
# Runs one phase. Usage: ./scripts/run-phase.sh <spec|impl|review|code-review|pr-review|create-pr> <Issue number> <Issue URL>
#
# The only human gate is after spec.
#   spec        : posts questions OR an instruction document and stops (a human checks the instruction document)
#   impl        : plan -> judge -> revise until APPROVED (at most MAX_ROUNDS rounds) -> implement
#                 -> review -> fix until APPROVED -> commit and create the PR -> code review
#   review      : runs only the second half of impl (review onwards). The entry point after a halt and a human fix
#   code-review : a plain code review of the PR. Runs automatically at the end of impl / review.
#                 Run it on its own to retry when the PR exists but posting failed
#   pr-review   : arguments against the PR (Devil's Advocate). Currently outside the main flow because of its cost.
#                 A human runs it on their own when they want the acceptance criteria themselves questioned
#   create-pr   : retries only the push and PR creation (create_pr). Use it when review is approved and the commit and
#                 PR title/body (pr.md) are done, but the end of review failed only because of create_pr itself
#                 (e.g. a wrong BASE_BRANCH). Review is not redone = no duplicated review comments or commits
#
# State lives in GitHub Issue comments (the AI-TAG identifies the type), so humans read the history in one place.
# The local tmp/ is scratch space; if it is lost, the flow resumes from the Issue.
#
# If it does not converge, stop and hand over to a human. Carrying on automatically turns review into a formality.

# When expanding a variable inside a message, write ${x}. If a non-ASCII character directly follows $x,
# the bash 3.2 that ships with macOS (not multibyte-aware when parsing variable names) takes the first byte of that
# character into the name, and set -u fails with unbound variable.
# It happens inside error messages, so things work normally and only break when something fails.
set -uo pipefail

PHASE="${1:?a phase name is required}"
ISSUE="${2:?an Issue number is required}"
ISSUE_URL="${3:?an Issue URL is required}"

MAX_ROUNDS="${MAX_ROUNDS:-3}"
# The default is in the Makefile. This is the fallback for running the script directly
BASE_BRANCH="${BASE_BRANCH:-main}"
export BASE_BRANCH
STRONG="${STRONG_MODEL:-}"
FAST="${FAST_MODEL:-}"

BASE_PROFILE=".claude/phase-permissions.json"
COMMIT_PROFILE=".claude/commit-permissions.json"
PR_REVIEW_PROFILE=".claude/pr-review-permissions.json"

VERDICT_FILE="./tmp/verdict-issue$ISSUE.txt"
COST_LOG="./tmp/cost-issue$ISSUE.txt"
PR_TITLE_FILE="./tmp/pr-title-issue$ISSUE.txt"
PR_BODY_FILE="./tmp/pr-body-issue$ISSUE.md"
export VERDICT_FILE COST_LOG PR_TITLE_FILE PR_BODY_FILE

# The comment files must be the same paths as the {{COMMENT_FILE}} that claude-run.sh builds from the prompt name
# (./tmp/issue<N>-<prompt name>.md). Posting is done here.
CODE_REVIEW_FILE="./tmp/issue$ISSUE-code-review.md"
PR_REVIEW_FILE="./tmp/issue$ISSUE-pr-review.md"

# The PR create_pr made. When code-review / pr-review run on their own, it is looked up from the current branch
PR_URL=""

# Where the flow directory is (FLOW_PREFIX and friends). Name and depth are free, so it is found at run time, never hard-coded
. ./scripts/flow-paths.sh

# Tooling files. They must not be mixed into the project's commits (humans bring tooling in through their own PRs; keep the list in sync with prompts/pr.md)
# Paths from git status --porcelain / git diff --name-only are relative to the repository root even when run from the flow directory.
# So they are written with FLOW_PREFIX. Without it, modifications to the flow's scripts/ and so on would pass, and conversely the
# root docs/ (project documents such as a privacy policy) would be treated as tooling and stop the flow (found by measurement).
# The whole flow directory counts as tooling (it is the content of another repository brought in with subtree, so README.md,
# examples/ and the rest must not be modified by project changes either). The scratch tmp/ and each person's .env are ignored by the
# flow's .gitignore, so they never show up here.
# The root .gitignore has no flow rules, but stays protected: a rule ignoring the flow directory would hide new files placed there from this check.
# The root .ai-flow/ holds the project settings (commands, extra permissions, text embedded in prompts). Unlike the flow's .claude/,
# Claude Code itself does not block writes there, so it is caught here. Rewriting the extra permissions would widen the next step's permissions.
TOOLING_PATHS="^(${FLOW_PREFIX_RE}|\\.ai-flow/|\\.gitignore)"

mkdir -p tmp
# Costs are accumulated per Issue. Truncating on each start would erase the first half when one cycle is split into
# make impl -> make review, and the notified total would be lower than reality (this happened in the Go repository the flow was first written for).
# Append instead, with one header line so you can read where runs switched.
printf '# %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$PHASE" >> "$COST_LOG"

# Sends a notification through NOTIFY_CMD (decided in the Makefile; empty = no notifications). Usage: notify <kind> <title> <body>
#   kind  : done (a phase finished) / waiting (halt: a human has to act) / aborted (fail) / progress (finished a stage, carrying on)
#   title : one line of plain text. Emoji and markup are the command's business, since every service writes them differently
#   body  : GitHub markdown as the agents wrote it, passed on stdin. Converting it is the command's business too
# The rest goes in AI_FLOW_NOTIFY_* environment variables rather than arguments, so fields can be added without breaking
# anyone's command. The flow only looks at the exit code, and a failure never stops it (a lost notification must not lose the work).
# The body goes through a here-string, not a pipe: with pipefail, a command that does not read stdin would make the
# writer die of SIGPIPE and a successful notification would be reported as failed.
# The command's stdout goes to stderr, because run-phase.sh's stdout carries the agents' replies.
notify() {
  local kind="$1" title="$2" body="$3"
  local -a cmd
  [ -n "${NOTIFY_CMD:-}" ] || return 0
  read -r -a cmd <<< "${NOTIFY_CMD}"
  AI_FLOW_NOTIFY_KIND="$kind" AI_FLOW_NOTIFY_TITLE="$title" AI_FLOW_NOTIFY_PHASE="$PHASE" AI_FLOW_NOTIFY_ISSUE_URL="$ISSUE_URL" \
    "${cmd[@]}" <<< "$body" >&2 \
    || echo "Warning: [$PHASE] sending the notification failed (NOTIFY_CMD: ${NOTIFY_CMD})." >&2
}

# The total spent on this Issue, skipping header lines (starting with #)
total_cost() { awk '/^[0-9]/ {s+=$1} END {printf "%.2f", s+0}' "$COST_LOG"; }

fail() {
  echo "Error: [$PHASE] $1" >&2
  notify aborted "$PHASE aborted" "$1

Cumulative cost: \$$(total_cost)"
  exit 1
}

# Stops to wait for a human. Not a failure, so the exit code is 0. Usage: halt <log line> <notification title> <notification body>
halt() {
  echo "[$PHASE] $1" >&2
  notify waiting "$2" "$3

Cumulative cost: \$$(total_cost)"
  exit 0
}

# Prints the paths in the working tree, one per line, unquoted.
# Plain --porcelain quotes paths containing non-ASCII characters or spaces as "docs/\350...",
# so the leading " would not match the ^ in TOOLING_PATHS and modified tooling files would pass
# (spaces are quoted even with core.quotePath=false). -z does not quote.
# A rename comes as two entries, "destination\0source\0"; print both (moving out of the tooling is a tooling change too).
worktree_paths() {
  local entry
  git status --porcelain -z --untracked-files=all | while IFS= read -r -d '' entry; do
    printf '%s\n' "${entry:3}"
    case "${entry:0:2}" in
      *R*|*C*) IFS= read -r -d '' entry && printf '%s\n' "$entry" ;;
    esac
  done
}

# Permission rules with a path do not work for Write / Edit (see the top of scripts/claude-run.sh).
# Instead, check the working tree for modified tooling files.
# Claude Code itself blocks writes to .claude/, but prompts/ and scripts/ are not covered.
# Gitignored files (.env, tmp/) do not show up here.
tooling_state() {
  worktree_paths | grep -E "$TOOLING_PATHS" | sort || true
}
[ -z "${flow_paths_error}" ] || fail "${flow_paths_error}"
TOOLING_BEFORE=$(tooling_state)

# The language-dependent part of the formatting check. Commands and targets come from the project settings (.ai-flow/config.mk).
#   format_target : true if the file is subject to the check, i.e. matches one of FORMAT_GLOBS (space-separated case patterns)
#   format_ok     : true if the file is formatted, judged by the exit code of FORMAT_FILE_CMD. For tools such as gofmt -l that mean
#                   "formatted" by printing nothing, the project provides a wrapper that answers with the exit code.
#                   If the check itself fails (not installed, syntax error) it returns false and the flow stops.
#                   Returning true would let everything through silently where no formatter is installed
#   FORMAT_FIX    : the command shown in the abort message, for the agent to apply
# Projects with an empty FORMAT_FILE_CMD get no formatting check (unformatted_files returns nothing).
# Values are split into words unquoted. read -a does no pathname expansion, so *.js never turns into files in the current directory.
format_target() {
  local g globs
  [ -n "${FORMAT_GLOBS:-}" ] || return 1
  read -r -a globs <<< "${FORMAT_GLOBS}"
  for g in "${globs[@]}"; do
    case "$1" in $g) return 0 ;; esac
  done
  return 1
}
format_ok() {
  local cmd
  read -r -a cmd <<< "${FORMAT_FILE_CMD}"
  "${cmd[@]}" "$1" >/dev/null 2>&1
}
FORMAT_FIX="${FORMAT_FIX_CMD:-}"

# Checks whether changed or added files are formatted. It does not format them here:
# if the shell rewrote them, the diff the reviewer read and the actual diff would differ.
# Only files in the working tree are checked, so committed files are never dragged in.
# worktree_paths gives paths relative to the repository root, so prefix the root before looking.
# Without the prefix they would not exist from the flow directory, and every project file passed (found by measurement).
unformatted_files() {
  local f root out=""
  [ -n "${FORMAT_FILE_CMD:-}" ] || return 0
  root=$(git rev-parse --show-toplevel) || { printf '(git rev-parse --show-toplevel failed)\n'; return; }
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    format_target "$f" || continue
    [ -f "${root}/${f}" ] || continue   # skip deletions and rename sources
    format_ok "${root}/${f}" || out="$out$f
"
  done <<EOF
$(worktree_paths)
EOF
  printf '%s' "$out"
}

# The reply goes into RESULT. Calling fail inside $(...) would only end the subshell
# and the caller would carry on, so assignment and checking are kept apart
RESULT=""
run_step() {
  local label="$1" prompt="$2" model="$3" profile="${4:-$BASE_PROFILE}"
  echo "--- [$PHASE] $label" >&2
  RESULT=$(./scripts/claude-run.sh "$prompt" "$model" "$ISSUE" "$profile")
  local st=$?
  [ $st -eq 0 ] || fail "$label failed (exit code ${st})."
  if [ "$(tooling_state)" != "$TOOLING_BEFORE" ]; then
    fail "$label modified tooling files. They are the flow's foundation, so agents must not touch them. Restore them with git and re-run:
$(tooling_state)"
  fi
  local unformatted
  unformatted=$(unformatted_files)
  if [ -n "$unformatted" ]; then
    fail "$label left files that fail the formatting check (unformatted, or the check itself failed). Apply ${FORMAT_FIX} and resume with make review:
$unformatted"
  fi
  printf '%s\n' "$RESULT"
}

read_verdict() {
  [ -f "$VERDICT_FILE" ] || return 0
  tr -d '[:space:]' < "$VERDICT_FILE" | tr '[:lower:]' '[:upper:]'
}

# The branch shared by the plan and implementation judging loops. APPROVED returns 0 (leave the loop), CHANGES_REQUESTED returns 1 (next round).
# NEEDS_HUMAN halts without waiting for more rounds. It is for what the judge concluded the reviser / fixer cannot resolve however
# they try (contradictory ACs, a wrong premise in the instruction document, ...); more rounds would only spin
# (two contradictory ACs once used up all MAX_ROUNDS rounds for nothing).
# Usage: handle_verdict <verdict> <stage name> <resume command>
handle_verdict() {
  local verdict="$1" stage="$2" resume="$3"
  case "$verdict" in
    APPROVED) return 0 ;;
    CHANGES_REQUESTED) return 1 ;;
    NEEDS_HUMAN)
      halt "The ${stage} verdict asks for a human decision (NEEDS_HUMAN)." "${PHASE} - the ${stage} needs a human decision" \
"The judge reported unmet criteria that cannot be resolved within the instruction document, such as contradictory acceptance criteria or a wrong premise. Read the latest verdict comment on the Issue, fix the instruction document and post a new INSTRUCTION, then resume with ${resume}.

$RESULT" ;;
    *)
      fail "Unexpected verdict file contents: '${verdict}' (expected APPROVED / CHANGES_REQUESTED / NEEDS_HUMAN)." ;;
  esac
}

# Enforces the human gate: never go on without an instruction document.
# Look for the tag itself at the start of a line. With a partial match, a human comment saying "there is no instruction
# (AI-TAG: INSTRUCTION)" or a comment discussing this flow would pass the gate (this very message has that shape).
# This is where the flow's only human gate is enforced mechanically, so a loose match is not acceptable.
#
# Do not pipe gh issue view straight into grep -q (learned the hard way).
# As comments grow and the output gets large, grep -q stops reading as soon as it matches near the top and exits,
# so gh, still writing, gets SIGPIPE and exits with 141.
# Under set -o pipefail the whole pipeline then counts as failed even though grep matched,
# and it stops with "no instruction document" although one exists. Writing to a temporary file first and grepping that
# removes the pipe on the writing side, so the race cannot happen.
#
# A gh failure is reported separately from "no instruction document". stderr used to be discarded, so an expired login or a
# transient API error also said "no instruction document" and the cause was unclear (found by measurement).
require_instruction() {
  local tmp err matched=1
  tmp=$(mktemp) || fail "could not create a temporary file."
  err=$(mktemp) || { rm -f "$tmp"; fail "could not create a temporary file."; }
  if ! gh issue view "$ISSUE" --comments >"$tmp" 2>"$err"; then
    local msg
    msg=$(tail -n 5 "$err")
    rm -f "$tmp" "$err"
    fail "Could not fetch Issue #${ISSUE} with gh (whether an instruction document exists is unknown). Check gh auth status and re-run:
${msg}"
  fi
  grep -q '^<!-- AI-TAG: INSTRUCTION -->' "$tmp" || matched=0
  rm -f "$tmp" "$err"
  [ "$matched" -eq 1 ] \
    || fail "Issue #$ISSUE has no instruction document. Run make spec first and have a human check the instruction document."
}

# push and PR creation are not given to the agent; they happen here,
# so the branch name and what is committed can be checked mechanically right before the outward-facing operation.
# Blocking dangerous push forms by enumerating permission rules leaks, so push is simply not granted.
create_pr() {
  local branch title body_lines mixed commits
  branch=$(git branch --show-current)

  case "$branch" in
    feature/*) ;;
    "") fail "HEAD is detached. Cannot create a PR." ;;
    *)  fail "The branch name does not start with feature/ (${branch}). Project changes go on feature/ branches." ;;
  esac

  # Without the base, the mixing check below would let git diff's error be swallowed by || true. Check it first
  git rev-parse --verify --quiet "origin/${BASE_BRANCH}" >/dev/null \
    || fail "origin/${BASE_BRANCH} not found. Check that BASE_BRANCH in .ai-flow/config.mk matches the default branch."

  commits=$(git rev-list --count "origin/${BASE_BRANCH}..${branch}")
  [ "$commits" -gt 0 ] || fail "No difference from origin/${BASE_BRANCH}. The agent may not have committed."

  # Are tooling files mixed into the project's commits?
  # -z avoids quoting (same reason as worktree_paths). --no-renames because a rename only shows
  # the destination, which would miss moving a file out of the tooling.
  mixed=$(git diff --name-only -z --no-renames "origin/${BASE_BRANCH}..${branch}" | tr '\0' '\n' | grep -E "$TOOLING_PATHS" || true)
  if [ -n "$mixed" ]; then
    fail "Tooling files are mixed into the project's commits. Put them in a separate commit:
$mixed"
  fi

  title=$(head -n 1 "$PR_TITLE_FILE")
  [ -n "$title" ] || fail "$PR_TITLE_FILE is empty."
  body_lines=$(wc -l < "$PR_BODY_FILE" | tr -d ' ')
  [ "$body_lines" -gt 0 ] || fail "$PR_BODY_FILE is empty."

  echo "--- [$PHASE] push and PR creation (run by make)" >&2
  git push -u origin "$branch" >&2 || fail "push failed."

  PR_URL=$(gh pr create --base "$BASE_BRANCH" --head "$branch" \
    --title "$title" --body-file "$PR_BODY_FILE") \
    || fail "gh pr create failed. The branch is already pushed, so you can create the PR by hand."

  echo "$PR_URL" >&2
  notify done "review done - PR created" "Review approved in round ${round}.
$PR_URL

A human should check it before merging.

$RESULT

Cumulative cost: \$$(total_cost)"
}

[ -n "$STRONG" ] || fail "STRONG_MODEL is empty. Check CLAUDE_CODE_OPUS_MODEL or write STRONG_MODEL in .env (if it is defined in .zshrc, non-interactive runs do not read it)."
[ -n "$FAST" ]   || fail "FAST_MODEL is empty. Check CLAUDE_CODE_SONNET_MODEL or write FAST_MODEL in .env."

# Only the judges' model (plan-judge / review-judge) can be swapped. The default here is the strong model.
# review-judge works against an implementation, so it can verify with test runs, the formatting check, and the diff (the send-backs
# seen in the original repository were cross-checks such as "one of the four documents the instruction listed was not updated").
# To A/B whether the fast model is enough, REVIEW_JUDGE_MODEL=fast switches it (the Makefile default is the fast model; the default
# here is for running the script directly).
#
# In the original repository plan-judge was fixed to the strong model: it compares documents (instruction vs plan) and cannot verify
# by running anything, and both of its send-backs there were inferences the prompt did not ask for ("the proposed tests would pass even
# with the implementation broken") - the first thing lost with a weaker model. Later plan-judge was aligned with REVIEW_JUDGE too, and
# the Makefile default makes it the fast model.
#
# claude-run.sh prints the model ID used for each step to stderr, so the logs show which one ran.
case "${REVIEW_JUDGE_MODEL:-}" in
  ""|strong) REVIEW_JUDGE="$STRONG" ;;
  fast)      REVIEW_JUDGE="$FAST" ;;
  *)         REVIEW_JUDGE="$REVIEW_JUDGE_MODEL" ;;
esac

phase_spec() {
  PHASE=spec
  : > "$VERDICT_FILE"
  run_step "Writing the instruction document" prompts/spec.md "$STRONG"
  case "$(read_verdict)" in
    INSTRUCTION_READY)
      halt "The instruction document is ready. Waiting for a human to check it." "spec done - the instruction document is ready" \
"Check it, and if it looks right, go on with \`make impl ISSUE=$ISSUE\`. To change something, comment on the Issue and re-run \`make spec ISSUE=$ISSUE\`.

$RESULT"
      ;;
    NEED_ANSWERS)
      halt "Questions posted. Waiting for answers." "spec - waiting for answers" \
"Questions were posted. Answer them in an Issue comment, then re-run \`make spec ISSUE=$ISSUE\`.

$RESULT"
      ;;
    *)
      fail "Unexpected verdict file contents: '$(read_verdict)' (expected INSTRUCTION_READY or NEED_ANSWERS). Check the Issue comments."
      ;;
  esac
}

phase_impl() {
  PHASE=impl
  require_instruction
  run_step "Writing the implementation plan" prompts/plan.md "$FAST"

  round=1
  while : ; do
    : > "$VERDICT_FILE"
    run_step "Judging against the instruction document, round ${round}/${MAX_ROUNDS}" prompts/plan-judge.md "$REVIEW_JUDGE"
    verdict=$(read_verdict)
    handle_verdict "$verdict" "plan" "make impl ISSUE=${ISSUE}" && break
    if [ "$round" -ge "$MAX_ROUNDS" ]; then
      halt "The plan was not approved after ${MAX_ROUNDS} rounds." "impl - the plan did not converge" \
"After ${MAX_ROUNDS} rounds the discrepancies with the instruction document remain. Read the exchange on the Issue and revisit the acceptance criteria in the instruction document. This happens when they are vague.

$RESULT"
    fi
    run_step "Revising the plan" prompts/plan-revise.md "$FAST"
    round=$((round + 1))
  done

  run_step "Implementing" prompts/implement.md "$FAST"
  notify progress "Implementation done" "Plan approved in round ${round}. Going on to review.

$RESULT

Cost so far: \$$(total_cost)"
}

phase_review() {
  PHASE=review
  require_instruction

  round=1
  while : ; do
    : > "$VERDICT_FILE"
    run_step "Reviewing the implementation, round ${round}/${MAX_ROUNDS}" prompts/review-judge.md "$REVIEW_JUDGE"
    verdict=$(read_verdict)
    handle_verdict "$verdict" "implementation" "make review ISSUE=${ISSUE}" && break
    if [ "$round" -ge "$MAX_ROUNDS" ]; then
      halt "The implementation was not approved after ${MAX_ROUNDS} rounds." "review - the review did not converge" \
"After ${MAX_ROUNDS} rounds some acceptance criteria are still unmet. Check the diff in the working tree and the exchange on the Issue.

$RESULT"
    fi
    run_step "Fixing the findings" prompts/review-fix.md "$FAST"
    round=$((round + 1))
  done

  : > "$PR_TITLE_FILE"
  : > "$PR_BODY_FILE"
  run_step "Committing and writing the PR body" prompts/pr.md "$STRONG" "$COMMIT_PROFILE"
  create_pr
}

# Of the end of review (commit and PR body -> push and PR creation), redo only the push and PR creation.
# For failures caused by create_pr itself, such as a wrong BASE_BRANCH (origin/<branch> missing, a transient push / API failure).
# Redoing it from review-judge or the commit would duplicate the review comments on the Issue, or make pr.md try to commit again
# and fail with "nothing to commit".
# It assumes pr.md (commit and PR body) is already done, so it is not called here.
#
# create_pr()'s notification refers to $round / $RESULT from the review loop, which do not exist here
# because no review ran. Placeholders stand in for them.
phase_create_pr() {
  PHASE=create-pr
  [ -s "$PR_TITLE_FILE" ] && [ -s "$PR_BODY_FILE" ] \
    || fail "$PR_TITLE_FILE or $PR_BODY_FILE is empty. Run make review first, through the commit and the PR body."
  round="-"
  RESULT="(run on its own with make create-pr; see the Issue comments for the implementation and review history)"
  create_pr
}

# A plain code review after the PR exists. It is not a verdict, so nothing here closes the PR
# (a human decides on merging). review-judge only checks whether the ACs are met, so this covers
# bugs, security, and missing error handling that the ACs do not mention.
#
# It reuses the pr-review profile. This phase does not need git restore, but it does need
# gh issue comment to be absent, unlike the base profile (the destination is the PR; it must not write to the Issue).
#
# If PR_URL is empty (code-review / pr-review run on their own), look up the current branch's PR.
# Calling fail inside $(...) would only end the subshell, so the value goes straight into PR_URL.
# gh's error is attached rather than discarded. It used to be discarded, so with the working tree still on the default branch
# only "PR not found" appeared and you could not tell which branch had been searched.
ensure_pr_url() {
  [ -n "$PR_URL" ] && return 0
  local out err branch
  branch=$(git branch --show-current)
  # Capture stderr separately. Merged, gh's update notices and the like would get mixed into the URL on success
  err=$(mktemp) || fail "could not create a temporary file."
  if ! out=$(gh pr view --json url -q .url 2>"$err") || [ -z "$out" ]; then
    out=$(tail -n 5 "$err")
    rm -f "$err"
    fail "PR not found (current branch: ${branch:-detached}). Switch to the PR's branch and re-run:
${out}"
  fi
  rm -f "$err"
  PR_URL="$out"
}

# gh pr is not given to the agent, so it writes the body to a file and the posting happens here.
phase_code_review() {
  PHASE=code-review
  local url before after

  ensure_pr_url
  url="$PR_URL"

  # This phase is not supposed to fix code, but Write / Edit are granted without path restrictions.
  # run_step's checks only look at tooling files and unformatted files, so a formatted rewrite would pass.
  # The PR is already pushed, so a fix would not reach the PR and would only remain in the working tree. Catch it by comparing before and after.
  before=$(git status --porcelain --untracked-files=all)

  : > "${CODE_REVIEW_FILE}"
  run_step "Code review" prompts/code-review.md "$STRONG" "$PR_REVIEW_PROFILE"

  after=$(git status --porcelain --untracked-files=all)
  if [ "$after" != "$before" ]; then
    fail "The code review finished with the working tree changed. This phase does not fix code. Restore with git restore and re-run make code-review ISSUE=$ISSUE:
$after"
  fi

  [ -s "${CODE_REVIEW_FILE}" ] \
    || fail "${CODE_REVIEW_FILE} is empty. The PR already exists, so you can re-run make code-review ISSUE=$ISSUE."

  gh pr comment "$url" --body-file "${CODE_REVIEW_FILE}" >&2 \
    || fail "Posting the comment to the PR failed. The body remains in ${CODE_REVIEW_FILE}."

  notify done "Code review posted on the PR" "${url}

This is not a verdict. A human decides whether to merge.

$RESULT

Cumulative cost: \$$(total_cost)"
}

# Arguments against the PR after it exists (Devil's Advocate). Currently outside the main flow.
# It asks whether the acceptance criteria themselves were wrong. Run it on its own with make pr-review.
#
# gh pr is not given to the agent, so it writes the body to a file and the posting happens here.
phase_pr_review() {
  PHASE=pr-review
  local url before after

  ensure_pr_url
  url="$PR_URL"

  # Check by comparing before and after that the implementation broken for Claim 2 (break the tests and see them fail) was restored.
  # The formatting check would not catch it (a broken line that is formatted passes), so this is the only place to look.
  before=$(git status --porcelain --untracked-files=all)

  : > "$PR_REVIEW_FILE"
  run_step "Arguing against the PR" prompts/pr-review.md "$STRONG" "$PR_REVIEW_PROFILE"

  after=$(git status --porcelain --untracked-files=all)
  if [ "$after" != "$before" ]; then
    fail "The Devil's Advocate review finished with the working tree changed. Restore the broken implementation with git restore and re-run make pr-review ISSUE=$ISSUE:
$after"
  fi

  [ -s "$PR_REVIEW_FILE" ] \
    || fail "$PR_REVIEW_FILE is empty. The PR already exists, so you can re-run make pr-review ISSUE=$ISSUE."

  gh pr comment "$url" --body-file "$PR_REVIEW_FILE" >&2 \
    || fail "Posting the comment to the PR failed. The body remains in $PR_REVIEW_FILE."

  notify done "Devil's Advocate review posted on the PR" "$url

This is not a verdict. A human decides whether to merge.

$RESULT

Cumulative cost: \$$(total_cost)"
}

# impl goes all the way through review. There is no reason to hand back to a human once implemented, and the fast model
# can fix review findings. If it does not converge it halts and hands over, so where it stops does not change.
# review on its own is kept as the entry point for resuming after a halt and a human fix.
# code-review on its own is for retrying when only the posting failed.
# pr-review (Devil's Advocate) is outside the main flow; running it on its own remains.
case "$PHASE" in
  spec)        phase_spec ;;
  impl)        phase_impl; phase_review; phase_code_review ;;
  review)      phase_review; phase_code_review ;;
  code-review) phase_code_review ;;
  pr-review)   phase_pr_review ;;
  create-pr)   phase_create_pr ;;
  *)           fail "Unknown phase: ${PHASE} (one of spec / impl / review / code-review / pr-review / create-pr)" ;;
esac
