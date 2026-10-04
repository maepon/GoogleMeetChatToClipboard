#!/bin/bash
# Signs the commits that `git subtree add/pull --squash` just created, without changing their content.
# Usage (in the host repository, right after `git subtree add` or `git subtree pull`):
#   <flow dir>/scripts/resign-subtree-merge.sh
#
# Why: `git subtree` creates the "Squashed '<prefix>/' ..." commit (and, for `add`, the merge commit) with
# `git commit-tree`, which never signs, and `git subtree` has no signing option. A repository that requires signed
# commits on its default branch then cannot merge the subtree PR, which must be merged with a merge commit to keep
# the subtree metadata (git-subtree-dir / git-subtree-split).
#
# How: HEAD must be the merge commit whose second parent is the squash commit. Both commits are recreated with
# `git commit-tree -S` using the same tree, parents (the squash commit's own parents; the merge's first parent and the
# new squash commit), message, and author. The new merge's tree is checked to be identical before HEAD is moved, so
# the content cannot change. The index and working tree are untouched.
#
# Not `git rebase --rebase-merges --gpg-sign`: rebase re-runs the merge instead of reusing its tree. After
# `git subtree add` that put the subtree's files at the repository root instead of under <prefix>/ (verified), and
# after `pull` it only works when git happens to guess the subtree shift.
#
# If both commits are already signed, nothing is done. Uses the signing setup of the repository (user.signingkey,
# gpg.format, ...), like `git commit -S`.
set -euo pipefail

die() { echo "Error: resign-subtree-merge.sh: $1" >&2; exit 1; }

git rev-parse --git-dir >/dev/null 2>&1 || die "run inside a git repository."
merge=$(git rev-parse --verify -q HEAD) || die "HEAD does not point to a commit."
squash=$(git rev-parse --verify -q "${merge}^2") || die "HEAD is not a merge commit. Run this right after git subtree add / pull."
git log -1 --format=%B "$squash" | grep -q '^git-subtree-dir: ' \
  || die "the second parent of HEAD is not a commit created by git subtree --squash."

signed() { [ "$(git log -1 --format=%G? "$1")" != "N" ]; }
if signed "$merge" && signed "$squash"; then
  echo "resign-subtree-merge.sh: both commits are already signed; nothing to do."
  exit 0
fi

# Recreate <commit> with the given parent options: same tree and author, the message read from standard input,
# signed, with the current user as committer.
recreate() {
  local commit="$1"
  shift
  GIT_AUTHOR_NAME="$(git log -1 --format=%an "$commit")" \
    GIT_AUTHOR_EMAIL="$(git log -1 --format=%ae "$commit")" \
    GIT_AUTHOR_DATE="$(git log -1 --format=%aI "$commit")" \
    git commit-tree -S "$@" -F - "${commit}^{tree}"
}

squash_parents=()
for p in $(git log -1 --format=%P "$squash"); do
  squash_parents+=(-p "$p")
done
new_squash=$(git log -1 --format=%B "$squash" | recreate "$squash" ${squash_parents[@]+"${squash_parents[@]}"}) \
  || die "could not sign the squash commit."

# The merge message of `git subtree add` names the squash commit ("Merge commit '<sha>' as '<prefix>'"); point it at the new one
new_merge=$(git log -1 --format=%B "$merge" | sed -e "s/${squash}/${new_squash}/g" \
  | recreate "$merge" -p "$(git rev-parse "${merge}^1")" -p "$new_squash") \
  || die "could not sign the merge commit."

[ "$(git rev-parse "${new_merge}^{tree}")" = "$(git rev-parse "${merge}^{tree}")" ] \
  || die "the recreated merge commit has a different tree; HEAD was not changed."

git update-ref -m "resign-subtree-merge" HEAD "$new_merge" "$merge"
echo "resign-subtree-merge.sh: signed the subtree commits."
echo "  squash: ${squash} -> ${new_squash}"
echo "  merge:  ${merge} -> ${new_merge}"
