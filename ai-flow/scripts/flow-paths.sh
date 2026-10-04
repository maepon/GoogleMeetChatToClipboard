#!/bin/bash
# Finds where the flow directory is. Sourced by run-phase.sh / claude-run.sh / check-scripts.sh / selftest.sh.
# Source it with the flow directory (where the Makefile is) as the current directory.
#
# The flow can live in a subdirectory of any name and depth (ai-flow/, tools/flow/, ...). Hard-coding the name
# would make TOOLING_PATHS let modifications to tooling files through once the name changes (a silent failure),
# so only the values found here are used.
#
#   FLOW_PREFIX     Path from the repository root to the flow directory, with a trailing /   e.g. ai-flow/  tools/flow/
#   FLOW_DIR        FLOW_PREFIX without the trailing /                                     e.g. ai-flow   tools/flow
#   ROOT_REL        Relative path from the flow directory to the root, with a trailing /   e.g. ../       ../../
#   FLOW_PREFIX_RE  FLOW_PREFIX escaped so that grep -E matches it literally
#                   (otherwise the . in tools/ai.flow/ matches any character)
#
# Placing the flow at the root (empty FLOW_PREFIX) is not supported: the flow's Makefile / scripts/ / docs/ could not be
# told apart from the project's files of the same name, and TOOLING_PATHS would treat project files as tooling.
# This file does not stop; it puts the reason in flow_paths_error so the caller can decide.

flow_paths_error=""
FLOW_PREFIX=$(git rev-parse --show-prefix 2>/dev/null) \
  || flow_paths_error="Run inside a git repository."
if [ -z "${flow_paths_error}" ] && [ -z "${FLOW_PREFIX}" ]; then
  flow_paths_error="The flow is at the repository root. Put it in a subdirectory (such as ai-flow/)."
fi
FLOW_DIR="${FLOW_PREFIX%/}"
ROOT_REL=$(printf '%s' "${FLOW_PREFIX}" | sed -e 's,[^/][^/]*/,../,g')
FLOW_PREFIX_RE=$(printf '%s' "${FLOW_PREFIX}" | sed -e 's/[][\.*^$+?(){}|]/\\&/g')
export FLOW_PREFIX FLOW_DIR ROOT_REL FLOW_PREFIX_RE
