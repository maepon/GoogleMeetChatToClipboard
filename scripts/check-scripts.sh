#!/bin/bash
# Static checks of the tooling files. Run before every make phase. Usage: ./scripts/check-scripts.sh
#
# The flow's fail / halt paths only run when a phase fails, so they can sit there written but never executed.
# That is exactly what happened in the Go repository this flow was first written for: the cause was "variable expansion
# inside an error message". Function behavior that only shows when run is regression-tested in check 6 (scripts/selftest.sh).
# Only the kind of bug that breaks silently, and only shows up when something fails, is checked here.
#
# The checks run on every use, so they only use commands that ship with macOS.
# The system grep is BSD grep without -P, so byte-level checks are done with awk.
set -uo pipefail

status=0
ng() { echo "NG: $1" >&2; status=1; }

# Where the flow directory is. If it is at the root, the remaining checks are meaningless, so stop here
. ./scripts/flow-paths.sh
[ -z "${flow_paths_error}" ] || { echo "NG: ${flow_paths_error}" >&2; exit 1; }

# 1. Shell syntax. It cannot see what only shows at run time, but typos fail here
for f in scripts/*.sh; do
  bash -n "${f}" 2>/dev/null || ng "${f}: bash -n fails."
done

# 2. A non-ASCII character right after a variable expansion (places that must be written ${x}).
#    The bash 3.2 that ships with macOS is not multibyte-aware when parsing variable names and takes the first byte
#    of the following character into the name. Together with set -u it fails with unbound variable.
#    It is not only full-width characters but any non-ASCII (é breaks too), so bytes are checked.
#    Positional parameters such as $1 end after one digit and are excluded.
offenders=$(LC_ALL=C awk '
  /\$[A-Za-z_][A-Za-z_0-9]*[\200-\377]/ { printf "  %s:%d: %s\n", FILENAME, FNR, $0 }
' scripts/*.sh Makefile)
if [ -n "${offenders}" ]; then
  ng "A non-ASCII character follows a variable expansion. bash 3.2 misreads the variable name; write \${x}:
${offenders}"
fi

# 3. Permission profiles. Broken JSON would only fail after a phase starts (after cost is incurred).
#    What actually reaches claude is the base plus the project's additions (.ai-flow/permissions.json).
#    Check after merging, so that adding a forbidden command through the additions fails too.
MERGED=$(mktemp) || { echo "NG: could not create a temporary file." >&2; exit 1; }
trap 'rm -f "${MERGED}"' EXIT
for base in .claude/*-permissions.json; do
  jq -e . "${base}" >/dev/null 2>&1 || { ng "${base}: not valid JSON."; continue; }
  ./scripts/merge-permissions.sh "${base}" > "${MERGED}" 2>/dev/null \
    || { ng "${base}: cannot merge the project's additions: $(./scripts/merge-permissions.sh "${base}" 2>&1 >/dev/null)"; continue; }
  p="${base} (after merging .ai-flow/permissions.json)"

  # Operations that must be blocked in every profile. A deny is a prefix match and beats an allow of the base command.
  # Commands that are not allowed are denied anyway, so this is a second line of defense.
  deny=$(jq -r '.permissions.deny[]' "${MERGED}")
  while IFS= read -r rule; do
    printf '%s\n' "${deny}" | LC_ALL=C grep -qxF "${rule}" \
      || ng "${p}: ${rule} is missing from deny."
  done <<'EOF'
Read(./.env)
Read(//**/.env)
Bash(git push)
Bash(git push:*)
Bash(gh pr:*)
Bash(rm:*)
Bash(git rebase:*)
Bash(git reset --hard:*)
EOF

  # Commands that must never be allowed.
  # General-purpose commands that can read files (grep / cat / sed / awk / head / cp) get around the Read(./.env) deny.
  # git -C / go -C shift the prefix match and get around the git push deny.
  # Shells and interpreters run anything in one command when bare, as one-liners (-c / -e / -p), or with nothing after -m.
  # Forms narrowed down to the module name, such as python -m pytest:*, pass.
  bad=$(jq -r '.permissions.allow[]' "${MERGED}" \
    | LC_ALL=C grep -E 'Bash\((grep|cat|sed|awk|head|tail|cp|mv|chmod|curl|ln|tee|xargs|find|git -C|go -C|bash|sh|zsh|env|eval|exec)[ :)]|Bash\((python3?|node|ruby|perl|deno|bun|npx)(:|\)| -[cepE][ :)]| -m[:)])|Bash\(git:|Bash\(gh:|Bash\(\*|Bash\(:' || true)
  if [ -n "${bad}" ]; then
    ng "${p}: allow contains commands that must never be allowed:
${bad}"
  fi
done

# 4. The tag that enforces the human gate matches what the prompt tells the agent to write.
#    require_instruction in run-phase.sh looks for this string at the start of a line to enforce the human gate after spec.
#    If a prompt edit makes the tag names drift apart, the gate falls on the "never passes" side rather than
#    "always fails" (noticeable, but it stops). Conversely, loosening only require_instruction silently disables the gate.
LC_ALL=C grep -qF '<!-- AI-TAG: INSTRUCTION -->' prompts/spec.md \
  || ng "prompts/spec.md does not make the agent write <!-- AI-TAG: INSTRUCTION -->. It is the tag require_instruction in run-phase.sh looks for."
LC_ALL=C grep -qF "'^<!-- AI-TAG: INSTRUCTION -->'" scripts/run-phase.sh \
  || ng "require_instruction in scripts/run-phase.sh does not search for the instruction tag with a line-start anchor. A mention in a comment body would then pass the gate."

# 4b. Verdict words. handle_verdict in run-phase.sh handles every word the judge prompts make the agent write.
#     Adding a word only to a prompt stops with fail (unexpected verdict); removing one only from handle_verdict
#     makes NEEDS_HUMAN "unexpected" and the immediate halt stops working.
for word in APPROVED CHANGES_REQUESTED NEEDS_HUMAN; do
  for p in prompts/plan-judge.md prompts/review-judge.md; do
    LC_ALL=C grep -qF "verdict=${word} -->" "${p}" \
      || ng "${p} does not make the agent write the verdict tag verdict=${word}."
  done
  LC_ALL=C grep -qE "^    ${word}\)" scripts/run-phase.sh \
    || ng "handle_verdict in scripts/run-phase.sh does not handle ${word}."
done

# 5. Hard-coded base branches. The PR base is decided only by BASE_BRANCH.
#    If one hard-coded name remains, that spot keeps looking at the old branch when BASE_BRANCH changes.
#    In create_pr's mixing check that would swallow the git diff error and let things through (a silent failure).
#    The variable (${BASE_BRANCH}) and placeholder ({{BASE_BRANCH}}) forms do not start with an alphanumeric, so they do not match.
offenders=$(LC_ALL=C grep -nE 'origin/[A-Za-z0-9_]|--base +[A-Za-z0-9_]' scripts/*.sh prompts/*.md || true)
if [ -n "${offenders}" ]; then
  ng "A base branch is hard-coded. Use \${BASE_BRANCH} or {{BASE_BRANCH}} (the value is BASE_BRANCH in .ai-flow/config.mk):
${offenders}"
fi

# 5b. Rendering the prompts. Fill them the same way claude-run.sh does (each prompt + _rules.md) and look for
#     unfilled placeholders, empty settings, or unreadable project settings files.
#     If this does not fail here, the phase would stop after starting (in the middle of a step).
#     The values are the project settings make exported (.ai-flow/config.mk). Running it without make fails for lack of settings
for prompt in prompts/*.md; do
  [ "${prompt}" = prompts/_rules.md ] && continue
  err=$(ISSUE=0 VERDICT_FILE=./tmp/verdict-check.txt COMMENT_FILE=./tmp/check.md \
    PR_TITLE_FILE=./tmp/pr-title-check.txt PR_BODY_FILE=./tmp/pr-body-check.md BASE_BRANCH="${BASE_BRANCH:-}" \
    ./scripts/render-prompt.sh "${prompt}" prompts/_rules.md 2>&1 >/dev/null) \
    || ng "${prompt}: cannot render the prompt (is make check loading the project settings?):
${err}"
done

# 7. Project words in the shared part. The shared part is brought into other projects with subtree, so writing one
#    project's circumstances there gives the agents wrong instructions in other projects.
#    The words are kept on the project side in .ai-flow/project-words.txt (so wherever it is installed, the check uses that project's words).
#    Only what reaches the agents is checked (prompts and permission profiles, including comment keys).
#    scripts/ is not checked: its comments explain history, and selftest uses stubs. That scripts/ does not depend on the
#    directory name or the project is verified by selftest.sh, which runs them from directories with other names.
#    The flow directory's own name hard-coded in a prompt also fails (use {{FLOW_DIR}}).
WORDS="${AI_FLOW_PROJECT_DIR:-$(git rev-parse --show-toplevel)/.ai-flow}/project-words.txt"
if [ -f "${WORDS}" ]; then
  while IFS= read -r word; do
    case "${word}" in ""|"#"*) continue ;; esac
    offenders=$(LC_ALL=C grep -nwiF -e "${word}" prompts/*.md .claude/*-permissions.json || true)
    [ -z "${offenders}" ] || ng "The project word \"${word}\" appears in the shared part (${WORDS}). Put project words in .ai-flow/:
${offenders}"
  done < "${WORDS}"
fi
offenders=$(LC_ALL=C grep -nE "(^|[^.A-Za-z0-9_-])${FLOW_PREFIX_RE}" prompts/*.md || true)
[ -z "${offenders}" ] || ng "A prompt hard-codes the flow directory name (${FLOW_PREFIX}). Use {{FLOW_DIR}}:
${offenders}"

# 6. Regression tests for run-phase.sh functions (bugs that static checks cannot see and only show when run).
#    gh / npx are replaced with stubs, so no cost and no network. Takes a few seconds
./scripts/selftest.sh || ng "The regression tests in scripts/selftest.sh failed (see the NG lines above)."

[ "${status}" -eq 0 ] && echo "check: static checks of the tooling files passed."
exit "${status}"
