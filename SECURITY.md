# Security Policy

issue-to-pr-flow runs on the machine of whoever installs it, with that person's `claude` and `gh` credentials,
and gives AI agents permission to read files, run tests, and comment on Issues. A weakness in its guard rails
can therefore matter even though the flow itself is "just scripts and prompts".

## Reporting a vulnerability

Please report vulnerabilities **privately**, not in a public Issue:
use [Report a vulnerability](https://github.com/maepon/issue-to-pr-flow/security/advisories/new) on the Security tab.

Examples of what counts:

- A way for an agent to get around a guard rail: modify tooling files without the working tree check catching it,
  push or create a PR without going through `run-phase.sh`, pass the human gate without an instruction document,
  or read a denied file (such as `.env`) through a tool the profiles are meant to block
- A permission profile or `make check` gap that lets a dangerous allow through
- Secrets (such as `SLACK_WEBHOOK_URL` or the variables named in `NOTIFY_SECRET_VARS`) leaking into the agents' environment or into Issue / PR comments

Known limitations are not vulnerabilities: as `docs/setup.md` explains ("Deny is not isolation"), an agent that is allowed to run tests
can execute arbitrary code, so the permission lists prevent accidents rather than isolate the agent.

This is a personal project maintained in spare time; expect a reply within a few days.

## Supported versions

Only the latest release tag receives fixes. Release tags (`v*`) are protected and are never moved or deleted,
so a tag you have pulled with `git subtree pull` always means the same content.
