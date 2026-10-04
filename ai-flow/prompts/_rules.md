---

# Common rules (all phases)

## How to write shell commands

**One command per call, in its simple form.** Claude Code splits commands to check permissions,
so the following forms are **denied even when the command itself is allowed**. This applies to every command.

- `cd X && cmd` / `cmd1; cmd2` / `cmd1 && cmd2` — compound commands
- Control structures such as `for … do … done`
- `VAR=value cmd` prefix assignments, command substitution, pipes, heredocs
- `git -C <path>` — the `-C` form is not allowed
  (it is left out on purpose because `git -C` can get around the `git push` deny)

`cd` is allowed, and **the current directory persists across calls**.
Moving to the repository root (`{{ROOT_REL}}`) is denied, though, so stay in `{{FLOW_DIR}}/`
(the commands to use are in the "Working directory and commands" section below).

The exit code shows up in the result of the call, so there is no need to append `; echo "$?"`.

**Create test input files with the `Write` tool.** `cp` is not allowed
(`cp ./.env /tmp/x` would get around the `Read(./.env)` deny).
`mkdir` is allowed, so create a working directory under `tmp/` (`{{FLOW_DIR}}/tmp/`, not tracked by git) and Write files there.

## Posting a comment on the Issue

Always follow these steps.

1. Write the body to `{{COMMENT_FILE}}` with the Write tool
2. Run `gh issue comment {{ISSUE}} --body-file {{COMMENT_FILE}}` as a standalone command

## Verdict file

A phase that is asked for a verdict writes **only the single specified word** to `{{VERDICT_FILE}}` with the Write tool.
Do not add explanations or decoration. make reads this file to decide whether to proceed,
so anything other than the single word makes it stop and wait for a human.

## Working directory and commands

You are running with `{{FLOW_DIR}}/` as the current directory. `cd` to the root is denied.
Read project files by their path relative to the root (`{{ROOT_REL}}`).

{{#if FORMAT_CHECK_CMD}}
- Check formatting with `{{FORMAT_CHECK_CMD}}`. Do not use a command that only looks below the directory it runs in to check the whole repository
{{/if}}
{{#if TEST_CMD}}
- Run the tests with `{{TEST_CMD}}`. To try a behavior in isolation, write a throwaway test file under `tmp/` and run `{{SCRATCH_TEST_CMD}} <file>`
{{/if}}
{{#unless TEST_CMD}}
- This project has no automated tests. Acceptance criteria are checked with the commands in the plan's verification table.
  To try something in isolation, put throwaway input files under `tmp/` and run the project's commands on them
{{/unless}}
- Search for strings with `git grep -n "<pattern>" -- ':/'`. Without `':/'` it only searches below `{{FLOW_DIR}}/`.
  The output paths are relative to `{{FLOW_DIR}}/` (`{{ROOT_REL}}docs/...`)
- `grep` / `cat` / `ls` / `find` and the like are not provided. If one is denied, use the means above or `Read` / `Glob` instead

## Project rules

- Write human-facing output (Issue comments, commit messages, PR titles and bodies, and your final reply, which make shows in the terminal and in notifications) in {{OUTPUT_LANG}}
- Do not modify the tooling files (everything under `{{FLOW_DIR}}/` except your own working files in `{{FLOW_DIR}}/tmp/`, plus `.ai-flow/` and `.gitignore` at the root)
- Do not send notifications yourself. make sends them

## Project context

{{PROJECT_CONTEXT}}
