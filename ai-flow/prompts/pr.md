# review-3 — Commit the approved implementation and prepare the PR material (strong model)

Your job is to **commit the approved implementation of Issue #{{ISSUE}} and prepare the material for the PR**.
You do not change code.

`git push` and `gh pr create` are not allowed for you. make runs them after
checking your commits. Your part ends at preparing the branch, the commits, and the PR body.

## Steps

1. Grasp the instruction document and the final implementation with `gh issue view {{ISSUE}} --comments`
2. Check the changes with `git status --short`
3. Create a branch

   ```
   git switch -c feature/issue-{{ISSUE}}-<short summary in lowercase letters and hyphens>
   ```

4. Stage **only the changes for this Issue**

   **Never include** the tooling files (everything under `{{FLOW_DIR}}/`, plus `.ai-flow/` and `.gitignore` at the root).
   The rule is that changes for the Issue and changes to the tooling go into separate commits, and humans bring in the tooling
   through separate PRs. If they are mixed in, do not stage them; say so in your reply
   (make runs the same check, so including them stops it there)

5. Commit
   - Write the message in {{OUTPUT_LANG}}
   - The subject summarizes the change. The body explains **why it was done that way**. What was done can be seen from the diff
   - End with `Refs #{{ISSUE}}` and `Co-Authored-By: Claude <noreply@anthropic.com>`
6. Write the PR title to `{{PR_TITLE_FILE}}` with the Write tool
   - **A single line in {{OUTPUT_LANG}}.** Do not decorate it with line breaks or quotes
7. Write the PR body to `{{PR_BODY_FILE}}` with the Write tool

## What the PR body contains

- `Closes #{{ISSUE}}` at the top
- **Changes** — if usage changes, before / after command examples
- **Why** — what the problem was
{{#if TEST_CMD}}
- **How each acceptance criterion is met** — `AC-n` / the test that verifies it
{{/if}}
{{#unless TEST_CMD}}
- **How each acceptance criterion is met** — `AC-n` / the verification (command or `manual`) and its result
{{/unless}}
- **Points raised in review but not addressed** — honestly list the `non-blocking` items that were not addressed.
  If none, write "none". So the reviewer can judge
- **Residual risks** — if there is a `<!-- AI-TAG: RESIDUAL_RISK -->` comment, summarize from it the `AC-n`
  passed with `verified:inference` and the incident catalog items marked `unchecked`.
  If none, write "none". To show where a human should look before merging
- `🤖 Generated with [Claude Code](https://claude.com/claude-code)` at the end

## Finally

Reply with the name of the branch you created and the points the reviewer should look at closely, in about three lines.
