# impl-3 — Revise the plan after the verdict (fast model)

Your job is to revise the implementation plan in response to **the latest verdict** on Issue #{{ISSUE}}.
You do not implement anything. You write neither code nor tests.

## Steps

1. Read `gh issue view {{ISSUE}} --comments`
   - `<!-- AI-TAG: INSTRUCTION -->` is the authoritative specification
   - **The latest** `<!-- AI-TAG: PLAN_REVIEW -->` holds the findings to address this time
   - **The latest** `<!-- AI-TAG: PLAN -->` is the version to revise
2. Resolve the listed criterion numbers one by one. Address every `AC-n` that was pointed out
3. Post the revised version

## Rules

- Post the **full text, not a diff**, with the leading tag `<!-- AI-TAG: PLAN -->`.
  The next verdict only looks at the latest PLAN, so a diff cannot be judged
- If you cannot address a finding, write why. **Do not silently drop it**
- Do not change things that were not pointed out. If you want to change something, state it explicitly with the reason

## Finally

Reply with how you addressed each criterion number in about three lines.
