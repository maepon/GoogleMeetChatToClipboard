# Project settings for issue-to-pr-flow. The flow's Makefile includes this file.
#
# Copy this directory (.ai-flow/) to the root of your repository and edit the values.
# Personal settings (notifications, model IDs) go in <flow dir>/.env instead; this file is shared and committed.
# Makefile syntax. Do not quote values (the scripts split them into words).
# The agents run every command with the FLOW DIRECTORY as the current directory (e.g. ai-flow/), not the repository root.
# Write the commands so they work from there: `npm test` / `npm run …` find the root package.json by themselves,
# but path arguments must be relative to the flow directory (e.g. `python3 -m unittest discover -s ../tests`).
# Any value can be overridden for one run on the make command line, e.g. `make impl ISSUE=1 BASE_BRANCH=develop`.

# Branch that PRs are based on. scripts/ and prompts/ only use this value.
BASE_BRANCH = main

# Tests. If your project has no automated tests, leave TEST_CMD and SCRATCH_TEST_CMD both empty:
# the plan then maps each acceptance criterion to a verification command (or a `manual` check) instead of a test,
# and the judges run those commands. Allow the commands you expect to use in permissions.json.

# Runs the whole test suite. The agents use it to decide whether tests pass.
# If your test tool caches results, disable the cache here (e.g. `go test -count=1 ./...`),
# because the judge re-runs the tests to verify claims and must not see a replayed success.
TEST_CMD = npm test
# TEST_CMD = go test -count=1 ./...
# TEST_CMD = python -m pytest ..
# TEST_CMD = python3 -m unittest discover -s ../tests

# Runs a single throwaway test file (written under <flow dir>/tmp/). The file name is appended.
SCRATCH_TEST_CMD = node --test
# SCRATCH_TEST_CMD = go test
# SCRATCH_TEST_CMD = python -m pytest

# Formatting. If your project has no formatter, leave all four FORMAT_* values empty:
# the formatting steps are then removed from the prompts and the per-file check is skipped.

# Formatting check for the whole repository. Must give the same result from any directory.
FORMAT_CHECK_CMD = npm run format:check
# FORMAT_CHECK_CMD = make fmt-check
# FORMAT_CHECK_CMD = ruff format --check ..

# Formatting check for one file. The absolute path is appended. Must exit 0 when the file is formatted.
FORMAT_FILE_CMD = npx prettier --check
# FORMAT_FILE_CMD = ruff format --check

# Fixes formatting of a file. The file name is appended. Shown in abort messages and prompts.
FORMAT_FIX_CMD = npx prettier --write
# FORMAT_FIX_CMD = ruff format

# Files subject to the formatting check (shell case patterns, space-separated).
FORMAT_GLOBS = *.js *.css *.html
# FORMAT_GLOBS = *.go
# FORMAT_GLOBS = *.py

# Language for human-facing output (Issue comments, commits, PRs, the agents' final replies).
OUTPUT_LANG = English
