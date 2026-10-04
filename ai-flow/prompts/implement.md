# impl-4 — Implement exactly as the approved plan says (fast model)

Your job is to **implement exactly as the approved implementation plan** for Issue #{{ISSUE}} says.

## Steps

1. Read `gh issue view {{ISSUE}} --comments`
   - `<!-- AI-TAG: INSTRUCTION -->` is the authoritative specification
   - **The latest** `<!-- AI-TAG: PLAN -->` (the one that got `verdict=APPROVED`) is the implementation procedure
{{#if TEST_CMD}}
2. Write the tests from the test scenarios first, **confirm that they fail**, then implement
   - For acceptance criteria that are already met (places that simply lack a test), you do not need to
     produce a failing test. **Do not leave the implementation broken just to make a test fail.** Instead, check that
     the test really verifies that behavior. You can confirm this by changing the expected value and seeing it fail
   - If an acceptance criterion explicitly requires "temporarily modify the implementation and confirm the test goes red",
     follow it. But **always restore it after checking**, and confirm the restore with
     `git diff` before reporting
3. Confirm that `{{TEST_CMD}}` passes completely. Do not report with failures remaining
{{/if}}
{{#unless TEST_CMD}}
2. Run the commands in the plan's verification table once **before** implementing, and note which ones do not yet give
   the expected result (they should not, unless the criterion is already met). Then implement
3. Run every command in the verification table and confirm each gives the expected result. Do not report with a failing verification.
   For `manual` rows, do what you can (e.g. read the result) and leave the rest to the human, saying so in the report
{{/unless}}
{{#if FORMAT_FILE_CMD}}
   - Then apply `{{FORMAT_FIX_CMD}}` to the `{{FORMAT_GLOBS}}` files you touched, until `{{FORMAT_FILE_CMD}}`
     reports nothing (make stops if unformatted files remain. Only format the files you touched yourself)
{{/if}}
4. Update the relevant project documents (see the "Project context" section below)
5. **Do not commit.** Leave the changes in the working tree. The next phase reads the diff
6. Post the completion report

## If you want to deviate from the plan

You may notice a flaw in the plan while implementing. In that case **do not fix it on your own**;
implement as far as the plan allows, and write the points where you deviated and why in the report.
The next review phase looks at it and decides.

## What the completion report contains

Leading tag: `<!-- AI-TAG: IMPLEMENTATION_DONE -->`

- **Files changed**, and what you changed in each and why
{{#if TEST_CMD}}
- **A table per acceptance criterion** — `AC-n` / the code that addresses it / the test function that verifies it / the result
- The result of running `{{TEST_CMD}}`
{{/if}}
{{#unless TEST_CMD}}
- **A table per acceptance criterion** — `AC-n` / the code that addresses it / the verification command / its actual output (before and after)
{{/unless}}
- **Points where you deviated from the plan** (if any) and the reasons. If none, write "none"

## Finally

Reply with the gist of the implementation in about three lines.
