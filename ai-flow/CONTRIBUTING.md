# Contributing

Thanks for your interest. A few things specific to this repository:

## Changes to the flow are made by humans, through PRs

The flow refuses to let its own agents modify the flow's files (they are protected as tooling files in every host repository).
So changes to this repository are written and reviewed by humans and come in through pull requests here — never by running
`make spec` / `make impl` on an Issue of this repository.

## Before opening a PR

- Run `./scripts/ci-check.sh`. It lays the files out the way a host repository would and runs `make check`
  (static checks and the regression tests in `scripts/selftest.sh`), with and without a formatter configured. CI runs the same on macOS and Ubuntu
- Keep the scripts compatible with **bash 3.2** (the version bundled with macOS): no associative arrays, no `${x^^}`, and write `${x}`
  when a variable is followed by non-ASCII text
- If you change a prompt, check that it still renders for both a project with a formatter and one without (`ci-check.sh` does both),
  keep machine-read parts unchanged (verdict words, `AI-TAG`s, placeholders, the fixed `verified:*` / `unchecked` / `non-blocking` tokens),
  and keep project-specific words out of the shared prompts
- If behavior changes, describe how you verified it. Changes that only affect wording or structure can usually be verified
  without cost by diffing the rendered prompts and merged permissions before and after
- Add an entry under `[Unreleased]` in `CHANGELOG.md`, and call out anything host repositories must change in their `.ai-flow/`

## Releases

Host repositories pull tags with `git subtree pull`, so each release is a tag (`vX.Y.Z`) with a matching section in `CHANGELOG.md`.

## Design

Before changing how verdicts, permissions, or the tooling check work, read [docs/setup.md](docs/setup.md),
especially "Design that must not change".
