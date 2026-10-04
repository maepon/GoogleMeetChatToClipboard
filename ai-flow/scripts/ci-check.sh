#!/bin/bash
# Runs make check for this repository on its own. Used both locally and in CI (.github/workflows/check.yml).
# Usage: ./scripts/ci-check.sh (run at the repository root)
#
# The flow expects to live in a subdirectory of a host repository, with project settings (.ai-flow/) at the root
# (scripts/flow-paths.sh). In this repository the flow is at the root, so make check would stop with
# "The flow is at the repository root". So this creates a throwaway git repository, lays the files out like a host
# (the flow under ai-flow/, examples/project/.ai-flow/ at the root), and runs make check there.
# This also verifies that the template config.mk passes make check, and how check-env decides on notifications.
#
# It copies the files git tracks plus new files that are not ignored (including uncommitted changes).
# .env and tmp/ are not brought along.
set -uo pipefail

SRC=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d) || { echo "NG: could not create a temporary directory." >&2; exit 1; }
trap 'rm -rf "${WORK}"' EXIT

HOST="${WORK}/host"
FLOW="${HOST}/ai-flow"
mkdir -p "${FLOW}"
git -C "${HOST}" init -q
# The Makefile builds the Issue URL from origin, so add an origin like a host would have (never contacted)
git -C "${HOST}" remote add origin https://github.com/example/host.git

git -C "${SRC}" ls-files -z --cached --others --exclude-standard | while IFS= read -r -d '' f; do
  [ -f "${SRC}/${f}" ] || continue   # skip files deleted in the working tree
  mkdir -p "${FLOW}/$(dirname "${f}")"
  cp -p "${SRC}/${f}" "${FLOW}/${f}"
done

[ -d "${SRC}/examples/project/.ai-flow" ] \
  || { echo "NG: examples/project/.ai-flow is missing." >&2; exit 1; }
cp -R "${SRC}/examples/project/.ai-flow" "${HOST}/.ai-flow"

git -C "${HOST}" add -A
git -C "${HOST}" -c user.name=ci -c user.email=ci@example.com -c commit.gpgsign=false commit -q -m "ci-check"

make -C "${FLOW}" check || exit 1

# Projects without a formatter (all FORMAT_* empty) and / or without tests (TEST_CMD and SCRATCH_TEST_CMD empty)
# must also render their prompts and pass make check
echo "--- running again with all FORMAT_* empty"
make -C "${FLOW}" check FORMAT_CHECK_CMD= FORMAT_FILE_CMD= FORMAT_FIX_CMD= FORMAT_GLOBS= || exit 1
echo "--- running again with TEST_CMD / SCRATCH_TEST_CMD empty"
make -C "${FLOW}" check TEST_CMD= SCRATCH_TEST_CMD= || exit 1
echo "--- running again with no tests and no formatter"
make -C "${FLOW}" check TEST_CMD= SCRATCH_TEST_CMD= FORMAT_CHECK_CMD= FORMAT_FILE_CMD= FORMAT_FIX_CMD= FORMAT_GLOBS= || exit 1

# check-env decides how notifications are sent (Makefile). The shell running this may hold real settings, so they are
# removed first. The model IDs are dummies; check-env only looks at whether they are set.
# Usage: env_case <name> <expected exit code of make (2 when check-env fails)> <text expected in the output, or empty> <text that must not appear, or empty> [VAR=value...]
env_case() {
  local name="$1" code="$2" needle="$3" absent="$4" out got
  shift 4
  out=$(env -u SLACK_WEBHOOK_URL -u NOTIFY_CMD -u NOTIFY_SECRET_VARS \
    make -s -C "${FLOW}" check-env STRONG_MODEL=s FAST_MODEL=f "$@" 2>&1); got=$?
  if [ "${got}" -ne "${code}" ] \
    || { [ -n "${needle}" ] && ! printf '%s' "${out}" | grep -qF -- "${needle}"; } \
    || { [ -n "${absent}" ] && printf '%s' "${out}" | grep -qF -- "${absent}"; }; then
    echo "NG: check-env (${name}): exit code ${got} (expected ${code}). Output: ${out}" >&2
    return 1
  fi
}
echo "--- check-env with each notification setting"
OFF="Notifications are off"
env_case "nothing set: notifications off, not an error" 0 "${OFF}" "" || exit 1
env_case "only SLACK_WEBHOOK_URL: Slack, as before" 0 "" "${OFF}" SLACK_WEBHOOK_URL=http://example.test || exit 1
env_case "NOTIFY_CMD empty wins over SLACK_WEBHOOK_URL" 0 "${OFF}" "" SLACK_WEBHOOK_URL=http://example.test NOTIFY_CMD= || exit 1
env_case "notify-slack.sh chosen without SLACK_WEBHOOK_URL" 2 "SLACK_WEBHOOK_URL is not set" "" NOTIFY_CMD=./scripts/notify-slack.sh || exit 1
env_case "a command on PATH with arguments" 0 "" "${OFF}" "NOTIFY_CMD=true --flag" || exit 1
env_case "a command that does not exist" 2 "is not an executable command" "" NOTIFY_CMD=./scripts/no-such-notify.sh || exit 1
env_case "a file that is not executable" 2 "is not an executable command" "" NOTIFY_CMD=./README.md || exit 1
# The same through .env, where the settings really live (a value from a file is not the same origin as one on the command line)
printf 'SLACK_WEBHOOK_URL = http://example.test\n' > "${FLOW}/.env"
env_case ".env with only SLACK_WEBHOOK_URL: Slack, as before" 0 "" "${OFF}" || exit 1
printf 'SLACK_WEBHOOK_URL = http://example.test\nNOTIFY_CMD =\n' > "${FLOW}/.env"
env_case ".env with NOTIFY_CMD empty: notifications off" 0 "${OFF}" "" || exit 1
rm -f "${FLOW}/.env"
