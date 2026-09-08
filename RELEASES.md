# Releasing the `@meum` SDK

Operational runbook. Rationale lives in [`RELEASES-RATIONALE.md`](./RELEASES-RATIONALE.md). Pre-cut go/no-go checklist
lives in [`RELEASES-PREFLIGHT.md`](./RELEASES-PREFLIGHT.md). Post-tag verification lives in
[`RELEASES-POSTFLIGHT.md`](./RELEASES-POSTFLIGHT.md).

```text
feature branch -> PR to dev (squash merge)
              -> dev's tree overlaid onto a release/* branch cut from origin/main
              -> PR to main (squash merge)
              -> annotated vX.Y.Z tag push -> release.yml verifies -> publishes to npm -> creates the GitHub Release
```

Direct commits to `dev` or `main` are not permitted for shipped code: every change has a PR number in its squash commit
message. The dev-direct exception below covers engineering docs only.

## Branches

| Branch                                 | Role                                    | Lifetime                                    | Protection                           |
| -------------------------------------- | --------------------------------------- | ------------------------------------------- | ------------------------------------ |
| `main`                                 | Published. Only release commits.        | Forever.                                    | `.github/rulesets/protect-main.json` |
| `dev`                                  | Integration. All feature PRs land here. | Forever. Never delete.                      | `.github/rulesets/protect-dev.json`  |
| `feat/*`, `fix/*`, `chore/*`, `docs/*` | Feature work.                           | One PR's worth. Auto-deleted on merge.      | None. Squash into dev freely.        |
| `release/*`                            | Head of a dev -> main PR.               | One release's worth. Auto-deleted on merge. | None.                                |

Rationale: [`RELEASES-RATIONALE.md` § Branching model](./RELEASES-RATIONALE.md#branching-model).

## Daily development (feature -> dev)

```bash
git checkout dev && git pull
git checkout -b feat/short-description
# ... work ...
git push -u origin feat/short-description
gh pr create --base dev --title "feat(scope): what changed"
# CI passes -> squash-merge (PR_BODY becomes the dev commit message)
```

- **Commit style**: [Conventional Commits](https://www.conventionalcommits.org/).
- **PR body**: follow `.github/pull_request_template.md`. See [§ PR body](#pr-body).

### Dev-direct exception

Paths that live only on `dev` and never ship to `main` can be committed directly to `dev` without a feature branch or
PR. The `guard-main-docs` workflow blocks them from `main` PRs regardless. The exception applies to engineering docs:
`docs/brainstorms/`, `docs/ideation/`, `docs/plans/`, `docs/research/`, `docs/reviews/`, `docs/solutions/`, anything
under `.context/`, and the paths this repo registers as `extra_paths` in `.github/workflows/guard-main-docs.yml`
(`.agent/` and `.lighthouseci/` at any depth). `scripts/release/guarded-paths.sh` prints the full set as one regex.

The standard feature -> PR -> squash-merge flow remains required for everything else, including consumer-facing markdown
(README, AGENTS, CONTRIBUTING, CHANGELOG, in-repo runbooks) and all package source.

## PR body

Every PR (feature, fix, docs, release) uses `.github/pull_request_template.md` verbatim. No inventions:

- **No explainer prose anywhere in the body.** User-facing substance only.
- **Summary describes the net diff only**: what merged `main` looks like vs the base branch. Not commit history,
  intermediate state, or release-branch mechanics.
- **Zero verification artifacts in the body.** No diff stats, leak-check output, patch-id cherry-check counts, pre-push
  gate results, CI status, or prose-scrub findings. Anomalies get fixed before push, not audit-trailed.
- **Changelog** subsections (`### Breaking changes` / `### Added` / `### Changed` / `### Fixed` / `### Documentation`):
  1-5 bullets each, delete empty subsections, each bullet starts with a verb.
- **Type of Change**: one checkbox. Prefer `feat`/`fix` over `chore` for any user-observable change.
- **Related Issues/Stories**: four labels (`Story:` / `Issue:` / `Architecture:` / `Related PRs:`). All four required
  even when empty (`- None.` / `n/a`).
- **Files Modified**: four sub-headers (`Modified` / `Created` / `Renamed` / `Deleted`). All four required even when
  empty.
- **No AI attribution** in commits or PR bodies.
- **No hard line wraps**: one logical line per paragraph or bullet.

Rationale: [`RELEASES-RATIONALE.md` § PR body conventions](./RELEASES-RATIONALE.md#pr-body-conventions).

## Releasing dev to main

Before cutting a release branch, walk [`RELEASES-PREFLIGHT.md`](./RELEASES-PREFLIGHT.md) end-to-end. Any unchecked item
holds the release.

Engineering docs live on `dev` only. `guard-main-docs.yml` blocks them from reaching `main`,
`guard-main-provenance.yml` rejects any commit on a PR to `main` that did not come through a squash-merged PR to `dev`,
and `guard-release-branch.yml` rejects any PR to main whose head is not `release/*`.

**Branch naming**: `release/v<version>` or `release/v<version>-<slug>`. Where `generate-changelog.py` extracts the
version from the branch name, the `v<version>` prefix is required.

`main` and `dev` share only an ancient merge-base: every release squash-merges into `main`, so the two branches diverge
in history even as their content converges. Reconciling that with a merge, or a branch cut from `dev`, produces a pile
of rename/delete and lockfile conflicts that are artifacts of the lineage, not of the content shipping. The release
branch is therefore built as a **clean descendant of `main`** with `dev`'s tree overlaid on top, asserting the desired
end-state directly:

```bash
# 0. Nothing on main that dev never received (security PRs, hotfixes, config). Exits 1 while drift exists.
scripts/release/drift.sh

# 1. Branch from main, NOT dev.
git fetch origin
git checkout -B release/v<version> origin/main

# 2. Overlay dev's entire tracked tree onto the main base. `checkout -- .` writes dev's
#    paths but does not delete files that exist on main and are absent on dev, so remove
#    those next (the 'D' rows are main-only files dev deleted).
git checkout origin/dev -- .
git diff --name-status origin/main origin/dev | grep '^D'
trash <each main-only file listed above>

# 3. Strip the paths guard-main-docs forbids on main. The set resolves from the workflow;
#    never restate it inline, because every hand-kept copy drifted from what CI enforces.
GUARDED="$(scripts/release/guarded-paths.sh)"
git ls-files | grep -E "$GUARDED" | xargs -r trash
git add -A                                                      # stages adds, mods, AND deletions

# 4. Version bump (see § Version bump below), then the changelog from the PRs merged into
#    dev since the previous release. The overlay commit carries no per-PR history, so the
#    section is built from dev's PRs, not from this branch's commits.
scripts/generate-changelog.py --from-dev-prs
git add -A

# 5. Verify before committing.
#    A: staged tree equals dev's minus the version files and the stripped guarded paths.
#       Anything else printed here is a mistake.
git diff --cached --name-only origin/dev | grep -Ev "$GUARDED" \
  | grep -Ev '^(package\.json|packages/[^/]+/package\.json|bun\.lock|CHANGELOG\.md)$' \
  && echo "unexpected delta above; investigate" || echo "(clean: only intended deltas)"
#    B: no guarded path in the release tree.
git diff --cached --name-only origin/main | grep -E "$GUARDED" \
  && echo "LEAKED a guarded path: reset and redo" || echo "(no guarded paths)"
#    D: what this release ADDS to main. The leak check screens against the registered
#       set, so it is blind to a category nobody registered yet. Every docs/ entry and
#       every added markdown file needs a reason to ship, or it needs registering in the
#       workflow's extra_paths and removing from the branch.
git diff --cached --diff-filter=A --name-only origin/main | grep -E '(^docs/|\.md$)' | grep -Ev "$GUARDED" || echo "(none unguarded)"

# 6. Commit the overlay as one commit sitting directly on top of main (subject
#    `release: v<version>`, message authored in /tmp/), then run the preflight gates against it.
git commit --file /tmp/release-msg.md
scripts/release/preflight.sh all

# 7. Push and open the PR. Scrub body in /tmp/ first.
git push -u origin release/v<version>
gh pr create --base main --head release/v<version> --title "release: v<version>" --body-file /tmp/body.md
```

The result is a single commit whose diff against `main` is the release, with `main` as an ancestor, so the PR merges
with zero conflicts. When the PR merges, the tag push (next section) triggers `release.yml`. Auto-delete removes
`release/v<version>` from the remote on merge. `dev` is untouched.

Rationale (why overlay, not merge; why cut from `main`):
[`RELEASES-RATIONALE.md` § Branching model](./RELEASES-RATIONALE.md#branching-model). CHANGELOG mechanics:
[`RELEASES-RATIONALE.md` § CHANGELOG generation](./RELEASES-RATIONALE.md#changelog-generation).

### Version bump

The two client packages version together for the Phase-0 demo. `release.yml` checks the root `package.json` version
against the tag, so bump the root `package.json` and each `packages/*/package.json` `"version"` (and any inter-package
`dependencies` / `peerDependencies` ranges) to the new value, then regenerate the changelog. The `@meum/contracts`
dependency range is not bumped here: it tracks the contract published from `meum-id/api`:

```bash
# On the release/v<version> branch, between steps 3 and 4 of the overlay recipe:
# ... edit the root and packages/*/package.json version fields to <version> ...
# bun install does not rewrite the workspaces version fields in bun.lock;
# edit them directly, then prove the lock is still accepted (the CI check):
sed -i 's/"version": "<old>",/"version": "<new>",/' bun.lock
bun install --frozen-lockfile
```

A forgotten lock edit cannot land: `test/lock-versions.test.ts` fails `bun test` (CI and the pre-push hook) whenever a
`packages/*/package.json` version disagrees with its `workspaces` entry in `bun.lock`.

### Exception: cherry-pick

The overlay is the release construction for this repo. Cherry-picking the dev squash-commits onto the `origin/main`
base is the exception, kept for a repo that has a stated reason it cannot overlay (record it under
[Project specifics](#project-specifics)); the per-PR changelog is not such a reason, since `--from-dev-prs` builds it
from `dev` either way. When cherry-picking, run the triple-diff verification:

```bash
# 2. List the dev commits not yet on main.
git log --oneline dev --not origin/main

# 3. Cherry-pick the ones to ship. Docs commits stay on dev.
git cherry-pick <sha1> <sha2> ...

# 4. Triple-diff verification.
GUARDED="$(scripts/release/guarded-paths.sh)"

git diff origin/main..HEAD --stat                                              # A: ship surface
git diff HEAD..origin/dev --name-only | grep -Ev "$GUARDED" || echo "(none)"   # B: no missed picks
git diff origin/dev..origin/main --stat | tail -5                              # C: phantom-commits sanity

# Re-confirm no guarded paths leaked.
git diff origin/main..HEAD --name-only \
  | grep -E "$GUARDED" \
  && echo "LEAKED: reset and redo" || echo "(clean)"

# D: what this release ADDS to main (see step 5 above for why).
git diff origin/main..HEAD --diff-filter=A --name-only | grep -E '(^docs/|\.md$)' | grep -Ev "$GUARDED" || echo "(none unguarded)"

# Patch-id cherry check (noisy in squash-merge workflow; triage per-line).
git cherry HEAD origin/dev | grep '^+' || echo "(none)"
```

Cherry-picks of PRs that touched guarded paths hit modify/delete or rename/delete conflicts, since those paths live on
`dev` but are blocked from `main`; resolve them per the next section. Steps 4 to 7 of the overlay recipe then apply
unchanged.

Triple-diff false-positive triage:
[`RELEASES-RATIONALE.md` § Triple-diff verification](./RELEASES-RATIONALE.md#triple-diff-verification).

### Cherry-pick conflicts on guarded paths

Cherry-picks of feature PRs that touched guarded paths (`docs/plans/`, `docs/solutions/`, `.agent/`, and the rest of
the set `scripts/release/guarded-paths.sh` prints) will hit modify/delete conflicts on the release branch, because those
paths exist on `dev` but are blocked from `main`. Resolution (the standard `git rm` is denied by repo policy; use the
plumbing form):

```bash
# 1. Mark every unmerged guarded path as deleted in the index.
git update-index --remove $(git diff --name-only --diff-filter=U)
# 2. Trash the orphan worktree files left by the rename target side.
gio trash docs/plans/<leftover-paths>.md
# 3. Continue the cherry-pick.
git cherry-pick --continue --no-edit
```

Repeat per conflicting commit. After all picks land, run `git ls-files | grep -E "$GUARDED"`. If anything remains, drop
it with the same two-step pattern.

## Tagging and publishing

After the `release/v<version> -> main` PR merges, tag and push:

```bash
git checkout main && git pull
git tag -a -m "Release v<version>" v<version>
git push origin main --tags
```

Always use annotated tags (`-a -m`). The tag push triggers `.github/workflows/release.yml`, which verifies the tag
commit is on `main` and that the package version matches the tag, builds each package, runs `npm publish --access
public` for each `packages/*` under the `@meum` scope, and creates the GitHub Release for the tag. Run
[`scripts/release/postflight.sh all`](./RELEASES-POSTFLIGHT.md) once the tag is pushed.

### Release mode: real publish or tag-only

Decide the release mode before pushing the tag. The `NPM_TOKEN` secret selects it: the same pipeline publishes for real
when the token is set and is tag-only when it is not. The two deterministic modes:

- **Real publish:** set the `NPM_TOKEN` secret (see § Required secrets) before the tag push. A first publish also
  requires the fixture-key check in [`RELEASES-PREFLIGHT.md`](./RELEASES-PREFLIGHT.md) § Public-repo hygiene.
- **Tag-only:** push the tag without `NPM_TOKEN`. The publish loop logs the skip and exits 0, and `github-release`
  creates the GitHub Release from the tag; nothing reaches npm.

### After publish: sync `dev` with the release

Once the packages are live on npm, bring the release bookkeeping (`CHANGELOG.md`, `cliff.toml`, the root and
`packages/*` manifests, `bun.lock`) back to `dev`:

```bash
scripts/sync-dev-after-release.sh v<version>
```

The script copies the set from `origin/main`, proves the lock still passes `test/lock-versions.test.ts`, and opens a PR
against `dev`; merge it once CI is green. The postflight backport gate looks for that merged PR. Never merge `main` into
`dev` or push to `dev` directly: the squash-merged histories share no recent ancestry, so the merge conflicts on every
file both sides touched, and a direct push bypasses `dev`'s PR-only convention.

Rationale: [`RELEASES-RATIONALE.md` § Release pipeline](./RELEASES-RATIONALE.md#release-pipeline).

## Rollback

A bad release is rolled back at the registry first, then repaired in git. Rollback re-points what consumers get; it does
not revert history. After rolling back, land a `fix/*` or `revert` through the normal `dev` to `release/*` to `main`
flow so `main` matches what `latest` resolves to. Knowing the last-good identifier before the release goes out is a
[`RELEASES-POSTFLIGHT.md`](./RELEASES-POSTFLIGHT.md) gate.

The commands are under [Project specifics § Rollback commands](#rollback-commands).

Rationale: [`RELEASES-RATIONALE.md` § Rollback](./RELEASES-RATIONALE.md#rollback).

## Prose scrubbing

Three release-flow artifacts live outside any automated prose check and need a manual scrub before they ship: PR bodies,
`CHANGELOG.md`, and release-PR bodies. Author each in `/tmp/`, scrub, then submit via `--body-file`:

```bash
gh pr view <num> --json body --jq .body > /tmp/body.md
~/.claude/skills/unslop/scripts/score.py /tmp/body.md      # em-dash + AI-pattern gate; fix until 0
gh pr edit <num> --body-file /tmp/body.md
```

For a `CHANGELOG.md` finding, fix the upstream PR body (which `generate-changelog.py` re-fetches every run) and
regenerate. Hand-editing `CHANGELOG.md` directly produces drift the next regeneration overwrites.

Rationale: [`RELEASES-RATIONALE.md` § Prose scrubbing scope](./RELEASES-RATIONALE.md#prose-scrubbing-scope).

## Branch protection

Two rulesets are committed under `.github/rulesets/` and applied to the repo via the GitHub API. They mirror what is
live on `meum-id/sdk`:

- `protect-main.json`: squash-only merges via PR, non-fast-forward blocked, deletion blocked, and the three guard
  contexts (`guard-docs / check-forbidden-docs`, `guard-provenance / check-provenance`,
  `guard-release / check-release-branch-name`) required, strict against the base branch. An owner `RepositoryRole`
  (id 5) break-glass bypass is configured, so an org-admin token can push directly when required.
- `protect-dev.json`: deletion blocked, non-fast-forward blocked. The PR-only norm on `dev` is convention plus
  `guard-release-branch` on the `main` side.

The `ci / Lint, typecheck, test` context is not a required check yet. Add it to `protect-main.json` and re-apply the
ruleset once the check reports reliably on every PR to `main`.

### Applying ruleset changes

```bash
# First apply (creating a ruleset):
gh api -X POST repos/meum-id/sdk/rulesets --input .github/rulesets/protect-dev.json
# Subsequent updates (replace by ID, find via `gh api repos/meum-id/sdk/rulesets`):
gh api -X PUT repos/meum-id/sdk/rulesets/<id> --input .github/rulesets/protect-main.json
```

Status-check context strings (inline vs reusable):
[`RELEASES-RATIONALE.md` § Status-check context strings](./RELEASES-RATIONALE.md#status-check-context-strings).

## Project specifics

### Required secrets

| Secret      | Purpose                                             | Set with                                     |
| ----------- | --------------------------------------------------- | -------------------------------------------- |
| `NPM_TOKEN` | npm automation token with publish scope for `@meum` | `gh secret set NPM_TOKEN --repo meum-id/sdk` |

`release.yml` reads `NPM_TOKEN` as `NODE_AUTH_TOKEN`. Alternatively switch to npm Trusted Publishing (OIDC): set
`id-token: write` on the publish job and drop the token. Without the secret, the publish step skips npm and the cut is
tag-only; see § Release mode: real publish or tag-only.

### Distribution channels

| Channel | Package(s)                  | How                                             |
| ------- | --------------------------- | ----------------------------------------------- |
| npm     | `@meum/verify`, `@meum/sdk` | `npm publish --access public` on a `vX.Y.Z` tag |

`@meum/contracts` is not published from this repo; it is owned and published by `meum-id/api`. This repo consumes it
from npm as a dependency.

### Rollback commands

npm publishes are permanent (`npm unpublish` is limited to a 72-hour window and breaks every consumer that resolved the
version), so the rollback surface is the `latest` dist-tag, which is what an unpinned `npm install @meum/<pkg>`
resolves. Re-point it at the last-good version for each client package, then deprecate the bad version so a pinned
install warns:

```bash
npm dist-tag add @meum/verify@<last-good> latest
npm dist-tag add @meum/sdk@<last-good> latest
npm deprecate @meum/verify@<bad> "rolled back: <reason>; use <last-good>"
npm deprecate @meum/sdk@<bad> "rolled back: <reason>; use <last-good>"
```

The GitHub Release for `<bad>` stays (mark it as a pre-release if consumers browse the releases page). The fix then
lands through `dev` -> `release/*` -> `main` as a new version; the bad version is never re-published.

### First publish (one-time)

Each scoped package's first publish must set public access (`"publishConfig": {"access": "public"}` in each
`package.json`, or `npm publish --access public`). A first publish under a new scope also requires the `@meum` org to
exist on npm and the automation token to have publish rights to it.

## Related docs

- [`RELEASES-PREFLIGHT.md`](./RELEASES-PREFLIGHT.md): pre-cut go/no-go checklist gating release-branch creation.
- [`RELEASES-POSTFLIGHT.md`](./RELEASES-POSTFLIGHT.md): post-tag pipeline verification.
- [`RELEASES-RATIONALE.md`](./RELEASES-RATIONALE.md): release-flow rationale.
- [`.github/pull_request_template.md`](.github/pull_request_template.md): PR body structure with changelog sections.
- [`AGENTS.md`](AGENTS.md): project structure, daily development.
- [`README.md`](README.md): packages, stack, hook activation.
