# Releasing the `@meum` SDK

Operational runbook. Rationale lives in [`RELEASES-RATIONALE.md`](./RELEASES-RATIONALE.md). Pre-cut go/no-go checklist
lives in [`RELEASES-PREFLIGHT.md`](./RELEASES-PREFLIGHT.md). Post-tag verification lives in
[`RELEASES-POSTFLIGHT.md`](./RELEASES-POSTFLIGHT.md).

```text
feature branch -> PR to dev (squash merge)
              -> cherry-pick to release/* branch cut from origin/main
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
`docs/brainstorms/`, `docs/ideation/`, `docs/plans/`, `docs/research/`, `docs/reviews/`, `docs/solutions/`, and anything
under `.context/`.

The standard feature -> PR -> squash-merge flow remains required for everything else, including consumer-facing markdown
(README, AGENTS, CONTRIBUTING, CHANGELOG, in-repo runbooks) and all package source.

## PR body

Every PR (feature, fix, docs, release) uses `.github/pull_request_template.md` verbatim. No inventions:

- **No explainer prose anywhere in the body.** User-facing substance only.
- **Summary describes the net diff only**: what merged `main` looks like vs the base branch. Not commit history,
  intermediate state, or cherry-pick mechanics.
- **Zero verification artifacts in the body.** No triple-diff stats, leak-check output, patch-id cherry-check counts,
  pre-push gate results, CI status, or prose-scrub findings. Anomalies get fixed before push, not audit-trailed.
- **Changelog** subsections (`### Added` / `### Changed` / `### Fixed` / `### Documentation`): 1-5 bullets each, delete
  empty subsections, each bullet starts with a verb.
- **Type of Change**: one checkbox. Prefer `feat`/`fix` over `chore` for any user-observable change.
- **Related Issues/Stories**: four labels (`Story:` / `Issue:` / `Architecture:` / `Related PRs:`). All four required
  even when empty (`- None.` / `n/a`).
- **Files Modified**: four sub-headers (`Modified` / `Created` / `Renamed` / `Deleted`). All four required even when
  empty.
- **No AI attribution** in commits or PR bodies.
- **No hard line wraps**: one logical line per paragraph or bullet.

## Releasing dev to main

Before cutting a release branch, walk [`RELEASES-PREFLIGHT.md`](./RELEASES-PREFLIGHT.md) end-to-end. Any unchecked item
holds the release.

Engineering docs live on `dev` only. `guard-main-docs.yml` blocks them from reaching `main`, and
`guard-release-branch.yml` rejects any PR to main whose head is not `release/*`.

**Branch naming**: `release/v<version>` or `release/v<version>-<slug>`. Where `generate-changelog.py` extracts the
version from the branch name, the `v<version>` prefix is required.

```bash
# 1. Branch from main, NOT dev.
git fetch origin
git checkout -b release/v<version> origin/main

# 2. List the dev commits not yet on main.
git log --oneline dev --not origin/main

# 3. Cherry-pick the ones to ship. Docs commits stay on dev.
git cherry-pick <sha1> <sha2> ...

# 4. Triple-diff verification.
git diff origin/main..HEAD --stat                                              # A: ship surface
git diff HEAD..origin/dev --name-only | grep -v '^docs/' || echo "(none)"      # B: no missed picks
git diff origin/dev..origin/main --stat | tail -5                              # C: phantom-commits sanity

# Re-confirm no guarded paths leaked.
git diff origin/main..HEAD --name-only \
  | grep -E '^(docs/plans|docs/brainstorms|docs/ideation|docs/reviews|docs/solutions|\.context)' \
  && echo "LEAKED, reset and redo" || echo "(clean)"

# 5. Version bump + changelog regeneration (see § Version bump below).

# 6. Push and open the PR. Scrub body in /tmp/ first.
git push -u origin release/v<version>
gh pr create --base main --head release/v<version> --title "release: v<version>" --body-file /tmp/body.md
```

When the PR merges, the tag push (next section) triggers `release.yml`. Auto-delete removes `release/v<version>` from
the remote on merge. `dev` is untouched.

### Version bump

The two client packages version together for the Phase-0 demo. Bump each `packages/*/package.json` `"version"` (and any
inter-package `dependencies` / `peerDependencies` ranges) to the new value, then regenerate the changelog. The
`@meum/contracts` dependency range is not bumped here — it tracks the contract published from `meum-id/api`:

```bash
# On the release/v<version> branch:
# ... edit packages/*/package.json version fields to <version> ...
# bun install does not rewrite the workspaces version fields in bun.lock;
# edit them directly, then prove the lock is still accepted (the CI check):
sed -i 's/"version": "<old>",/"version": "<new>",/' bun.lock
bun install --frozen-lockfile
scripts/generate-changelog.py     # detects <version> from the branch name
git add packages/*/package.json bun.lock CHANGELOG.md
git commit -m "release: v<version>"
```

A forgotten lock edit cannot land: `test/lock-versions.test.ts` fails `bun test` (CI and the pre-push hook) whenever a
`packages/*/package.json` version disagrees with its `workspaces` entry in `bun.lock`.

### Cherry-pick conflicts on guarded paths

Cherry-picks of feature PRs that touched `docs/plans/` / `docs/brainstorms/` / `docs/ideation/` / `docs/reviews/` /
`docs/solutions/` / `.context/` files will hit modify/delete conflicts on the release branch, because those paths exist
on `dev` but are blocked from `main`. Resolution (the standard `git rm` is denied by repo policy; use the plumbing
form):

```bash
# 1. Mark every unmerged guarded path as deleted in the index.
git update-index --remove $(git diff --name-only --diff-filter=U)
# 2. Trash the orphan worktree files left by the rename target side.
gio trash docs/plans/<leftover-paths>.md
# 3. Continue the cherry-pick.
git cherry-pick --continue --no-edit
```

Repeat per conflicting commit. After all picks land, run `git ls-files docs/plans/ docs/brainstorms/`. If anything
remains, drop it with the same two-step pattern.

## Tagging and publishing

After the `release/v<version> -> main` PR merges, tag and push:

```bash
git checkout main && git pull
git tag -a -m "Release v<version>" v<version>
git push origin main --tags
```

Always use annotated tags (`-a -m`). The tag push triggers `.github/workflows/release.yml`, which verifies the tag
commit is on `main` and that the package version matches the tag, builds each package, runs `npm publish --access
public` for each `packages/*` under the `@meum` scope, and creates the GitHub Release for the tag.

### Release mode: real publish or tag-only

Decide the release mode before pushing the tag. The `NPM_TOKEN` secret selects it: the same pipeline publishes for real
when the token is set and is tag-only when it is not. The two deterministic modes:

- **Real publish:** set the `NPM_TOKEN` secret (see § Required secrets) before the tag push. A first publish also
  requires the fixture-key check in [`RELEASES-PREFLIGHT.md`](./RELEASES-PREFLIGHT.md) § Public-repo hygiene.
- **Tag-only:** push the tag without `NPM_TOKEN`. The publish loop logs the skip and exits 0, and `github-release`
  creates the GitHub Release from the tag; nothing reaches npm.

### After publish: sync `dev` with the release

Once the packages are live on npm, bring the release bookkeeping (version bumps, `bun.lock`, `CHANGELOG.md`) back to
`dev` via a PR (direct commits to `dev` are not permitted):

```bash
scripts/sync-dev-after-release.sh v<version>
```

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

## Branch protection

Two rulesets are committed under `.github/rulesets/` and applied to the repo via the GitHub API. They mirror what is
live on `meum-id/sdk`:

- `protect-main.json`: squash-only merges via PR, non-fast-forward blocked, deletion blocked. An owner `RepositoryRole`
  (id 5) break-glass bypass is configured, so an org-admin token can push directly when required.
- `protect-dev.json`: deletion blocked, non-fast-forward blocked. The PR-only norm on `dev` is convention plus
  `guard-release-branch` on the `main` side.

The `guard-main-docs` and `guard-release-branch` workflows run on every PR to `main` but are **not** required status
checks yet (the CI and release workflows are skeletons until the build lands). Add the `ci / Lint, typecheck, test`
context (and the guard contexts) to `protect-main.json` once the scaffolding is in place and the checks report reliably.

### Applying ruleset changes

```bash
# First apply (creating a ruleset):
gh api -X POST repos/meum-id/sdk/rulesets --input .github/rulesets/protect-dev.json
# Subsequent updates (replace by ID, find via `gh api repos/meum-id/sdk/rulesets`):
gh api -X PUT repos/meum-id/sdk/rulesets/<id> --input .github/rulesets/protect-main.json
```

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

`@meum/contracts` is not published from this repo — it is owned and published by `meum-id/api`. This repo consumes it
from npm as a dependency.

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
