# Changelog

All notable changes to this flow are recorded here, per tag.
Host repositories bring a tag in with `git subtree pull`; read the entries since your current tag before pulling,
especially **Changed** items that require edits to your `.ai-flow/`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.7.1] - 2026-10-04

### Fixed

- Slack notifications: `**bold**` next to full-width characters (Japanese text such as `**太字**（…）`) showed literal asterisks
  ([#24](https://github.com/maepon/issue-to-pr-flow/issues/24)). Slack only takes `*x*` as bold when the character outside each `*`
  is a space or ASCII punctuation, so `notify-slack.sh` now puts a zero-width space (U+200B) on both sides. Only a pair on one line whose inner
  edges are not spaces is converted; other `**` still collapse to `*`. The body other `NOTIFY_CMD`s get on stdin is unchanged.
  Covered by `selftest.sh` with a `curl` stub

## [0.7.0] - 2026-10-04

### Changed

- **Notifications are pluggable, and Slack is no longer required** ([#18](https://github.com/maepon/issue-to-pr-flow/issues/18)).
  `NOTIFY_CMD` (in `.env`, or `.ai-flow/config.mk` for a shared destination) is the command run at each ending and progress point.
  It gets the body on stdin and `AI_FLOW_NOTIFY_KIND` (`done` / `waiting` / `aborted` / `progress`), `AI_FLOW_NOTIFY_TITLE`,
  `AI_FLOW_NOTIFY_PHASE`, and `AI_FLOW_NOTIFY_ISSUE_URL` in the environment; a failure still only warns.
  When `NOTIFY_CMD` is not defined, Slack is used if `SLACK_WEBHOOK_URL` is set and nothing otherwise, so **a `.env` with only
  `SLACK_WEBHOOK_URL` keeps working unchanged**. `NOTIFY_CMD =` (empty) turns notifications off. `check-env` no longer requires
  `SLACK_WEBHOOK_URL`; it says `Notifications are off` when there are none, and stops if `NOTIFY_CMD` is not executable
- The Slack message format changed: the emoji now follows the kind (`:white_check_mark:` / `:raising_hand:` / `:x:` / `:hammer:`),
  and the title line replaces the old `Claude Code notification` header
- **If you replaced `scripts/notify-slack.sh` to turn notifications off** (as `docs/setup.md` used to suggest), drop that change and set `NOTIFY_CMD =` in `.env`.
  `notify-slack.sh` now reads the `AI_FLOW_NOTIFY_*` variables and stdin instead of two arguments

### Security

- `NOTIFY_SECRET_VARS` (default `SLACK_WEBHOOK_URL`) names the environment variables holding notification secrets. The `Makefile` exports them
  for `NOTIFY_CMD`, and `claude-run.sh` removes the same names (and always `SLACK_WEBHOOK_URL`) from the agents' environment.
  One list drives both, so a forgotten name means the notification lacks its secret, never that the agents can read it.
  A secret kept in the shell profile instead of `.env` is removed too. Covered by `selftest.sh` with a `claude` stub
- `notify-slack.sh` gives `curl` a time limit (`--connect-timeout 10 --max-time 30`), so an unresponsive webhook no longer holds the phase

### Added

- `selftest.sh` checks the notification contract (arguments, environment, body on stdin, a failing or stdin-ignoring command not stopping the flow);
  `ci-check.sh` checks how `check-env` decides on notifications, from the command line and from `.env`

## [0.6.0] - 2026-10-04

### Added

- `scripts/resign-subtree-merge.sh`: signs the commits that `git subtree add` / `git subtree pull --squash` create (they are unsigned,
  so a host repository that requires signed commits could not merge the subtree PR). It recreates the commits with the same tree,
  parents, message, and author, checks the tree is unchanged, then moves `HEAD`. Covered by offline tests in `selftest.sh`.
  `git rebase --rebase-merges --gpg-sign` is not a substitute: it re-runs the merge and, after `subtree add`, put the files at the repository root

### Documentation

- `SECURITY.md`: how to report vulnerabilities privately, and that release tags are never moved or deleted
- `docs/setup.md` §3 and `README.md`: how to bring the flow into a repository that requires signed commits
- `docs/setup.md` §10 records why the phase prompts are not turned into Claude Code skills (to keep the flow deterministic)

## [0.5.0] - 2026-10-03

### Security

- **Every `.env` is now denied to the `Read` tool**, not only the flow's own: all profiles deny `Read(//**/.env)` in addition to `Read(./.env)`,
  and `make check` requires it. A relative pattern only matches under the flow directory, so the project's root `.env` used to be readable
  (verified: the root `.env` and a nested `.env` went from readable to denied, while `.env.example` stayed readable).
  `.env.*` is not blocked, since `.env.example` would be blocked too. This stops the `Read` tool only; running tests can still read anything

### Added

- The template and `docs/setup.md` explain how to protect other secret files: add `Read(//**/<path>)` to `deny` in `.ai-flow/permissions.json`

## [0.4.0] - 2026-10-03

### Added

- **Projects without automated tests are supported**: leave `TEST_CMD` and `SCRATCH_TEST_CMD` both empty. The plan then maps each acceptance
  criterion to a verification command (or a `manual` check with steps) instead of a test; implement runs the commands before and after the change;
  the judges re-run them; Devil's Advocate's Claim 2 breaks the change and checks that the verification fails. Verdicts are still decided only
  by acceptance criteria numbers. Allow the verification commands in `.ai-flow/permissions.json`
- `{{#unless NAME}}` … `{{/unless}}` blocks in prompts (kept only when the value is empty), the counterpart of `{{#if}}`

### Changed

- `make check` no longer requires `TEST_CMD`; it now requires `TEST_CMD` and `SCRATCH_TEST_CMD` to be set together or left empty together.
  No change is needed in `.ai-flow/` for projects that have tests: the prompts they get are byte-for-byte the same as in 0.3.0
- `scripts/ci-check.sh` also runs `make check` without tests, and without tests and a formatter

### Fixed

- `make check` could fail when the user signs commits (`commit.gpgsign = true`) and the signing agent did not respond, because
  `selftest.sh` and `ci-check.sh` made signed commits in their throwaway repositories. Those commits are now unsigned

## [0.3.0] - 2026-10-03

First public release.

### Changed

- **The scripts' comments and terminal / Slack messages are now in English** (they were in Japanese). Agent output is unaffected:
  it is still written in `OUTPUT_LANG`. If you match on message text (e.g. in your own tooling), update the patterns;
  `docs/setup.md` §8 lists the common messages
- `make help` describes `REVIEW_JUDGE_MODEL` as it actually works (the fast model by default, used for judging both the plan and the implementation)

### Added

- `LICENSE` (MIT) and `CONTRIBUTING.md`

### Removed

- The known limitation "the scripts' comments and terminal / Slack messages are in Japanese"

## [0.2.1] - 2026-10-03

Fixes found by running the flow on a Python project (flow at `tools/flow/`, no formatter, `OUTPUT_LANG = English`).

### Fixed

- Bash commands with paths outside the flow directory (`git diff -- ../../README.md`) were denied: `claude-run.sh` now passes
  `--add-dir=<repository root>`. Verified: the same command went from denied to allowed
- MCP connectors linked to the user's claude.ai account were loaded in headless runs: `claude-run.sh` now passes `--strict-mcp-config`
- `claude -p` waited 3 seconds for standard input and printed a warning: it now gets `< /dev/null`
- `Edit` was missing from the commit profile, so touching up the PR body was denied (`Write` was already allowed)

### Changed

- The template and `docs/setup.md` now state that the agents run commands with the flow directory as the current directory,
  so `TEST_CMD` and friends must work from there. **Check your `.ai-flow/config.mk`** if your commands take paths
  (`npm test` / `npm run …` are fine as they are)

## [0.2.0] - 2026-10-03

### Added

- Conditional blocks in prompts: lines from `{{#if NAME}}` to `{{/if}}` are removed when the value of `NAME` is empty
  (`scripts/render-prompt.sh`; nesting and blocks spanning files are rejected)

### Changed

- **Projects without a formatter are supported**: leave all four `FORMAT_*` values in `.ai-flow/config.mk` empty, and the formatting
  steps are removed from the prompts (the per-file check was already skipped). No change is needed in `.ai-flow/` for projects that have a formatter
- In `implement.md` / `review-fix.md`, the formatting step is now a sub-item of the test step, so the step numbers have no gaps
  when it is removed. In `review-judge.md`, the formatting commands moved to their own line in the list of available commands

### Removed

- The known limitation "a project without a formatter is not supported" (a test command is still required)

## [0.1.0] - 2026-10-03

First release as a standalone repository. The flow was developed inside
[maepon/jumpmark-dock](https://github.com/maepon/jumpmark-dock) and carried over with `git subtree split`,
so its history is included; Issue / PR numbers in those commit messages refer to that repository.

### Added

- Phases driven by `make`: `spec` (questions or an instruction document with acceptance criteria, then a human gate),
  `impl` (plan → judge → revise → implement → review → fix → commit → PR → code review), and the partial entry points
  `review`, `code-review`, `pr-review` (Devil's Advocate, outside the main flow), and `create-pr`
- Verdicts mapped only to acceptance criteria (`APPROVED` / `CHANGES_REQUESTED` / `NEEDS_HUMAN`), at most `MAX_ROUNDS` (default 3) rounds,
  and outputs that cannot overturn an approval: `RESIDUAL_RISK`, `CODE_REVIEW`, `DEVILS_ADVOCATE`
- Two model tiers (`STRONG_MODEL` / `FAST_MODEL`), with the judges switchable through `REVIEW_JUDGE_MODEL` (fast by default)
- Project settings in `.ai-flow/` at the host repository root: `config.mk` (`BASE_BRANCH`, `TEST_CMD`, `SCRATCH_TEST_CMD`,
  `FORMAT_CHECK_CMD`, `FORMAT_FILE_CMD`, `FORMAT_FIX_CMD`, `FORMAT_GLOBS`, `OUTPUT_LANG`), `permissions.json`,
  `context.md`, `risk-catalog.md`, `user-flows.md`, `project-words.txt`. A template is in `examples/project/.ai-flow/`
- The flow can live in a subdirectory of any name and depth (`scripts/flow-paths.sh`); the whole flow directory,
  `.ai-flow/`, and the root `.gitignore` are protected as tooling files after every step
- Prompts in English, with human-facing output written in `OUTPUT_LANG`. Labels that later phases search for
  (`verified:run` / `verified:tests` / `verified:inference`, `unchecked`, `non-blocking`) are fixed tokens and never translated
- Guard rails: permission profiles statically checked for dangerous allows and required denies, `git push` / `gh pr create` run by
  the shell after checks, the instruction gate matched with a line-start anchor, prompts rendered and checked for unfilled placeholders
  before any cost is incurred
- `make check` (static checks and regression tests) before every phase, and `scripts/ci-check.sh` to run it in this repository;
  CI on macOS and Ubuntu
- `README.md` and `docs/setup.md` in English

### Known limitations

- The scripts' comments and terminal / Slack messages are in Japanese (fixed in 0.3.0)
- A project without a formatter or a test command is not supported yet: prompts that use an empty `FORMAT_*` / `TEST_CMD` value stop at render time (formatter: fixed in 0.2.0; tests: fixed in 0.4.0)

[Unreleased]: https://github.com/maepon/issue-to-pr-flow/compare/v0.7.1...HEAD
[0.7.1]: https://github.com/maepon/issue-to-pr-flow/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/maepon/issue-to-pr-flow/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/maepon/issue-to-pr-flow/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/maepon/issue-to-pr-flow/releases/tag/v0.1.0
