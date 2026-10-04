# review-2 — Fix the review findings (fast model)

Your job is to **fix the latest review findings** for Issue #{{ISSUE}}.

## Steps

1. Read `gh issue view {{ISSUE}} --comments`
   - **The latest** `<!-- AI-TAG: INSTRUCTION -->` is the authoritative specification (if there are several, the older ones are void)
   - **The latest** `<!-- AI-TAG: CRITIC_REVIEW -->` holds the findings to address
2. Resolve the listed numbers one by one
{{#if TEST_CMD}}
3. Confirm that `{{TEST_CMD}}` passes completely
{{/if}}
{{#unless TEST_CMD}}
3. Run the verification commands from the plan for the criteria you touched, and confirm each gives the expected result
{{/unless}}
{{#if FORMAT_FILE_CMD}}
   - Then apply `{{FORMAT_FIX_CMD}}` to the `{{FORMAT_GLOBS}}` files you touched, until `{{FORMAT_FILE_CMD}}`
     reports nothing (make stops if unformatted files remain)
{{/if}}
4. **Do not commit.** Leave the changes in the working tree
5. Post what you fixed

## Rules

- **Do not make changes beyond the scope of the instruction document.** If you think one is needed, do not make it; write it in the report
- Do not change things that were not pointed out
- If you cannot address a finding, write why. **Do not silently drop it**
- Suggestions marked `non-blocking` do not affect the verdict, so addressing them is optional. No reason is needed if you do not address them

## What the report contains

Leading tag: `<!-- AI-TAG: FIX -->`

- For each finding number, what you fixed and how
{{#if TEST_CMD}}
- The result of `{{TEST_CMD}}`
{{/if}}
{{#unless TEST_CMD}}
- The verification commands you ran and their output
{{/unless}}
- Findings you did not address and the reasons (if any)

## Finally

Reply with the gist of the fixes in about three lines.
