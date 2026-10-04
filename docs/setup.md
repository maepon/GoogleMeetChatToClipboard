# issue-to-pr-flow — Setup and Operation Guide

This guide covers installing the flow into a repository and running it day to day.
For a short overview, see the [README](../README.md).

---

## 1. What this is

**A mechanism that starts from a GitHub Issue and drives Claude Code headlessly all the way to a Pull Request.**
`make spec` settles the specification; `make impl` carries on through implementation, review, and PR creation.

```
Issue
 │
 ├─ make spec ────► posts questions OR an instruction document (with acceptance criteria) to the Issue, then stops
 │                   ▲
 │                   └─ a human reads it ← the only human gate
 │
 └─ make impl ────► plan → judge → revise (up to 3 rounds until approved)
                     → implement
                     → review → fix (up to 3 rounds until approved)
                     → commit and create the PR
                     → post a code review on the PR
                                    ▲
                                    └─ a human decides whether to merge
```

Three design principles:

1. **Only one human gate.** A human checks the instruction document; from there to the PR nothing stops.
   More gates dilute the point of automation; fewer let implementation start before the specification is settled.
2. **Verdicts are decided only by acceptance criteria numbers.** Pass/fail comes only from mapping to `AC-1`, `AC-2`, ….
   Verdicts based on impressions never converge.
3. **If it does not converge, stop and hand it to a human.** After at most 3 rounds it stops and sends a notification.
   Carrying on automatically turns review into a formality. When a judge concludes that an unmet criterion cannot be fixed
   by revision at all (contradictory criteria, a wrong premise in the instruction document), it returns `NEEDS_HUMAN` and stops without waiting for more rounds.

**The whole history stays in the Issue comments.** The local `tmp/` is scratch space; if it is lost, the flow can resume from the Issue.

---

## 2. Requirements

### Commands

| Command | Purpose | Check |
|---|---|---|
| `claude` | Claude Code CLI, used headlessly (`claude -p`) | `claude --version` |
| `gh` | GitHub CLI: reading/writing Issues, creating PRs | `gh auth status` |
| `jq` | Reading Claude's JSON output | `jq --version` |
| `curl` | Slack notifications (only if you use them) | `curl --version` |
| `make` | Entry point | `make --version` |
| `bash` | Running the scripts | `bash --version` |

### About the bash version

The scripts are **written to run on bash 3.2, which ships with macOS.** They avoid 4.x features such as associative arrays and `${x^^}`.
Using bash 4/5 is fine; keeping 3.2 compatibility makes them run everywhere. CI runs them on both macOS (3.2) and Ubuntu (5.x).

bash 3.2 has a pitfall: **variable name parsing is not multibyte-aware.** If a non-ASCII character directly follows `$x`,
the first byte of that character is taken into the variable name, and together with `set -u` it fails with `unbound variable`.
The scripts' messages are in English, but this matters as soon as someone writes a message in another language
(the flow was first written with Japanese messages, which is where this was found).

```bash
fail "ブランチ名が不正です（$branch）"   # ✗ fails: the first byte of "（" is read as part of the name
fail "ブランチ名が不正です（${branch}）" # ✓
```

**This happens inside error messages, so things work normally and only break when something fails.**
`scripts/check-scripts.sh` detects this form statically, and it runs before every phase.

### GitHub

- The repository is on GitHub and `gh` is authenticated
- **You work with Issues.** The flow keeps its state in Issue comments
- The default branch (the PR base) matches `BASE_BRANCH` in `.ai-flow/config.mk`

### Notifications

Phases run for a long time, so the flow sends a notification at each ending (done / waiting for a human / aborted) and when
implementation is done. **Notifications are optional, and the command that sends them is yours to choose** (`NOTIFY_CMD`).

| Setting in `.env` | What happens |
|---|---|
| Nothing | No notifications. `make` says `Notifications are off` at the start of each phase, so a missing setting does not go unnoticed |
| Only `SLACK_WEBHOOK_URL` | Slack, through `scripts/notify-slack.sh` (the behavior before `NOTIFY_CMD` existed) |
| `NOTIFY_CMD = <command>` | Your command. It wins over `SLACK_WEBHOOK_URL` |
| `NOTIFY_CMD =` (empty) | No notifications, even if `SLACK_WEBHOOK_URL` is set |

`NOTIFY_CMD` usually goes in `.env` (where notifications go is personal). Putting it in `.ai-flow/config.mk` works too, for a team that shares one
destination; a value in `.env` wins. `check-env` stops if the command is not executable, or if it is `notify-slack.sh` without `SLACK_WEBHOOK_URL`.

#### The contract with `NOTIFY_CMD`

The value is split into words (no quoting, no `~`), like the other commands; paths are relative to the flow directory.
For a script of your own, an absolute path or `$(AI_FLOW_PROJECT_DIR)/notify.sh` is the easiest
(`.ai-flow/` is protected from the agents by the tooling check, and the flow directory is a subtree you should not edit).

| Input | Content |
|---|---|
| stdin | The body: GitHub markdown as the agents wrote it, followed by the cumulative cost. Convert it to your service's dialect if needed |
| `AI_FLOW_NOTIFY_KIND` | `done` (a phase finished: PR created, review posted) / `waiting` (a human has to act: the instruction document is ready, questions, not converged, `NEEDS_HUMAN`) / `aborted` (`fail`) / `progress` (implementation done, going on to review) |
| `AI_FLOW_NOTIFY_TITLE` | One line of plain text, such as `impl aborted`. No emoji or markup |
| `AI_FLOW_NOTIFY_PHASE` | `spec` / `impl` / `review` / `code-review` / `pr-review` / `create-pr` |
| `AI_FLOW_NOTIFY_ISSUE_URL` | The Issue URL |

Exit with 0 on success. **A failure only prints a warning; the flow carries on** (a lost notification must not lose the work).
The flow does not time the command out, so give network calls a limit of their own (`curl --max-time 30`): a command that hangs holds the phase.
Fields may be added to `AI_FLOW_NOTIFY_*` later; ignore the ones you do not use.

#### Secrets

The agents must not be able to read the notification secret (see "Deny is not isolation" in §6). Name the environment variables that hold secrets in
`NOTIFY_SECRET_VARS` (default `SLACK_WEBHOOK_URL`). The `Makefile` exports exactly those for `NOTIFY_CMD`, and `claude-run.sh` removes the same
names from the agents' environment. Variables you define in `.env` are not exported otherwise, so **a name you forget to list means the command
does not get its secret, never that the agents can read it.** `SLACK_WEBHOOK_URL` is always removed.

Keep the secret in `.env` (every `.env` is denied to the `Read` tool) rather than in a file of its own, which the agents could read.

#### Examples

None of these except Slack has been verified with the flow yet.

Discord (its webhooks accept a Slack-compatible payload at `<webhook URL>/slack`, so the Slack script can be reused):

```make
SLACK_WEBHOOK_URL = https://discord.com/api/webhooks/<id>/<token>/slack
```

A script of your own, with its secret listed so the agents never see it (`.env`):

```make
NOTIFY_CMD = $(AI_FLOW_PROJECT_DIR)/notify.sh
NOTIFY_SECRET_VARS = MY_WEBHOOK_URL
MY_WEBHOOK_URL = https://...
```

The macOS notification center (no secret, so nothing to list). Save it as an executable script and point `NOTIFY_CMD` at it:

```bash
#!/bin/bash
# The body on stdin is not used: notification banners are short
osascript -e 'on run argv' -e 'display notification (item 2 of argv) with title (item 1 of argv)' -e 'end run' \
  "issue-to-pr-flow" "${AI_FLOW_NOTIFY_KIND}: ${AI_FLOW_NOTIFY_TITLE}"
```

Google Chat is tracked in [#17](https://github.com/maepon/issue-to-pr-flow/issues/17).

### Models

The flow uses **two tiers**: a **strong model** (`STRONG_MODEL`) for judgment and cross-checking,
and a **fast model** (`FAST_MODEL`) for the high-volume work. Two lines in the `Makefile` take the defaults from environment variables.

```sh
export CLAUDE_CODE_OPUS_MODEL=<strong model ID>
export CLAUDE_CODE_SONNET_MODEL=<fast model ID>
```

To use different environment variable names, change only those two lines in the `Makefile`.
If you do not define the environment variables, you can write the IDs in `.env` instead (`.env.example` has commented-out lines).

```make
STRONG_MODEL = <strong model ID>
FAST_MODEL = <fast model ID>
```

Use `=`, not `?=`. The `Makefile` defines them first, so `?=` would not take effect.

Roles:

| Role | Tier | Why |
|---|---|---|
| Writing the instruction document, the commit and PR body, code review, Devil's Advocate | Strong | The job is judgment and cross-checking |
| Writing the plan, revising the plan, implementing, fixing findings | Fast | Lots of work, with concrete instructions |
| Judging the plan and the implementation | `REVIEW_JUDGE_MODEL` (fast by default) | The judges verify by running tests and reading diffs, which turned out to be enough for the fast model; switch with `REVIEW_JUDGE_MODEL=strong` |

**The variables are named by capability rather than product name because which phase gets which tier is a policy in `scripts/run-phase.sh`,
and it is something you actually swap to experiment with** (`REVIEW_JUDGE_MODEL`, §4). The model ID used is printed to stderr for each step,
so the logs show which one ran.

> **Environment variables set in `.zshrc` are not read by non-interactive shells.** Running `make` from a terminal inherits them,
> but calling `make` from a non-interactive shell (Claude Code's Bash tool, IDE tasks) treats them as unset.
> To make them work from anywhere, put them in `.zshenv` or in `.env`.

### Location and `.gitignore`

The flow lives in a **subdirectory of your repository**. The name and depth are up to you (`ai-flow/`, `tools/flow/`, …).
Scripts and prompts never hard-code the directory name; `scripts/flow-paths.sh` derives it at run time from `git rev-parse --show-prefix`.
**Placing it at the repository root is not supported** (the flow's `Makefile` / `scripts/` / `docs/` would be indistinguishable from your project's files
of the same name; `make check` and `run-phase.sh` stop).

The ignore rules the flow needs are in the flow directory's own `.gitignore`. They do not depend on the directory name,
so there is nothing to add to your root `.gitignore`.

```
.env
tmp/
!.claude/
!.claude/*-permissions.json
.claude/settings.json
.claude/settings.local.json
```

**`tmp/` is essential.** It is where the agents write comment bodies; if it were tracked by git,
`run-phase.sh`'s working tree check would fire every time and the flow would stop.
The two `!.claude/` lines bring the permission files back in environments whose global gitignore ignores `.claude`
(per-directory `.gitignore` files take precedence over the global one).

---

## 3. Installation and setup

### Bring the flow into your repository

```sh
# at the root of your repository
git subtree add --prefix=ai-flow https://github.com/maepon/issue-to-pr-flow.git v0.1.0 --squash

# project settings: copy the template to the root and edit it
cp -R ai-flow/examples/project/.ai-flow .ai-flow
```

To update later:

```sh
git subtree pull --prefix=ai-flow https://github.com/maepon/issue-to-pr-flow.git <tag> --squash
```

Read `CHANGELOG.md` for what changed before pulling a new tag. Do not edit files under the flow directory in your repository;
send changes upstream instead (the flow treats its whole directory as tooling, §6).

### If your default branch requires signed commits

`git subtree` creates the "Squashed '<prefix>/' …" commit — and, for `add`, the merge commit too — unsigned
(it has no signing option). The subtree PR has to be merged with a merge commit, so those unsigned commits would land on
the default branch and a "require signed commits" rule blocks the merge. Right after `git subtree add` or `git subtree pull`, run:

```sh
ai-flow/scripts/resign-subtree-merge.sh
```

It recreates the two commits signed, with the same tree, parents, message, and author, checks that the tree did not change,
and only then moves `HEAD` (nothing else in the working tree changes). If they are already signed it does nothing.
It uses your usual signing setup, like `git commit -S`.

Do **not** use `git rebase --rebase-merges --gpg-sign` for this: rebase re-runs the merge instead of reusing its tree.
After `git subtree add` that put the subtree's files at the repository root instead of under the prefix (verified),
and after `pull` it only works when git happens to guess the subtree shift.

### Configure

```sh
cd ai-flow
cp .env.example .env
# optional: notifications (SLACK_WEBHOOK_URL or NOTIFY_CMD; see Notifications in §2). Makefile syntax; make includes it

make check                   # project settings present, static checks, regression tests (selftest.sh). No cost
make check-env               # environment variable checks. No cost
make help                    # list of phases
```

When `check: static checks of the tooling files passed.` appears, the foundation is in place.

Settings live in two places:

| Location | Contents | Committed |
|---|---|---|
| `<flow dir>/.env` | Personal settings (notifications, model IDs) | No |
| `.ai-flow/` at the root | Project settings: `config.mk` (base branch, test and format commands, output language), `permissions.json` (extra permissions), text embedded in prompts (`context.md` / `risk-catalog.md` / `user-flows.md`), `project-words.txt` | Yes |

The flow directory only contains what is the same for every project. What you adapt to your project is `.ai-flow/` only.

### Things you can check without cost

| Check | Command |
|---|---|
| A notification arrives | `printf 'test\n' \| AI_FLOW_NOTIFY_KIND=done AI_FLOW_NOTIFY_TITLE=test AI_FLOW_NOTIFY_ISSUE_URL=http://example.test <your NOTIFY_CMD>` (for Slack, prefix `SLACK_WEBHOOK_URL=<URL>`) |
| A notification fires on abort | `NOTIFY_CMD=<command> ./scripts/run-phase.sh bogus-phase 99999 "http://example.test"` (plus the variables your command needs, such as `SLACK_WEBHOOK_URL`) |
| The human gate works | `make impl ISSUE=n` on an Issue without an instruction document (stops with `Issue #n has no instruction document`) |

Running `run-phase.sh` directly appends a header line to `tmp/cost-issue<N>.txt`. Use an unused Issue number when trying it,
and delete `tmp/cost-issue<N>.txt` afterwards.

---

## 4. Usage

| Command | What it does | How it ends |
|---|---|---|
| `make spec ISSUE=n` | The strong model reads the Issue and the code and posts **questions** or an **instruction document** | Stops (a human reads it) |
| `make impl ISSUE=n` | Plan → judge → revise → implement → review → fix → commit and create the PR → code review | A PR exists |
| `make review ISSUE=n` | Runs only the second half of `impl` (review onwards) | A PR exists |
| `make code-review ISSUE=n` | Runs only the plain code review of the PR | A comment on the PR |
| `make pr-review ISSUE=n` | Argues against the PR (Devil's Advocate). Not part of the main flow | A comment on the PR |
| `make create-pr ISSUE=n` | Retries only the push and PR creation (`create_pr`) | A PR exists |
| `make check` | Static checks and the regression tests (`scripts/selftest.sh`); runs automatically before each phase | — |

Run `review` on its own after `impl` stopped without converging and you fixed things by hand.
`code-review` on its own is for when the PR exists but posting failed.
`create-pr` on its own is for when the review is approved and the commit and PR title/body (`pr.md`) are done,
but the end of `review` failed only because of `create_pr` itself (e.g. `origin/<BASE_BRANCH>` not found).
Redoing it from `review-judge` would duplicate the review comments on the Issue, so that part is not redone.

Variables: `ISSUE` (target Issue number), `MAX_ROUNDS` (maximum judging rounds, default 3), `BASE_BRANCH` (PR base; the value comes from `.ai-flow/config.mk`),
`REVIEW_JUDGE_MODEL` (the model judging the implementation and the plan; accepts `strong` / `fast` or a raw model ID. The `Makefile` default is the fast model).

You can try whether the fast model is enough for judging (`make impl ISSUE=n REVIEW_JUDGE_MODEL=fast`, the default)
or switch it back to the strong model (`REVIEW_JUDGE_MODEL=strong`).

### The one place a human steps in

**Only checking the instruction document.**

- **If questions come back** — answer in an Issue comment and re-run `make spec ISSUE=n`
- **If you want to change the instruction document** — likewise comment on the Issue and re-run `make spec ISSUE=n`
- **`make impl` without an instruction document stops**

On re-run, spec posts the **full text of the instruction document** with the feedback incorporated. Downstream phases
read **only the latest** `INSTRUCTION` as the authoritative specification, so older ones become void automatically.
**A comment with just the difference does not become part of the specification.**

### Issue comment types (AI-TAG)

The `<!-- AI-TAG: … -->` at the top of each comment identifies its type.

| Tag | Written by | Contents |
|---|---|---|
| `QUESTION` | spec | Questions to settle the specification |
| `INSTRUCTION` | spec | The instruction document. **Contains the acceptance criteria (`AC-n`). Downstream phases read only this as the specification** |
| `PLAN` | plan | Implementation plan and test scenarios |
| `PLAN_REVIEW` | plan-judge | Verdict on discrepancies with the instruction document |
| `IMPLEMENTATION_DONE` | implement | Implementation report |
| `CRITIC_REVIEW` | review-judge | Pass/fail verdict against the acceptance criteria |
| `RESIDUAL_RISK` | review-judge | Dangers left outside the acceptance criteria (**does not affect the verdict**) |
| `FIX` | review-fix | What was fixed |
| `CODE_REVIEW` | code-review | **On the PR.** Code review outside the acceptance criteria (does not affect any verdict) |
| `DEVILS_ADVOCATE` | pr-review | **On the PR.** Arguments against the acceptance criteria themselves (does not affect any verdict) |

### How to write Issues

The quality of the instruction document becomes the quality of the implementation, and **vague acceptance criteria are exactly what keeps rounds from converging.**

- **Write "what you want" and "why" in the Issue. You do not need to write "how"** — the plan decides the means
- **Measure the size of an Issue by its number of purposes**, not files or steps. Two purposes, two Issues
- It is fine to run `make spec` with vague premises. Questions come back, and you answer them there

---

## 5. Verdict design

### Why verdicts use only acceptance criteria numbers

The judges (`plan-judge` / `review-judge`) decide pass/fail only by mapping to `AC-1`, `AC-2`, … in the instruction document.
"Code quality is low" or "there is a better way to write it" is not grounds for sending it back.

**Verdicts based on impressions never converge.** If reasons to send it back can be invented without end, three rounds will not finish.
The design has an unavoidable hole in exchange:

> **The reviewer cannot stop defects that the acceptance criteria do not mention.**

When the acceptance criteria are vague, three rounds do not converge and it stops waiting for a human. In that case **fix the instruction document, not the implementation.**

### Outputs that cannot overturn an approval

To fill that hole, there are three outputs that **do not affect the verdict**.
Keeping them out of the verdict is the point: if they could overturn an approval, verdicts would go back to impressions and stop converging.
Treat the dangers they surface as **seeds for the next Issues**.

| | Where it appears | Responsibility |
|---|---|---|
| `RESIDUAL_RISK` | The Issue (a separate comment from the approving judge) | **Dangers left outside the acceptance criteria.** How each `AC-n` was verified (`verified:run` / `verified:tests` / `verified:inference`) and the walk through the incident catalog (unchecked items marked `unchecked`) |
| `CODE_REVIEW` | The PR (a separate process at the end of `make impl`) | **Whether the code is correct as code, outside the acceptance criteria.** Four aspects: boundary conditions and type mix-ups, swallowed errors, security (path handling, TOCTOU, unvalidated external input), and paths where normal input causes unexpected errors. No readability or style opinions; only findings with evidence that something breaks or errors |
| `DEVILS_ADVOCATE` | The PR (only when a human runs `make pr-review`) | **Errors in the acceptance criteria themselves.** Five claims examined one by one: "the purpose is not achieved even with all ACs met", "the tests only rubber-stamp the implementation", "things that used to work no longer do", "it would have been better left out", "the PR body does not match the diff". Claims that did not hold are written up as not holding |

`CODE_REVIEW` is a separate phase because judges that decide only by acceptance criteria numbers
**structurally cannot catch defects the ACs do not mention.**

`DEVILS_ADVOCATE` has a different responsibility ("question the ACs themselves"), but it tends to be **the single most expensive step per round**,
so by default it is out of the main flow and run on its own.

### The incident catalog for `RESIDUAL_RISK`

`.ai-flow/risk-catalog.md` holds the incident patterns to walk through (embedded at `{{RISK_CATALOG}}` in `prompts/review-judge.md`).
**Build this list from incidents that actually happened.** With only generic items it only ever says "nothing in particular",
so **add to it whenever an incident happens in your repository.**

### Claim 2 of `pr-review` (Devil's Advocate)

To check "do the tests merely rubber-stamp the implementation rather than the specification",
**it actually breaks one line of the implementation and sees whether the tests fail.** If they do not, those tests do not verify that behavior.
What it breaks must be restored, so this phase gets a dedicated profile that allows `git restore` (`.claude/pr-review-permissions.json`).
It runs after the PR is created, so the diff is committed and restore loses nothing.

`scripts/run-phase.sh` catches a forgotten restore by **comparing the working tree before and after**.
`code-review` goes through the same comparison. It is not supposed to fix code,
but `Write` / `Edit` are granted without path restrictions, so the rule alone is not a guarantee.

---

## 6. Permission design

The permissions given to the agents are defined by the profiles in `.claude/`.

| File | Phases | Notes |
|---|---|---|
| `.claude/phase-permissions.json` | spec / impl / review | The base. Grants `gh issue comment` |
| `.claude/commit-permissions.json` | PR creation | Adds `git add` / `git commit` / `git switch` |
| `.claude/pr-review-permissions.json` | code-review / pr-review | Two differences from the base: adds `git restore`, removes `gh issue comment` (the destination is the PR, not the Issue) |

These only contain commands every project uses. Project-specific commands such as tests and formatting go in the `allow` of `.ai-flow/permissions.json`.
Each time `claude-run.sh` starts claude, `scripts/merge-permissions.sh` adds them to the profile, writes the result to a temporary file,
and passes it with `--settings` (rules with a `./` prefix such as `Read(./.env)` resolve relative to the current directory,
not the settings file's location, so they still work from a temporary file).
The merged result is not kept in `tmp/` or elsewhere because an agent could rewrite it to widen the permissions of the next step.
`check-scripts.sh` checks the permissions after merging, for all three profiles.

### Pitfalls found by measurement

These are counter-intuitive, so **read them before editing a profile.**
The details are also kept in the comment at the top of `scripts/claude-run.sh`.

**These are measurements against particular versions, not Claude Code's specification.** The version at the time of measurement was not recorded;
the last time they were checked against this table was 2.1.243 (2026-09-24). They may change as versions move,
so note `claude --version` when you install, and when it goes up re-check at least these two.
Each is one short run on the fast model, so the cost is small (they cannot be checked without cost).

- With a profile that allows only `Write(tmp/**)`, ask it to "write one line to `tmp/x.txt`" and see whether it is denied
  (if it now passes, write ranges can be restricted by permissions)
- Pass a profile named `.claude/settings.json` with `--settings` and see whether its allow takes effect

| Behavior | What it means |
|---|---|
| With the **name** `.claude/settings.json`, `permissions.allow` is ignored entirely when the workspace is not trusted, even when passed explicitly with `--settings` (only a warning on stderr; exit code 0) | **Do not use this name.** It silently runs with no permissions |
| With any other file name, both allow and deny work | Why the profiles are named `*-permissions.json` |
| A `deny` in `settings.json` **also binds the human's interactive sessions** (deny blocks without a prompt) | You could no longer commit / push yourself |
| `Write` / `Edit` **rules with a path never match, in allow or deny** (`Write(./**)`, `Write(**)`, `Write(tmp/**)`, absolute forms were all denied) | Only bare `Write` / `Edit` can be granted. **Write ranges are restricted by the shell's working tree check instead** |
| Paths work for `Read`. `deny Read(./.env)` beats a bare `allow Read` | `.env` can be blocked |
| A relative pattern (`Read(./.env)`, `Read(.env)`) only matches at or under the current directory (the flow directory), not the project root above it. `Read(//**/.env)` matches a file named `.env` anywhere | Every profile denies both. The root `.env` went from readable to denied, and `.env.example` stayed readable. Protect other secret files with `Read(//**/<path>)` in `.ai-flow/permissions.json` |
| A deny in the colon form is a **prefix match** and beats an allow of the base command too | A `Bash(gh pr:*)` deny blocks both `gh pr comment` and `gh pr create` |
| Claude Code itself blocks writes under `.claude/` | Agents cannot widen their own permissions. `prompts/` and `scripts/` are not covered, though |
| Blocks by deny do **not** appear in `permission_denials`; they come back as tool errors | Some denials do not show up in the list |
| Even when a tool call is denied, `claude` exits with **0** | `claude-run.sh` reads `permission_denials` and prints them to stderr |
| With the flow directory as the current directory, Bash commands whose arguments point outside it (`git diff -- ../README.md`) are denied, while `Read` / `Write` / `Edit` reach those files | `claude-run.sh` passes `--add-dir=<repository root>`. Use the `=` form: `--add-dir` takes several values and would swallow the prompt |
| Headless runs load the MCP connectors linked to the user's claude.ai account | `claude-run.sh` passes `--strict-mcp-config` so none are loaded |

### Allows that must never be granted

`scripts/check-scripts.sh` rejects these statically.

- **`grep` / `cat` / `sed` / `awk` / `head` / `tail` / `cp` / `mv` / `chmod` / `curl` / `ln` / `tee` / `xargs` / `find`** —
  allowing even one general-purpose command that can read files gets around the `Read(./.env)` deny.
  Agents try piping into `grep` and get denied; that is expected (they use `Read` instead)
- **`git -C <path>` / `<command> -C <path>`** — Bash rules match by prefix, so
  `git -C . push` slips past the `git push` deny
- **Shells and interpreters in forms that run anything in one command** — `bash` / `sh` / `zsh` / `env` / `eval` / `exec`,
  bare `python` / `node` / `npx` and the like, one-liners with `-c` / `-e` / `-p`, and `python -m:*` with nothing after it
  (`python -m http.server` would pass). **Narrowing down what runs passes**, e.g. `python -m pytest:*` or `npx prettier:*`.
  `npm run:*` is not rejected by the check, but for the same reason spell out the script name, e.g. `npm run lint:*`
- **`Bash(git:` / `Bash(gh:` / `Bash(*` / `Bash(:`** — too broad

### Denies required in every profile

If even one is missing, `make check` fails and no phase starts.

```
Read(./.env)
Read(//**/.env)
Bash(git push)
Bash(git push:*)
Bash(gh pr:*)
Bash(rm:*)
Bash(git rebase:*)
Bash(git reset --hard:*)
```

### Deny is not isolation

**As long as running the tests is allowed, the agents can execute arbitrary code.**
For example, the `.env` denies stop the `Read` tool, but a test or script the agent writes could still read those files.
If they wanted to, they could reach denied operations. The permission lists prevent accidents; they are not a sandbox.

The effective safeguards are these three. **Do not remove any of them.**

1. **Claude Code itself blocks writes to `.claude/`** — agents cannot widen their own permissions
2. **`scripts/run-phase.sh` checks the working tree after each step and aborts if tooling files were modified**
3. **`push` and `gh pr` are not given at all; `run-phase.sh` runs them after checking** —
   it mechanically verifies the branch naming rule and that no tooling files are mixed into the project's commits.
   Blocking dangerous push forms by enumerating permission rules leaks, so they are simply not granted

Therefore **do not leave secrets in the environment variables passed to the agents.**
The `Makefile` exports the notification secrets named in `NOTIFY_SECRET_VARS` for `NOTIFY_CMD`, so `claude-run.sh` removes the same names
(and always `SLACK_WEBHOOK_URL`) with `env -u` (otherwise `echo` could read them and the `Read(./.env)` deny would be pointless).

### Protecting the tooling files

After each step, `run-phase.sh` looks at the working tree and aborts if **tooling files** were modified:
**everything under the flow directory**, plus `.ai-flow/` and `.gitignore` at the root.
The flow directory is the content of this repository brought in with subtree, so a project change has no business modifying anything in it
(the agents' scratch files in `tmp/` and each person's `.env` are ignored by the flow's `.gitignore`, so they do not show up in the check).
`.ai-flow/`, unlike `.claude/`, is not write-protected by Claude Code itself, so this check is its only safeguard.
The root `.gitignore` holds no flow rules, but it stays protected: a rule ignoring the flow directory would hide new files placed there from this check.
git reports paths relative to the repository root even when run from the flow directory, so `TOOLING_PATHS` is built with
the `FLOW_PREFIX` found by `flow-paths.sh` (escaped for use in a regular expression).
Since `Write` / `Edit` cannot be restricted by path, this is the only safeguard.

What counts is defined by `TOOLING_PATHS` in `run-phase.sh`. The same list shown to the agents is in
`prompts/_rules.md` and `prompts/pr.md`; when changing it, keep all three in sync.

### Keep project words out of the shared part

`make check` looks for the words listed in `.ai-flow/project-words.txt` in `prompts/*.md` and `.claude/*-permissions.json`
(whole words, case-insensitive). The shared part is used by other projects too, so writing one project's commands or circumstances there
gives the agents wrong instructions in other projects.
The word list lives on the project side, so wherever the flow is installed, the check works with that project's words.
If something is found, move it to an `.ai-flow/` file (such as `context.md`) or make it a placeholder.

The same check also looks at whether the source files in the working tree pass the formatter (aborts if not).
**Formatting is done by the agents, not the shell.** If the shell rewrote the diff,
what the reviewer read and the actual diff would differ.

> **Do not touch the tooling files while a phase is running.**
> The check treats a human's edit as the agent's and aborts. The work is not lost when it stops;
> you can resume with `make review` and the like.

### How commits are split

**Tooling files** (the targets of `TOOLING_PATHS` above) come in through **their own PRs, made by humans** (never through this flow).
**Project changes** go on a `feature/` branch and into a PR. **The two are never mixed in one commit.**

`run-phase.sh` checks this right before creating the PR and aborts without creating it if they are mixed.

---

## 7. File layout

```
Makefile                             Entry point (make help). Includes .ai-flow/config.mk at the repository root
.gitignore                           Ignore rules for the flow (tmp/, .env, bringing back the permission files)
.env.example                         Template for personal settings (→ copy to .env)
README.md / CHANGELOG.md             Overview / changes per tag
LICENSE / CONTRIBUTING.md            MIT license / how changes to the flow are made

scripts/
  run-phase.sh                       The flow's script: phase progression, checks, push, PR creation, notifications
  claude-run.sh                      Runs Claude Code headlessly once. Measurement notes on permissions at the top
  render-prompt.sh                   Fills prompt placeholders (called by claude-run.sh)
  flow-paths.sh                      Finds where the flow directory is (sourced by the scripts)
  merge-permissions.sh               Adds the project's extra permissions to a profile (called by claude-run.sh)
  check-scripts.sh                   Static checks of the tooling files (run before each phase)
  selftest.sh                        Regression tests for run-phase.sh functions and render-prompt.sh (called by check-scripts.sh;
                                     gh / npx / claude / curl are stubbed; runs throwaway repositories with the flow at ai-flow/ and tools/ai.flow/)
  ci-check.sh                        Runs make check in this repository by laying files out like a host repository (local and CI)
  resign-subtree-merge.sh            Signs the commits git subtree add / pull --squash created, keeping their trees (§3)
  notify-slack.sh                    Slack notification (the default NOTIFY_CMD when SLACK_WEBHOOK_URL is set)

prompts/
  _rules.md                          Common rules appended to every phase
  spec.md                            Writes questions OR an instruction document (with acceptance criteria)
  plan.md                            Writes the implementation plan and test scenarios
  plan-judge.md                      Judges discrepancies between plan and instruction document
  plan-revise.md                     Revises the plan after findings
  implement.md                       Implements
  review-judge.md                    Pass/fail against the acceptance criteria + RESIDUAL_RISK
  review-fix.md                      Fixes findings
  pr.md                              Creates the branch, commits, writes the PR title and body
  code-review.md                     Code review outside the acceptance criteria (posted on the PR)
  pr-review.md                       Arguments against the acceptance criteria themselves (posted on the PR)

.claude/
  phase-permissions.json             Permissions for spec / impl / review
  commit-permissions.json            Permissions for the PR creation phase
  pr-review-permissions.json         Permissions for code-review / pr-review

docs/
  setup.md                           This guide

examples/project/.ai-flow/           Template for project settings (copy to your repository root)

.github/workflows/check.yml          CI for this repository (inert inside a host repository)

<repository root>/.ai-flow/          Project settings (outside the flow directory)
  config.mk                          Base branch, test and format commands, output language
  permissions.json                   Extra permissions (added to all three profiles)
  context.md                         Project context (embedded at the end of _rules.md)
  risk-catalog.md                    Incident catalog (embedded in review-judge.md)
  user-flows.md                      Normal usage (embedded in Claim 3 of pr-review.md)
  project-words.txt                  Project words that must not appear in the shared part (make check looks for them)

tmp/                                 Scratch files (not tracked by git; the flow can resume from the Issue if they are lost)
  verdict-issue<N>.txt               The one-word verdict
  cost-issue<N>.txt                  Cost spent on this Issue (appended)
  issue<N>-<prompt name>.md          Comment bodies written by the agents
  pr-title-issue<N>.txt              PR title
  pr-body-issue<N>.md                PR body
```

### How prompts are built

`claude-run.sh` **appends** `prompts/_rules.md` to each prompt, fills the placeholders, and passes the result.

| Placeholder | Contents |
|---|---|
| `{{ISSUE}}` | Issue number |
| `{{VERDICT_FILE}}` | File to write the one-word verdict to |
| `{{COMMENT_FILE}}` | File to write a comment body to (derived from the prompt name) |
| `{{PR_TITLE_FILE}}` / `{{PR_BODY_FILE}}` | PR title and body |
| `{{BASE_BRANCH}}` | PR base branch (`BASE_BRANCH` in `.ai-flow/config.mk`), e.g. `origin/{{BASE_BRANCH}}..HEAD` when reading the diff |
| `{{TEST_CMD}}` / `{{SCRATCH_TEST_CMD}}` / `{{FORMAT_CHECK_CMD}}` / `{{FORMAT_FILE_CMD}}` / `{{FORMAT_FIX_CMD}}` / `{{FORMAT_GLOBS}}` / `{{OUTPUT_LANG}}` | The values of the same names in `.ai-flow/config.mk` |
| `{{FLOW_DIR}}` / `{{ROOT_REL}}` | The flow directory (e.g. `ai-flow`) and the relative path from it to the root (e.g. `../`), found by `flow-paths.sh`. Hard-coding the directory name in a prompt fails `make check` |
| `{{PROJECT_CONTEXT}}` / `{{RISK_CATALOG}}` / `{{USER_FLOWS}}` | A line consisting only of one of these is replaced with the contents of `context.md` / `risk-catalog.md` / `user-flows.md` in `.ai-flow/` |

A block from a line `{{#if NAME}}` to a line `{{/if}}` is conditional: if the value of `NAME` (one of the value placeholders) is empty,
the whole block is removed; otherwise only the two marker lines are removed. `{{#unless NAME}}` … `{{/unless}}` is the opposite: kept only
when the value is empty. The prompts use them to drop the formatting steps when the `FORMAT_*` values are empty, and to switch from
test wording to verification-command wording when `TEST_CMD` is empty. Blocks cannot be nested or span files.

`scripts/render-prompt.sh` does the filling. If a placeholder has an empty value or remains unfilled (outside a removed block),
it stops before starting claude. `make check` also renders every prompt once to verify this.

**A phase asked for a verdict writes only the single specified word to `{{VERDICT_FILE}}`.**
If explanations or decoration get mixed in, `make` cannot proceed and stops waiting for a human.

### Notes for editing prompts

- **Prompts are in English; human-facing output is in the `OUTPUT_LANG` language.** Write additions to prompts in English
  and leave the output language to `OUTPUT_LANG` in `.ai-flow/config.mk`. Text in `.ai-flow/` (such as `context.md`) can stay in the project's language
- **Labels that later phases search for literally are fixed, language-independent tokens.** These are `verified:run` / `verified:tests` /
  `verified:inference`, `unchecked`, and `non-blocking`, and the prompts say to write them "as is, untranslated".
  If they were translated into the output language, the residual-risk summary in the PR body and the like could not pick them up. Things found by meaning, such as section headings, are translated
- **Wrap anything that depends on an optional setting in a conditional block** (`{{#if FORMAT_CHECK_CMD}}` … `{{/if}}`), so projects
  without it still render, and give the alternative in `{{#unless …}}` when one is needed (as the test / verification wording does).
  Keep numbered steps outside the block so the numbering has no gaps when it is removed
- **`prompts/_rules.md` applies to every phase.** Anything added there is paid for on every step
- **An agent can run only one command per call.** Compound commands (`cd X && cmd`, `cmd1; cmd2`,
  control structures, `VAR=value cmd` prefixes, command substitution, pipes, heredocs) are **denied even when the command is allowed.**
  `cd` is allowed and the current directory persists across calls, so they run it in two calls.
  Without this guidance in `_rules.md`, agents keep getting denied and spin
- **`cp` is not allowed** (`cp ./.env /tmp/x` would get around the `Read(./.env)` deny).
  Agents create test input files with the `Write` tool

---

## 8. Reading why it stopped

There are three ways it ends.

| Ending | Exit code | Notification (`AI_FLOW_NOTIFY_KIND`) | Meaning |
|---|---|---|---|
| Ran to completion | 0 | `done` | On to the next step |
| `halt` (waiting for a human) | **0** | `waiting` | Not a failure. A human reads and decides |
| `fail` (aborted) | 1 | `aborted` (title `<phase> aborted`) | Unexpected. The message says how to resume |

`halt` exits with 0 because **waiting for a human is not a failure.** Keep this in mind if you wire it into CI.

### Abort messages say how to resume

`fail` messages are written to include "what happened" and "how to fix it, and which command resumes".
**Nothing is lost.** The implementation in the working tree and the Issue comments remain.

Common ones:

| Message | Cause and remedy |
|---|---|
| `Issue #n has no instruction document` | Run `make spec` first; this is the human gate. **If it appears although there is an instruction document**, suspect a SIGPIPE race in `require_instruction` (`run-phase.sh`) caused by large `gh issue view --comments` output. Piping `gh` output straight into `grep -q` can make `grep -q` exit early when the output is large; `gh` gets SIGPIPE (exit code 141), and under `pipefail` the match is treated as a failure. Going through a temporary file avoids it (learned the hard way) |
| `Unexpected verdict file contents: '…'` | The agent wrote something other than the one-word verdict. Read the Issue comments and decide |
| `… modified tooling files` | Restore with `git` and re-run. **This also happens if a human touched them during a phase** |
| `… left files that fail the formatting check` | Apply the formatter, then resume with `make review`. If it appears for formatted files, the formatter is missing or there is a syntax error (a failing check is treated as a stop too) |
| `The branch name does not start with feature/` | The naming rule. The implementation remains, so recreate the branch |
| `Tooling files are mixed into the project's commits` | Split them into separate commits. **It also happens when the project branch forked from an old point and tooling updates have since landed on `BASE_BRANCH`** (they show up reversed in the `origin/<BASE_BRANCH>..<branch>` diff). In that case rebase the project branch onto `origin/<BASE_BRANCH>` and run `make create-pr` |
| `origin/… not found` | `BASE_BRANCH` in `.ai-flow/config.mk` does not match the default branch. After fixing it, resume with `make create-pr` without redoing the review (resuming from `review` duplicates the `review-judge` comments) |
| `No difference from origin/…` | The agent did not commit. Resume with `make review` |
| `PR not found` | When running `code-review` / `pr-review` on their own, the current branch has no PR |
| `… was not approved after <MAX_ROUNDS> rounds` | **This happens when the acceptance criteria are vague.** Revisit the instruction document |
| `The … verdict asks for a human decision (NEEDS_HUMAN)` | Contradictory acceptance criteria or a wrong premise. Read the options in the latest verdict comment, fix the instruction document and post a new INSTRUCTION, then resume with `make impl` (planning stage) or `make review` (implementation stage). It is a halt, so the exit code is 0 |

### Reading the cost

Costs are **appended** to `tmp/cost-issue<N>.txt`. The `# <date time> <phase>` header lines show where runs switched.

```
# 2026-09-18 20:02:19 spec
2.8436212500000004
# 2026-09-18 20:33:53 impl
0.91197435
...
```

The "cumulative cost" in notifications is the sum of this file. **It is appended
so that splitting one cycle into `make impl` → `make review` does not erase the first half's record.**

### When you cannot tell why a phase failed

`claude`'s transcripts remain in `~/.claude/projects/<slug of the repository path>/*.jsonl`.
Reading the end shows what the agent tried and what was denied. **No cost.**

### Permission denial warnings

```
Warning: 3 disallowed tool call(s) were denied.
  denied: Bash - cd pkg && npm test
```

**A denial is not necessarily a failure.** The agent may work around it and finish, so it does not stop;
it is printed so a human notices. **Add only the ones that recur** to `allow` in `.ai-flow/permissions.json`
(while respecting "Allows that must never be granted" in §6).

Denials of compound commands like the example above come from **insufficient guidance in `prompts/_rules.md`, not from permissions.**

---

## 9. Installation checklist

What to check and adapt for your repository.

### Must do

- [ ] **`.env`** in the flow directory: notifications if you want them (`SLACK_WEBHOOK_URL`, or `NOTIFY_CMD` and `NOTIFY_SECRET_VARS`; §2)
- [ ] **Environment variables** for the strong and fast model IDs (defaults read `CLAUDE_CODE_OPUS_MODEL` /
      `CLAUDE_CODE_SONNET_MODEL`; put them in `.zshenv` or `.env`, not `.zshrc`)
- [ ] **`.ai-flow/config.mk`** — `BASE_BRANCH`, tests (`TEST_CMD` / `SCRATCH_TEST_CMD`),
      formatting (`FORMAT_CHECK_CMD` / `FORMAT_FILE_CMD` / `FORMAT_FIX_CMD` / `FORMAT_GLOBS`), `OUTPUT_LANG`.
      `FORMAT_FILE_CMD` must **exit 0 when the file is formatted**. For tools that answer through their output, such as `gofmt -l`,
      write a wrapper that answers with the exit code. **It must not format** (check only). If the check itself fails, the flow stops.
      **If your project has no formatter, leave all four `FORMAT_*` values empty**: the formatting steps disappear from the prompts and the per-file check is skipped
- [ ] **Commands run from the flow directory** — the agents use the flow directory (e.g. `ai-flow/`) as the current directory,
      so every command in `config.mk` must work from there. `npm test` / `npm run …` find the root `package.json` by themselves;
      for other tools, give paths relative to the flow directory (e.g. `python3 -m unittest discover -s ../tests`)
- [ ] **No tests?** Leave `TEST_CMD` and `SCRATCH_TEST_CMD` both empty. The plan then maps each acceptance criterion to a verification
      command (or a `manual` check with steps) instead of a test, implement runs those commands, and the judges re-run them.
      The verdict design does not change: it is still decided only by acceptance criteria numbers.
      **Allow the commands you expect to verify with** (your build, a script that renders the docs, ...) in `.ai-flow/permissions.json`
- [ ] **`TEST_CMD`** — **if your test tool caches results, add the flag that disables it** (Go `-count=1`, Gradle `--rerun-tasks`,
      Turborepo `--force`, Nx `--skip-nx-cache`, Bazel `--nocache_test_results`).
      The judges re-run the tests to verify claims, so a replayed earlier success defeats them.
      pytest and Jest do not replay results, so nothing is needed for them
- [ ] **Secret files other than `.env`** — every `.env` is already denied. If your project keeps secrets in other files, add them to `deny`
      in `.ai-flow/permissions.json` as `Read(//**/<path>)` (e.g. `Read(//**/config/secrets.yml)`); a relative path would only match under the flow directory
- [ ] **`.ai-flow/permissions.json`** — allows for build, test, and format commands.
      **Also add the absolute-path forms** found with `which` (agents sometimes call commands by absolute path)
- [ ] **`.ai-flow/context.md`** — documents to read (conventions, README, …), documents to update,
      pitfalls specific to your project's commands. It goes into every phase's prompt (the end of `_rules.md`)
- [ ] **`.ai-flow/user-flows.md`** — the normal usage `pr-review` uses to look for "different results than before" in Claim 3
- [ ] **`.ai-flow/project-words.txt`** — your project's words that must not appear in the shared part (your language's and tools' command names,
      product names, main file names). It works without it, but you would not notice project specifics creeping into the shared part
- [ ] **Branch naming** — `create_pr` in `scripts/run-phase.sh` requires `feature/*`, and `prompts/pr.md` creates `feature/issue-<n>-…`.
      If you need a different convention, change both upstream (changing only one makes PR creation abort after the agent has committed)

### Fill in over time

- [ ] **`.ai-flow/risk-catalog.md` (incident catalog)** — with only generic items,
      `RESIDUAL_RISK` only ever says "nothing in particular". Add to it when incidents happen in your repository

### The first cycle

A **small one-file fix** is a good first Issue. What to look at is not the quality of the implementation but these three:

1. Whether `make spec` produces an **instruction document**. If it keeps returning questions, adjust how Issues are written
2. Whether `make impl` gets through plan judging in **1–2 rounds**. Stopping at 3 means the acceptance criteria are vague
3. Whether **recurring commands** show up in the permission denial warnings

**One cycle tells you which allows to add.** Adding them from the denial warnings is faster than aiming for perfection up front,
and does not grant anything unnecessary.

---

## 10. Design that must not change

Things that tend to get cut because "it looks easy", and that **silently** stop working when cut.

| Design | What happens if it is cut |
|---|---|
| **Only one human gate, after spec** | More gates dilute the point of automation; fewer let implementation start before the specification is settled |
| **The instruction tag is searched with a line-start anchor (`'^<!-- AI-TAG: INSTRUCTION -->'`)** | With a partial match, a human comment saying "there is no instruction (AI-TAG: INSTRUCTION)" or a comment discussing this flow passes the gate. **This very sentence has that shape.** `check-scripts.sh` checks that both sides (prompt and shell) agree |
| **Verdicts are decided only by acceptance criteria numbers** | Mixing in impressions keeps three rounds from converging |
| **If it does not converge, stop and hand it to a human** | Carrying on automatically turns review into a formality |
| **`RESIDUAL_RISK` / `CODE_REVIEW` / `DEVILS_ADVOCATE` do not affect verdicts** | If they could overturn an approval, the writers would hold back |
| **`push` and `gh pr` are not given to the agents** | Blocking dangerous push forms by enumerating permission rules leaks |
| **The working tree is checked after each step** | `Write` / `Edit` cannot be restricted by path, so this is the only safeguard |
| **git output paths are read with `-z`** (`worktree_paths` and `create_pr` in `run-phase.sh`) | Plain `--porcelain` / `--name-only` quote paths containing non-ASCII characters or spaces as `"…"`, so they do not match `^` in `TOOLING_PATHS`. Modified tooling files and tooling mixed into project commits **pass silently** |
| **A failing notification only warns** (`notify()` in `run-phase.sh`) | If it stopped the flow, a flaky webhook would throw away a finished implementation or review |
| **Agents format; the shell only checks** | If the shell rewrote the diff, what the reviewer read and the actual diff would differ |
| **A failing formatting check stops the flow** (`format_ok()` is false on failure) | Judging only by empty output makes a missing formatter or a syntax error that prints nothing count as "formatted", and **everything passes silently** |
| **The cost log is appended** | Truncating on each start erases the first half of `make impl` → `make review`, and the notified total comes out lower than reality |
| **The notification secrets (`NOTIFY_SECRET_VARS`) are removed with `env -u`, and one list drives both export and removal** | The `Makefile` exports them for `NOTIFY_CMD`, so otherwise `echo` could read them and the `Read(./.env)` deny would be pointless. Two separate lists would drift: a secret exported but not removed reaches the agents silently |
| **Variables in error messages are written `${x}`** | bash 3.2 takes the first byte of a non-ASCII character into the variable name. **It happens inside error messages, so it only breaks when something fails** (`check-scripts.sh` checks statically) |
| **Permission files are not named `settings.json`** | When the workspace is not trusted, `permissions.allow` is silently ignored, and `deny` binds the human's interactive sessions too |
| **`grep` / `cat` / `sed` / `cp` / `git -C` are not allowed** | `grep` / `cat` / `sed` / `cp` can read files and get around the `Read(./.env)` deny; `git -C` shifts the prefix match and gets around the `git push` deny |
| **The flow lives in a subdirectory, and its whole directory is tooling** | At the root, the flow's files and the project's files of the same name cannot be told apart. Listing tooling files by name leaks whatever is added to the flow later (README, examples) |
| **Phase prompts are rendered by the shell and passed to `claude -p`; they are not Claude Code skills** | The flow is deterministic on purpose: the same settings always produce the same prompt text, unfilled placeholders and conditional blocks fail before any cost, and the human gate, the tooling check, and push / PR creation are enforced by the shell. Skills are loaded at the model's discretion from static Markdown, so moving the phases into skills would give up render-time validation and guaranteed loading, and a skill invoked from an interactive session would bypass every check in `run-phase.sh`. Helpers for the human steps outside the pipeline (drafting an Issue, reading why a phase stopped) could be skills; the phases themselves should not |
