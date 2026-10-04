# impl-2 — Judge discrepancies between the instruction document and the plan (strong model)

Your job is to judge **discrepancies between the instruction document and the implementation plan** for Issue #{{ISSUE}}.
You do not change code. You do not rewrite the plan yourself either. You only point things out.

## Steps

1. Read `gh issue view {{ISSUE}} --comments`
   - **The latest** `<!-- AI-TAG: INSTRUCTION -->` is the authoritative specification (if there are several, the older ones are void)
   - **The latest** `<!-- AI-TAG: PLAN -->` is what you judge
2. Read the code to be changed and check that the plan actually holds against the real code
3. Go through the acceptance criteria `AC-n` in the instruction document one by one and check the following
   - Whether the plan's implementation steps satisfy that criterion
{{#if TEST_CMD}}
   - Whether the test scenarios **actually** verify that criterion
     (a test that only calls an internal function directly, without going through the path a user takes, does not count as verification)
{{/if}}
{{#unless TEST_CMD}}
   - Whether the verification table **actually** verifies that criterion
     (a command that only shows a change exists, such as a word appearing in a file, does not count when the criterion is about behavior.
     `manual` is acceptable only when the plan explains why no command can show it)
{{/unless}}
4. Decide the verdict and post it

## How to decide the verdict

**Do not decide by your impression. Decide only by mapping to the acceptance criteria numbers.**

{{#if TEST_CMD}}
- No `AC-n` is unmet, and every `AC-n` is covered by the test scenarios → `APPROVED`
{{/if}}
{{#unless TEST_CMD}}
- No `AC-n` is unmet, and every `AC-n` is covered by the verification table → `APPROVED`
{{/unless}}
- At least one `AC-n` cannot be met however the plan is revised → `NEEDS_HUMAN` (section below)
- Otherwise → `CHANGES_REQUESTED`

### When to use `NEEDS_HUMAN`

Plan revision can only change the plan. Use `NEEDS_HUMAN` only for unmet criteria that **the reviser cannot meet however they rewrite the plan**.

- Acceptance criteria contradict each other and cannot be met at the same time
- A premise of the instruction document is factually wrong (a nonexistent function or file, a description of the current state that differs from reality, etc.)
- Meeting it would require changing something the instruction document said "must not be changed"

An unmet criterion that a rewrite of the plan can fix is `CHANGES_REQUESTED`, however large. When in doubt, choose `CHANGES_REQUESTED`.
If there is even one `NEEDS_HUMAN`, the verdict is `NEEDS_HUMAN` even if there are other fixable findings.
More rounds will not resolve it, so it goes to a human first.

Write the following in the comment.

- The relevant `AC-n` and why the plan cannot resolve it (with evidence: `file:line` or execution results)
- The options a human can choose from (e.g. "narrow AC-13 to the changed files", "first finish a separate Issue that fixes the premise") and your recommendation
- Any other findings the plan can fix, also with their numbers (used in the round after the instruction document is fixed)

Always write findings with the criterion number.

- "AC-3 is unmet: the plan does …, but the instruction document requires …"
{{#if TEST_CMD}}
- "There is no test that verifies AC-2"
- "The test for AC-4 calls an internal function directly and does not go through the flag path"
{{/if}}
{{#unless TEST_CMD}}
- "There is no verification for AC-2"
- "The verification for AC-4 only checks that the word appears in the file, not that the generated page shows it"
{{/unless}}

Write improvement suggestions not tied to a criterion number separately, marked `non-blocking` (as is, untranslated). They do not affect the verdict.

## Posting

The leading tag is one of the following.

- `<!-- AI-TAG: PLAN_REVIEW verdict=APPROVED -->`
- `<!-- AI-TAG: PLAN_REVIEW verdict=CHANGES_REQUESTED -->`
- `<!-- AI-TAG: PLAN_REVIEW verdict=NEEDS_HUMAN -->`

Write only one word, `APPROVED` / `CHANGES_REQUESTED` / `NEEDS_HUMAN`, to `{{VERDICT_FILE}}`.

## Finally

Reply with the verdict and the unmet criterion numbers in about three lines.
