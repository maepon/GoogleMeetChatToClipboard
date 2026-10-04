#!/bin/bash
# Fills the placeholders in prompts and prints the result. Called by claude-run.sh.
# Usage: ./scripts/render-prompt.sh <file>... (several files are joined with one blank line between them)
#
# Two kinds of things are filled in.
#   - Values  {{ISSUE}} and the like, replaced with the environment variable of the same name. The list is VALUE_KEYS below
#   - Files   a line consisting only of {{PROJECT_CONTEXT}} or the like is replaced with the contents of a project settings
#             file (.ai-flow/). The list is INCLUDES below. Value placeholders inside the contents are filled too (no nesting of files)
#
# sed substitution is not used: & in the replacement means the whole match, so a value containing & would break it
# (e.g. TEST_CMD = npm test && ...). The | delimiter has the same problem. bash's ${var//...} gives & a special meaning
# from bash 5.2 on too. awk's index / substr replace the text literally.
#
# Conditional blocks are handled as well. From a line consisting only of {{#if NAME}} to a line {{/if}}: if the value of NAME
# (one of VALUE_KEYS) is empty, the whole block is removed; otherwise only the two marker lines are removed. This drops the
# formatting steps from the prompts in projects without a formatter (empty FORMAT_*). Nesting and blocks spanning files are rejected.
# {{#unless NAME}} ... {{/unless}} is the opposite: the block is kept only when the value is empty. Projects without tests
# (empty TEST_CMD) use it to get verification-command wording in place of test wording.
#
# A placeholder with an empty value, or a {{...}} left over after filling, stops before claude starts (before any cost).
# Placeholders inside a removed block are not filled, so an empty value there does not stop it.
set -uo pipefail

VALUE_KEYS="FLOW_DIR ROOT_REL ISSUE VERDICT_FILE COMMENT_FILE PR_TITLE_FILE PR_BODY_FILE BASE_BRANCH TEST_CMD SCRATCH_TEST_CMD FORMAT_CHECK_CMD FORMAT_FILE_CMD FORMAT_FIX_CMD FORMAT_GLOBS OUTPUT_LANG"
INCLUDES="PROJECT_CONTEXT=context.md RISK_CATALOG=risk-catalog.md USER_FLOWS=user-flows.md"

[ $# -gt 0 ] || { echo "Error: render-prompt.sh: a file is required." >&2; exit 1; }
for f in "$@"; do
  [ -f "$f" ] || { echo "Error: render-prompt.sh: $f not found." >&2; exit 1; }
done

PROJECT_DIR="${AI_FLOW_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)/.ai-flow}"
export PROJECT_DIR VALUE_KEYS INCLUDES

out=$(LC_ALL=C awk '
  BEGIN {
    nkeys = split(ENVIRON["VALUE_KEYS"], keys, " ")
    for (i = 1; i <= nkeys; i++) iskey[keys[i]] = 1
    inblock = 0
    skip = 0
    n = split(ENVIRON["INCLUDES"], inc, " ")
    for (i = 1; i <= n; i++) {
      eq = index(inc[i], "=")
      incfile["{{" substr(inc[i], 1, eq - 1) "}}"] = ENVIRON["PROJECT_DIR"] "/" substr(inc[i], eq + 1)
    }
    err = 0
  }
  # Replace from left to right and never look at a replaced value again (a {{...}} inside a value is not expanded)
  function fill(line,    i, ph, val, p, done) {
    for (i = 1; i <= nkeys; i++) {
      ph = "{{" keys[i] "}}"
      if (index(line, ph) == 0) continue
      val = ENVIRON[keys[i]]
      if (val == "") {
        printf "Error: render-prompt.sh: %s is empty (used in %s).\n", keys[i], FILENAME > "/dev/stderr"
        err = 1
      }
      done = ""
      while ((p = index(line, ph)) > 0) {
        done = done substr(line, 1, p - 1) val
        line = substr(line, p + length(ph))
      }
      line = done line
    }
    return line
  }
  FNR == 1 && NR != 1 {
    if (inblock) {
      printf "Error: render-prompt.sh: {{#%s %s}} is not closed (%s).\n", blockkind, blockkey, prevfile > "/dev/stderr"
      err = 1
      inblock = 0
      skip = 0
    }
    print ""
  }
  { prevfile = FILENAME }
  /^\{\{#(if|unless) [A-Z_]+\}\}$/ {
    sp = index($0, " ")
    kind = substr($0, 4, sp - 4)
    name = substr($0, sp + 1, length($0) - sp - 2)
    if (inblock) {
      printf "Error: render-prompt.sh: conditional blocks cannot be nested ({{#%s %s}} in %s).\n", kind, name, FILENAME > "/dev/stderr"
      err = 1
    } else if (!(name in iskey)) {
      printf "Error: render-prompt.sh: the name in {{#%s %s}} is not a value placeholder (%s).\n", kind, name, FILENAME > "/dev/stderr"
      err = 1
    }
    inblock = 1
    blockkind = kind
    blockkey = name
    skip = (kind == "if") ? (ENVIRON[name] == "") : (ENVIRON[name] != "")
    next
  }
  /^\{\{\/(if|unless)\}\}$/ {
    kind = substr($0, 4, length($0) - 5)
    if (!inblock) {
      printf "Error: render-prompt.sh: {{/%s}} without a matching {{#%s ...}} (%s).\n", kind, kind, FILENAME > "/dev/stderr"
      err = 1
    } else if (kind != blockkind) {
      printf "Error: render-prompt.sh: {{/%s}} closes {{#%s %s}} (%s).\n", kind, blockkind, blockkey, FILENAME > "/dev/stderr"
      err = 1
    }
    inblock = 0
    skip = 0
    next
  }
  skip { next }
  $0 in incfile {
    f = incfile[$0]
    if ((getline l < f) <= 0) {
      printf "Error: render-prompt.sh: %s is unreadable or empty (used in %s).\n", f, FILENAME > "/dev/stderr"
      err = 1
      next
    }
    do { print fill(l) } while ((getline l < f) > 0)
    close(f)
    next
  }
  { print fill($0) }
  END {
    if (inblock) {
      printf "Error: render-prompt.sh: {{#%s %s}} is not closed (%s).\n", blockkind, blockkey, prevfile > "/dev/stderr"
      err = 1
    }
    exit err
  }
' "$@") || exit 1

left=$(printf '%s\n' "$out" | LC_ALL=C grep -oE '\{\{[A-Z_]+\}\}' | sort -u | tr '\n' ' ')
if [ -n "$left" ]; then
  echo "Error: render-prompt.sh: unfilled placeholders: ${left}" >&2
  exit 1
fi

printf '%s\n' "$out"
