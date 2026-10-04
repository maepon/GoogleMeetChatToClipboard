#!/bin/bash
# Adds the project's extra permissions to a permission profile (the base every project uses) and prints the result.
# Usage: ./scripts/merge-permissions.sh <base profile>
#
# The project's additions are the allow / deny lists in .ai-flow/permissions.json (both optional).
# claude-run.sh writes the result to a temporary file each time it starts claude and passes it with --settings.
# The merged result is not kept in ai-flow/tmp/ or elsewhere: an agent could rewrite it to widen the permissions of the
# next step (tmp/ is gitignored, so run-phase.sh's working tree check would not see it).
# The source of the additions (.ai-flow/) is protected by TOOLING_PATHS in run-phase.sh.
set -uo pipefail

BASE="${1:?a base permission profile is required}"
PROJECT_DIR="${AI_FLOW_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)/.ai-flow}"
EXTRA="${PROJECT_DIR}/permissions.json"

for f in "$BASE" "$EXTRA"; do
  [ -f "$f" ] || { echo "Error: merge-permissions.sh: $f not found." >&2; exit 1; }
  jq -e . "$f" >/dev/null 2>&1 || { echo "Error: merge-permissions.sh: $f is not valid JSON." >&2; exit 1; }
done

jq -s '
  .[0] as $base | .[1] as $extra
  | $base
  | .permissions.allow = (($base.permissions.allow // []) + ($extra.allow // []) | unique)
  | .permissions.deny = (($base.permissions.deny // []) + ($extra.deny // []) | unique)
' "$BASE" "$EXTRA"
