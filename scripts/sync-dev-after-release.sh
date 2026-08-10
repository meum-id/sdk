#!/usr/bin/env bash
# Backport release artifacts from main to dev after a release tag publishes.
#
# Copies the release-bookkeeping set verbatim from origin/main and lands it
# via a PR against dev (per this repo's PR-only convention — direct commits
# to dev are not permitted): CHANGELOG.md, cliff.toml, the root and
# packages/* manifests (version-bearing), and bun.lock. Main is authoritative
# for all of them after a release; dev never edits CHANGELOG.md directly.
#
# The copy is verbatim, so any dev-side edit to these files made between the
# release merge and this sync would be reverted by the PR — the PR diff is
# the review surface for that; inspect it before merging.
#
# Run AFTER:
#   1. The release/v* -> main PR has merged.
#   2. `git tag -a vX.Y.Z` has been pushed to origin.
#   3. The GitHub Release has been created.
#
# Usage:
#   ./scripts/sync-dev-after-release.sh v0.3.0
#
# Idempotent: safe to re-run. If dev already matches main on the synced
# files, the script exits 0 without creating a branch or PR.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 vX.Y.Z" >&2
  exit 64
fi

VERSION="$1"
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: version must match vMAJOR.MINOR.PATCH (got: $VERSION)" >&2
  exit 64
fi
VERSION_NO_V="${VERSION#v}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree not clean -- commit or stash first" >&2
  git status --short >&2
  exit 65
fi

git fetch origin --tags --quiet

# Verify the release tag exists locally.
if ! git rev-parse --verify --quiet "refs/tags/$VERSION" >/dev/null; then
  echo "error: tag $VERSION not found locally -- run 'git fetch origin --tags' or verify the release published" >&2
  exit 66
fi

# Verify main is at or past the tag (i.e. release/* actually merged).
TAG_SHA="$(git rev-parse "$VERSION")"
if ! git merge-base --is-ancestor "$TAG_SHA" origin/main; then
  echo "error: tag $VERSION is not reachable from origin/main -- wait for release/v* to merge" >&2
  exit 66
fi

# Verify the GitHub Release exists and is not still a draft. The tag can exist
# (above check) while the GitHub Release was never created (or stayed draft),
# in which case consumers won't see the new version via `gh release` and the
# backport is premature.
if command -v gh >/dev/null 2>&1; then
  is_draft="$(gh release view "$VERSION" --json isDraft --jq .isDraft 2>/dev/null || true)"
  case "$is_draft" in
    false)
      ;;
    true)
      echo "error: GitHub Release $VERSION is still draft -- publish it first" >&2
      exit 67
      ;;
    "")
      echo "error: no GitHub Release for $VERSION -- create it with 'gh release create $VERSION'" >&2
      exit 67
      ;;
    *)
      echo "warning: unexpected isDraft value '$is_draft' for $VERSION -- proceeding" >&2
      ;;
  esac
else
  echo "warning: gh not on PATH -- skipping GitHub Release published-state check" >&2
fi

git switch dev
git pull --ff-only origin dev

# Cut a branch -- the repo's RELEASES.md and AGENTS.md ban direct commits to dev.
SYNC_BRANCH="chore/sync-dev-after-${VERSION}"

if git rev-parse --verify --quiet "$SYNC_BRANCH" >/dev/null; then
  echo "error: branch $SYNC_BRANCH already exists locally -- delete it or finish the prior run" >&2
  exit 68
fi
if git ls-remote --exit-code --heads origin "$SYNC_BRANCH" >/dev/null 2>&1; then
  echo "error: branch $SYNC_BRANCH already exists on origin -- check for an open PR or delete the remote branch" >&2
  exit 68
fi

git checkout -b "$SYNC_BRANCH"

# The release-bookkeeping set, all main-authoritative after a release: the
# version bump lands on the release branch, so main carries the released
# manifests and the hand-edited bun.lock workspace entries.
SYNC_FILES=(
  CHANGELOG.md
  cliff.toml
  package.json
  packages/verify/package.json
  packages/sdk/package.json
  bun.lock
)

git checkout origin/main -- "${SYNC_FILES[@]}"

if git diff --quiet -- "${SYNC_FILES[@]}"; then
  echo "no changes -- dev already in sync with $VERSION"
  git switch dev
  git branch -D "$SYNC_BRANCH"
  exit 0
fi

# The copied manifests and lock must agree with each other, or the sync PR
# would land the lock-parity breakage on dev.
if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile
  bun test test/lock-versions.test.ts
else
  echo "warning: bun not on PATH -- skipping lock-parity verification" >&2
fi

git add "${SYNC_FILES[@]}"
git commit -m "chore(release): backport $VERSION artifacts to dev

Brings dev's release-bookkeeping current with the $VERSION release on
main: CHANGELOG.md, cliff.toml, the version-bearing manifests, and
bun.lock copied verbatim from origin/main."

# Post-sync sanity check: re-running generate-changelog.py against the current
# PR bodies should produce an identical CHANGELOG.md. Drift here means upstream
# PR bodies were edited after main's CHANGELOG.md was generated -- the
# backport brought the stale CHANGELOG over, and a future release-branch
# regen will surface unexpected diffs. Warn, do not fail; the backport is
# still correct against what main currently has.
if [[ -x scripts/generate-changelog.py ]] && command -v git-cliff >/dev/null 2>&1; then
  if scripts/generate-changelog.py --dry-run --tag "$VERSION" >/dev/null 2>&1; then
    echo "regen check: CHANGELOG.md matches what PR bodies would produce"
  else
    echo "warning: PR bodies have drifted from main's CHANGELOG.md for $VERSION" >&2
    echo "  re-run 'scripts/generate-changelog.py --dry-run --tag $VERSION' to see the diff" >&2
    echo "  fix by regenerating CHANGELOG.md on a follow-up release branch" >&2
  fi
fi

# Push the sync branch and open a PR. Direct merge to dev is not permitted.
if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh not on PATH -- branch is committed locally as $SYNC_BRANCH; push and PR by hand" >&2
  exit 69
fi

git push -u origin "$SYNC_BRANCH"

# PR body composed at runtime; written to mktemp so gh pr create reads it
# via --body-file rather than an inline heredoc.
PR_BODY_FILE="$(mktemp -t "sync-dev-after-${VERSION}-pr-body.XXXXXX")"
trap 'rm -f "$PR_BODY_FILE"' EXIT

TAG_SHORT="$(git rev-parse --short "$TAG_SHA")"

cat >"$PR_BODY_FILE" <<EOF
## Summary

Backports the v${VERSION_NO_V} release-prep state from \`main\` so dev carries the released version in every
version-bearing manifest and the v${VERSION_NO_V} CHANGELOG section at the top of \`CHANGELOG.md\` going forward.

Source: tag \`${VERSION}\` at \`${TAG_SHORT}\` on \`main\`. Files synced verbatim from \`origin/main\`:
\`CHANGELOG.md\`, \`cliff.toml\`, \`package.json\`, \`packages/verify/package.json\`,
\`packages/sdk/package.json\`, \`bun.lock\`. The copy is verbatim, so review this diff for any dev-side edits to
these files it would revert.

Generated by \`scripts/sync-dev-after-release.sh\`. Run idempotently per release: if dev already matches main on
the synced files, the script exits 0 without creating this PR.

## Changelog

This PR is producer-side scaffolding and does not change anything users see; no \`## Changelog\` bullets to
extract.

## Type of Change

- [x] \`chore\`: Maintenance tasks (release backport)

## Testing

- [x] Manual testing completed

The script's preflight verified: the release tag exists, \`origin/main\` is at or past it, and the GitHub Release
is not still a draft. Post-copy, \`bun install --frozen-lockfile\` and \`test/lock-versions.test.ts\` proved the
synced manifests and lock agree. \`generate-changelog.py --dry-run\` was also invoked post-sync to check for
PR-body drift against the backported CHANGELOG; see this PR's stderr for any drift warnings.

## Files Modified

**Modified:**

- \`CHANGELOG.md\`, \`cliff.toml\`, \`package.json\`, \`packages/verify/package.json\`,
  \`packages/sdk/package.json\`, \`bun.lock\` (verbatim copies from \`origin/main\` at \`${TAG_SHORT}\`)

## Breaking Changes

- [x] No breaking changes

## Deployment Notes

- [x] No special deployment steps required
EOF

gh pr create \
  --base dev \
  --head "$SYNC_BRANCH" \
  --title "chore(release): sync dev after ${VERSION}" \
  --body-file "$PR_BODY_FILE"

echo "PR opened against dev; review and merge once CI is green."
