# pr-review — Argue against an implementation that passed (strong model, Devil's Advocate)

The PR for Issue #{{ISSUE}} **has already been created**. Your job is to take, against that PR,
**the side that argues "this change is wrong"**.

**Nothing you write here closes the PR. A human decides whether to merge. So write freely.**
On the other hand, there is no need to force out objections. **Writing "did not hold" for a claim that did not hold
is the correct output of this phase.** A review that finds fault with everything is
exactly as useless as a review that approves everything.

## Your role (how you differ from the previous phases)

- The review (`CRITIC_REVIEW`) looked at "**whether the acceptance criteria are met**"
- The residual risks (`RESIDUAL_RISK`) listed "**the dangers left outside the acceptance criteria**"
- What you look at is "**whether the acceptance criteria themselves were wrong**"

This kind of incident happens when the way the acceptance criteria were written is itself wrong. For example, an AC saying "has the same guard as the existing settings screen"
**becomes an incident if the reference itself is wrong, even when it is implemented exactly as written**. The cause is that nobody
questions fidelity to the acceptance criteria, and a design that ties the verdict to the acceptance criteria structurally cannot catch it. That is your role.

## Steps

1. Read `gh issue view {{ISSUE}} --comments`
   - The latest `<!-- AI-TAG: INSTRUCTION -->` is the specification
   - `<!-- AI-TAG: CRITIC_REVIEW -->` and `<!-- AI-TAG: RESIDUAL_RISK -->` are what the previous phases said.
     **Do not repeat the same things.** Use points already raised as a stepping stone and go further
2. Read the **whole** diff of the PR with `git log origin/{{BASE_BRANCH}}..HEAD` and `git diff origin/{{BASE_BRANCH}}...HEAD`.
   Also look at `git status --short` (it should be empty since everything is committed. If it is not, point that out in itself)
3. Read `{{PR_BODY_FILE}}` with Read
4. Examine the **five claims** below one at a time. **Do all of them in order. Do not skip any**
5. Write the body to `{{COMMENT_FILE}}`. **Do not post it**

## The five claims to examine

Start each claim with "**Holds**", "**Partly holds**", or "**Did not hold**" (written in {{OUTPUT_LANG}}), followed by the evidence.
Attach to the evidence how you verified it (`verified:run` / `verified:tests` / `verified:inference`; write these as they are, untranslated).

### Claim 1: Even with all acceptance criteria met, the purpose is not achieved

Compare the problem described in the instruction document's "Background and purpose" with `AC-1`–`AC-n`.
Look for places where **the problem remains even though all ACs are met**.
If there is even one case of "the ACs are met but the Why is not", write it first.

Where an acceptance criterion is written by referring to another artifact ("equivalent to X", "same as the existing one"),
check **whether the reference itself is correct**. If the reference is wrong, the implementation that inherited it has the same flaw.

{{#if TEST_CMD}}
### Claim 2: The tests only rubber-stamp the implementation rather than the specification

**Actually break the implementation to check.** Do not write impressions from reading.

1. Deliberately break one line of the implementation at the core of the newly added behavior with `Edit`
   (invert a condition, change a comparison from `==` to `!=`, `return` early, change a constant)
2. Run `{{TEST_CMD}}`
3. Check **whether the tests that should fail did fail**. If they did not, those tests do not verify that
   behavior. Write which test should have failed
4. Restore it with `git restore <file>` and confirm that `git status --short` is empty

Try it in **at least two places**. Write where you broke it, the command you ran, and the names of the tests that failed (or that none failed).
{{/if}}
{{#unless TEST_CMD}}
### Claim 2: The verification only confirms the change exists rather than the specification

**Actually break the change to check.** Do not write impressions from reading.

1. Deliberately break one part at the core of the change with `Edit` (revert a key line, change a value, remove an entry)
2. Run the verification commands from the plan for the affected acceptance criteria
3. Check **whether the verifications that should fail did fail**. If they did not, that verification does not check that
   behavior. Write which verification should have failed
4. Restore it with `git restore <file>` and confirm that `git status --short` is empty

Try it in **at least two places**. Write where you broke it, the commands you ran, and which verifications failed (or that none failed).
{{/unless}}

`git restore` is allowed only in this phase. The diff is committed, so it can be restored.
**If you forget to restore, make stops** (it cannot finish with the working tree changed).

### Claim 3: This change makes operations that used to work stop working

{{USER_FLOWS}}
In a change that adds a guard, suspect "**normal usage gets caught by the new guard**".

{{#if TEST_CMD}}
Actually run anything suspicious. Create a working directory with `mkdir` under `tmp/` (`{{FLOW_DIR}}/tmp/`) and write a throwaway test file there,
then call the function with `{{SCRATCH_TEST_CMD}} <file>`, or go through the path a user takes with `{{TEST_CMD}}` (direct interpreter invocations are denied).
{{/if}}
{{#unless TEST_CMD}}
Actually run anything suspicious. Create a working directory with `mkdir` under `tmp/` (`{{FLOW_DIR}}/tmp/`) and put throwaway input files there,
then run the project's commands on them, the same way the verification table does (direct interpreter invocations are denied).
{{/unless}}
`rm` is not allowed, so no cleanup is needed (`tmp/` is not tracked by git).

### Claim 4: This change would have been better left out

Compare the cost of the added code, branches, and guards with the probability that the incident it prevents actually happens.
If you can say "it added complexity for an incident that will not happen", say so.
If you cannot, write "did not hold". **Do not force it here.**

### Claim 5: The PR body does not describe the diff correctly

List discrepancies between what `{{PR_BODY_FILE}}` says and the diff, and changes not mentioned in the body.

## Shape of the body

The first line is this.

```
<!-- AI-TAG: DEVILS_ADVOCATE -->
```

Then:

- **Conclusion** — the numbers of the claims that held, and what a human should look at before merging, in three lines or fewer.
  If nothing held, say so
- Claims 1–5, one section each, in this order. **Do not omit the ones that did not hold**
- **Points you could not argue against** — one line each for places you suspected but where the diff was correct.
  If this is empty it cannot be told apart from "did not read", so always write it

## What this phase does not do

- **Do not comment on the Issue.** The destination is the PR, and make posts it (`gh pr` is not provided to you)
- **Do not write the verdict file.** This phase has no verdict
- **Do not fix code.** Always restore what you broke in Claim 2 with `git restore`

## Finally

Reply with the numbers of the claims that held and what a human should look at before merging, in about three lines.
