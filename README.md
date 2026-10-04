# issue-to-pr-flow

An Issue-driven development flow that runs [Claude Code](https://claude.com/claude-code) headlessly
from a GitHub Issue to a Pull Request: **spec → plan → implement → review → PR**, with exactly one human gate.

```
make spec ISSUE=n   →  questions or an instruction document with acceptance criteria (AC-1, AC-2, …)
                        ← a human reads it (the only gate)
make impl ISSUE=n   →  plan → judge → revise → implement → review → fix → commit → PR → code review
                        ← a human decides whether to merge
```

- **Verdicts come only from acceptance criteria.** The judges map findings to `AC-n`; impressions are not grounds to send work back, so rounds converge
- **Stops instead of guessing.** If judging does not converge in 3 rounds, or a criterion cannot be met as written, it stops and sends a notification (Slack, a command of your own, or none)
- **The history lives in the Issue.** Every step posts a tagged comment (`<!-- AI-TAG: … -->`), so humans read the whole story in one place
- **Guard rails around the agents.** Tooling files are checked after every step, `git push` / `gh pr` are run by the shell after checks rather than by the agents, and permission profiles are statically checked for dangerous allows
- **Prompts in English, output in your language.** Set `OUTPUT_LANG` and Issue comments, commits, and PRs are written in it

## Install

The flow lives in a subdirectory of your repository (any name and depth) and is brought in with `git subtree`.
Project-specific settings live in `.ai-flow/` at your repository root.

```sh
# at the root of your repository
git subtree add --prefix=ai-flow https://github.com/maepon/issue-to-pr-flow.git v0.1.0 --squash
cp -R ai-flow/examples/project/.ai-flow .ai-flow     # then edit .ai-flow/config.mk and friends

cd ai-flow
cp .env.example .env                                  # notifications (optional), model IDs
make check                                            # static checks and regression tests, no cost
make help
```

Update with `git subtree pull --prefix=ai-flow https://github.com/maepon/issue-to-pr-flow.git <tag> --squash`.
If your default branch requires signed commits, run `ai-flow/scripts/resign-subtree-merge.sh` right after `subtree add` / `subtree pull`
(the commits `git subtree` creates are unsigned; see [docs/setup.md](docs/setup.md) §3).
See [CHANGELOG.md](CHANGELOG.md) for what changed.

Requirements: `claude`, `gh` (authenticated), `jq`, `make`, `bash` (3.2 or later), and a GitHub repository that uses Issues.
Notifications are optional: a Slack Incoming Webhook (with `curl`) or any command you like (`NOTIFY_CMD`).

## Documentation

- [docs/setup.md](docs/setup.md) — setup, usage, verdict and permission design, troubleshooting, installation checklist
- [examples/project/.ai-flow/](examples/project/.ai-flow/) — the project settings template, with comments

## Developing this repository

Changes to the flow itself are made by humans through PRs here, not through the flow.
`./scripts/ci-check.sh` lays the files out the way a host repository would and runs `make check`; CI runs it on macOS and Ubuntu.

See [CONTRIBUTING.md](CONTRIBUTING.md).

The early commit history was written in [maepon/jumpmark-dock](https://github.com/maepon/jumpmark-dock), where this flow was developed,
and was carried over with `git subtree split`. Those commit messages are in Japanese, and Issue / PR numbers such as `#38` in them
refer to that repository.

## Security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md). Release tags (`v*`) are protected and never moved or deleted.

## License

[MIT](LICENSE)
