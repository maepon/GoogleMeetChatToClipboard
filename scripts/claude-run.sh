#!/bin/bash
# Runs Claude Code headlessly, once. The flow's script lives in run-phase.sh.
#
# Usage: ./scripts/claude-run.sh <prompt file> <model ID> <Issue number> <permission profile>
#
# Only the agent's reply goes to standard output (so the caller can capture it in a variable).
# Progress, cost, and denial warnings go to standard error.
#
# There is a reason the permission files are not named settings.json (measured).
#   - For .claude/settings.json, permissions.allow is ignored entirely when the workspace is not trusted,
#     even when passed explicitly with --settings
#     (only a warning on stderr, and the exit code stays 0 = silently running with no permissions)
#   - With any other file name passed to --settings, both allow and deny work
#   - A deny placed in settings.json also binds the human's interactive sessions,
#     so you could no longer commit / push yourself (deny blocks without asking)
#
# Permissions for the file tools are not straightforward either (measured).
#   - Write / Edit rules with a path never match, in allow or deny.
#     Write(./**) Write(**) Write(tmp/**) and the absolute form (Write(//Users/...))
#     were all denied. Only bare Write / Edit work
#   - Paths work for Read. deny Read(./.env) beats a bare allow Read too (measured)
#   - Claude Code itself blocks writes under .claude/, so an agent cannot
#     rewrite its own permission profile.
#     prompts/ and scripts/ are not covered, though, so run-phase.sh checks the working tree
#   - Blocks by deny do not appear in permission_denials; they come back as tool errors
#
# A deny is "accident prevention", not "isolation". As long as running the tests (TEST_CMD) is allowed,
# the agent can execute arbitrary code, and could reach denied operations if it wanted to.
# The effective safeguards are these three; the permission lists are closer to a notice on the outside.
#   1. Claude Code itself blocks writes to .claude/ (an agent cannot widen its own permissions)
#   2. run-phase.sh checks the working tree after each step and aborts if tooling files were modified
#   3. push and gh pr create are never given; run-phase.sh runs them after checking
# Therefore, do not leave secrets in the environment variables passed along (see env -u below).
#
# Even when a tool call is denied, claude exits with 0,
# so permission_denials in the JSON output is read and printed to standard error.

set -uo pipefail

PROMPT_FILE="${1:?a prompt file is required}"
MODEL="${2:?a model ID is required}"
ISSUE="${3:?an Issue number is required}"
SETTINGS="${4:?a permission profile is required}"

RULES="prompts/_rules.md"
VERDICT_FILE="${VERDICT_FILE:-./tmp/verdict-issue$ISSUE.txt}"
COST_LOG="${COST_LOG:-}"
COMMENT_FILE="./tmp/issue$ISSUE-$(basename "$PROMPT_FILE" .md).md"
PR_TITLE_FILE="${PR_TITLE_FILE:-./tmp/pr-title-issue$ISSUE.txt}"
PR_BODY_FILE="${PR_BODY_FILE:-./tmp/pr-body-issue$ISSUE.md}"
BASE_BRANCH="${BASE_BRANCH:-main}"

for f in "$PROMPT_FILE" "$RULES" "$SETTINGS"; do
  [ -f "$f" ] || { echo "Error: $f not found." >&2; exit 1; }
done

mkdir -p tmp

# Where the flow directory is. Filled into {{FLOW_DIR}} / {{ROOT_REL}} in the prompts
. ./scripts/flow-paths.sh
[ -z "${flow_paths_error}" ] || { echo "Error: ${flow_paths_error}" >&2; exit 1; }

# Append the common rules to each prompt and fill the placeholders (values and project settings files; see render-prompt.sh).
# If anything cannot be filled, it stops before claude starts
PROMPT=$(ISSUE="$ISSUE" VERDICT_FILE="$VERDICT_FILE" COMMENT_FILE="$COMMENT_FILE" \
  PR_TITLE_FILE="$PR_TITLE_FILE" PR_BODY_FILE="$PR_BODY_FILE" BASE_BRANCH="$BASE_BRANCH" \
  ./scripts/render-prompt.sh "$PROMPT_FILE" "$RULES") || exit 1

# The permissions passed are the base profile plus the project's additions (.ai-flow/permissions.json),
# written to a temporary file on every start. Why it is not kept: see the top of merge-permissions.sh
MERGED_SETTINGS=$(mktemp) || { echo "Error: could not create a temporary file." >&2; exit 1; }
trap 'rm -f "$MERGED_SETTINGS"' EXIT
./scripts/merge-permissions.sh "$SETTINGS" > "$MERGED_SETTINGS" || exit 1

# The notification command's secrets (NOTIFY_SECRET_VARS; SLACK_WEBHOOK_URL always) are removed from the agent's environment.
# The Makefile exports them for NOTIFY_CMD, and a secret kept in the shell profile is inherited anyway, so otherwise
# they would be readable with echo (making the Read(./.env) deny pointless).
# The parent (run-phase.sh) sends the notifications, so the agent does not need them.
# Launch options (each one was actually hit in a trial repository)
#   --add-dir=<root>     The agent runs with the flow directory as the current directory, so by default Claude Code
#                        treats that as the working directory and denies Bash commands whose arguments point outside it
#                        (git diff -- ../../README.md, git grep -- ../x.html, ...). Adding the repository root as a working
#                        directory lets them through. Read / Write / Edit already reached files outside, so this does not
#                        widen what the agent can do. Pass it with "=": --add-dir takes several values and, separated by a
#                        space, would swallow the prompt that follows
#   --strict-mcp-config  Do not load the MCP connectors linked to the user's claude.ai account. The flow does not use them,
#                        their tool descriptions were added to every step's prompt, and replies mentioned authorizing them
#   < /dev/null          Do not wait for standard input (otherwise "no stdin data received in 3s" is printed after a 3 s wait)
REPO_ROOT=$(git rev-parse --show-toplevel) || { echo "Error: cannot find the repository root." >&2; exit 1; }
UNSET_ARGS=()
for v in SLACK_WEBHOOK_URL ${NOTIFY_SECRET_VARS:-}; do
  UNSET_ARGS+=(-u "$v")
done
OUT=$(env "${UNSET_ARGS[@]}" ANTHROPIC_MODEL="$MODEL" claude -p \
  --settings "$MERGED_SETTINGS" \
  --add-dir="$REPO_ROOT" \
  --strict-mcp-config \
  --output-format json \
  "$PROMPT" < /dev/null)
STATUS=$?

if [ $STATUS -ne 0 ]; then
  printf '%s\n' "$OUT" >&2
  echo "Error: claude exited with code $STATUS." >&2
  exit 1
fi

if ! printf '%s' "$OUT" | jq -e . >/dev/null 2>&1; then
  printf '%s\n' "$OUT" >&2
  echo "Error: could not parse claude's output as JSON." >&2
  exit 1
fi

COST=$(printf '%s' "$OUT" | jq -r '.total_cost_usd')
TURNS=$(printf '%s' "$OUT" | jq -r '.num_turns')
[ -n "$COST_LOG" ] && printf '%s\n' "$COST" >> "$COST_LOG"
printf -- '    (%s / cost: $%.2f / turns: %s)\n' "$MODEL" "$COST" "$TURNS" >&2

# A denial is not necessarily a failure: the agent may work around it and finish.
# So do not stop; print it so a human notices
DENIALS=$(printf '%s' "$OUT" | jq -r '.permission_denials | length')
if [ "$DENIALS" != "0" ]; then
  echo "Warning: ${DENIALS} disallowed tool call(s) were denied." >&2
  printf '%s' "$OUT" \
    | jq -r '.permission_denials[] | "  denied: \(.tool_name) - \(.tool_input.command // .tool_input.file_path // "")"' >&2
  echo "  If they recur, add them to permissions.allow in $SETTINGS (for project-specific commands, to allow in .ai-flow/permissions.json)." >&2
fi

if [ "$(printf '%s' "$OUT" | jq -r '.is_error')" != "false" ]; then
  echo "Error: claude reported an error." >&2
  exit 1
fi

printf '%s\n' "$(printf '%s' "$OUT" | jq -r '.result')"
