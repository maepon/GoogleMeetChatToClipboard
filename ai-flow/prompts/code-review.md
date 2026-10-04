# code-review — Review the PR's code as code (strong model)

The PR for Issue #{{ISSUE}} **has already been created**. Your job is to read the diff of that PR
**as code** and report bugs, security risks, and gaps in error handling.

**You do not check whether the acceptance criteria (ACs) are met.** The previous phase (review-judge) has done that.
What you look at are the problems the acceptance criteria did not mention — places where the code is not correct as code.

**Nothing you write here closes the PR. A human decides whether to merge. So write freely.**
But if there are no problems, saying so is the correct output. There is no need to invent problems.

## Steps

1. Read the **whole** diff with `git log origin/{{BASE_BRANCH}}..HEAD` and `git diff origin/{{BASE_BRANCH}}...HEAD`
2. Also look at `git status --short` (it should be empty since everything is committed. If it is not, point that out in itself)
3. Read `{{PR_BODY_FILE}}` with Read (to grasp the intent of the change)
4. Check the **four aspects** below one by one
5. Write the body to `{{COMMENT_FILE}}`. **Do not post it**

## The four aspects

Start each aspect with "**Problems found**" or "**No problems**" (written in {{OUTPUT_LANG}}). If there are problems, follow with `file:line` and the evidence.
Attach to the evidence how you verified it (`verified:run` / `verified:inference`; write these as they are, untranslated).

### Aspect 1: Boundary conditions and type mix-ups that can become bugs

- Paths where integer overflow, out-of-range slice or array access, or a null / nil dereference can happen
- Implicit rounding or truncation in type conversions
- Off-by-one errors in loops and indexes

### Aspect 2: Swallowed or ignored errors

- An error is received but not used, or discarded (e.g. assigned to `_`)
- A design that cannot return an error, so a failure quietly looks like success

### Aspect 3: Security problems

- Path handling (building a path by string concatenation instead of the path-joining API, etc.)
- TOCTOU in file system operations (a window between the check and the operation that can be interrupted)
- Passing external input to a command or SQL without validation

### Aspect 4: Paths where normal input leads to an unexpected error

Read the code's logic and look for paths where a user's normal operation leads to an unexpected error or an infinite loop.
In a change that adds a guard, especially suspect "**normal usage gets caught by the new guard**".

{{#if TEST_CMD}}
To actually run something suspicious, write a throwaway test file under `tmp/` (`{{FLOW_DIR}}/tmp/`),
and call the function with `{{SCRATCH_TEST_CMD}} <file>`, or go through the path a user takes with `{{TEST_CMD}}` (direct interpreter invocations are denied).
{{/if}}
{{#unless TEST_CMD}}
To actually run something suspicious, put throwaway input files under `tmp/` (`{{FLOW_DIR}}/tmp/`),
and run the project's commands on them, the same way the plan's verification table does (direct interpreter invocations are denied).
{{/unless}}
`rm` is not allowed, so no cleanup is needed (`tmp/` is not tracked by git).

---

**The code is hard to read / I don't like the structure / there is another way to write it** — do not write these.
Only write findings for which you have evidence to say "it breaks", "it errors", or "it is a security problem".

## Shape of the body

The first line is this.

```
<!-- AI-TAG: CODE_REVIEW -->
```

Then:

- **Conclusion** — the numbers of the aspects with problems, and what a human should look at before merging, in three lines or fewer. If there are no problems, say so
- Aspects 1–4, one section each, in this order. **Do not omit the ones without problems**

## What this phase does not do

- **Do not comment on the Issue.** The destination is the PR, and make posts it (`gh pr` is not provided to you)
- **Do not write the verdict file.** This phase has no verdict
- **Do not fix code. Do not commit.** Only report the problems you find.
  If you finish with the working tree changed, make stops (Writing to `{{COMMENT_FILE}}` is the exception)

## Finally

Reply with the numbers of the aspects with problems and what a human should look at before merging, in about three lines.
If there are no problems, say so.
