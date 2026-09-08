# Pre-release verification: `@meum` SDK

Operational pre-flight checklist. Runs **before** step 1 of
[`RELEASES.md` § Releasing dev to main](./RELEASES.md#releasing-dev-to-main). Gates the cut of the `release/v<version>`
branch, not the daily dev integration. Each box is an explicit go/no-go. If any item is unchecked or red, hold the
release.

CI catches mechanical regressions inside the repo. This checklist covers what CI structurally cannot: drift between
`main` and `dev`, contract drift in the published package surface, version consistency across the two client packages,
and clean packing before anything reaches npm.

Post-tag verification (release.yml -> npm publish) lives in [`RELEASES-POSTFLIGHT.md`](./RELEASES-POSTFLIGHT.md). The
tag push happens AFTER the release-branch cut and the PR-to-main merge, so verification of the tag-triggered pipeline is
post-flight, not pre-flight.

## Quick start: run the automated gates

The generic gates run from one script:

```bash
scripts/release/preflight.sh all
```

`scripts/release/preflight.sh` is **project-authored**: the scaffolding (gate helpers, subcommand dispatch, drift,
surface, and mechanics gates) is vendored from the `github-repo-setup` skill skeleton, and the `smoke` gate body is this
repo's to fill in. Until it is, `smoke` SKIPs and the manual sections below are the smoke checks. `all` runs the drift
gate first, since nothing else matters while `main` holds changes `dev` never received.

Sub-commands let you re-run one section in isolation:

| Sub-command | What it checks                                                                              | Source of truth                                    |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `drift`     | What `main` carries that `dev` never received (delegates to `scripts/release/drift.sh`)     | `git log`, `git diff`, `.github/` parity           |
| `surface`   | Commits + diff vs last tag, breaking markers                                                | `git log`, `git diff`                              |
| `smoke`     | Project-authored checks (`gate_smoke` body; SKIPs until filled in)                          | project body                                       |
| `mechanics` | Version, `CHANGELOG.md`, leak check, unguarded docs added to `main`, diff-B vs `origin/dev` | `package.json`, `scripts/release/guarded-paths.sh` |
| `all`       | Every above sequentially, drift first                                                       |                                                    |

Flags: `--tag TAG` overrides `LAST_TAG` resolution (default: `git tag --sort=-version:refname | head -n 1`).

After `git push origin main --tags` triggers the release pipeline, run
[`scripts/release/postflight.sh all`](./RELEASES-POSTFLIGHT.md) to verify the downstream chain.

## Establish the surface

Everything below assumes you know what is changing. Run this first.

Driven by `scripts/release/preflight.sh surface`.

```bash
LAST_TAG=$(git tag --sort=-version:refname | head -n 1)
git log "$LAST_TAG..dev" --oneline                              # commits going out
git diff "$LAST_TAG..dev" --stat                                # file-level scope
git log "$LAST_TAG..dev" --grep '^[a-z]\+\(([^)]*)\)\?!:' --oneline   # Conventional-Commits breaking markers, scoped or not
```

On a repo with no tags yet, or whose lineage is squash-only so no tag is an ancestor of `dev`, the surface is
`origin/main..origin/dev` instead of `$LAST_TAG..dev`; `preflight.sh surface` SKIPs the tag counts in that case.

Every `!:` commit drives the major-version decision and gets a row in the release's `### Breaking changes` section.

## Checklist

### Branch drift (main ahead of dev)

Driven by `scripts/release/preflight.sh drift` (delegates to `scripts/release/drift.sh`).

Security PRs, hotfixes, and config edits land on `main` first. The release branch is cut from `main` and then takes
`dev`'s tree, so anything `main` holds that `dev` never received is reverted by the release or collides with it, and
Dependabot raises the same fix again.

- [ ] Every commit on `main` since the last release has its changes on `dev` (gate 1 lists the ones that do not, as
      `differs` or `missing`). Backport them by PR into `dev` first, merge, and rerun.
- [ ] `.github/` is identical on both branches (gate 2), or every listed difference is a `dev`-side change this
      release ships. The gate fails either way; a `main`-only edit is drift and gets backported to `dev` by PR first.
- [ ] No lockfile package resolves newer on `main` than on `dev` (gate 3). The gate reads `package-lock.json` and
      `Cargo.lock` only; `bun.lock` is not parsed, so compare a `main`-side security bump by hand:
      `git diff origin/dev origin/main -- bun.lock`.

### Green build (Biome + tsc + bun test)

Run the same checks CI runs, locally, from a clean install. The pre-push hook (`scripts/hooks/pre-push`) mirrors these;
run it explicitly before pushing the release branch.

- [ ] `bun install --frozen-lockfile` succeeds against the committed `bun.lock` (no lockfile drift).
- [ ] `bun run lint` (Biome) is clean across every package.
- [ ] `bun run typecheck` (tsc, strict) is clean across every package.
- [ ] `bun test` is green: all package test suites pass.
- [ ] `bun run build` produces the publishable artifacts for every package with no errors.

### Package surface contract

The published surface is the union of each package's exported API and its `package.json` publish metadata. Confirm
against the previous release before tagging.

- [ ] Exported API of each client package (`@meum/verify`, `@meum/sdk`) matches the previous release plus any net
  additions or removals. Every removed or renamed export has a `!:` commit and a `### Breaking changes` bullet in the
  release changelog.
- [ ] `@meum/verify` declares exactly **`@hpke/core`** as its runtime dependency surface. Check its `package.json`
  `dependencies` lists `@hpke/core` and nothing else (the single-dependency surface is part of its contract).
- [ ] Each `package.json` has the correct `"name"` (`@meum/<pkg>`), `"exports"` map, `"types"` entry, `"files"`
  allowlist, and `"publishConfig": {"access": "public"}`.
- [ ] `npm pack --dry-run` (or `bun pm pack --dry-run`) for each package lists exactly the intended files (built output,
  types, LICENSE, and README), with no stray source, tests, or secrets.

### Version consistency

- [ ] The root `package.json` and every `packages/*/package.json` `"version"` are bumped to the new `<version>` and
  they all match (`release.yml` checks the root value against the tag).
- [ ] Inter-package dependency ranges (`@meum/verify` consumed by `@meum/sdk`) reference the new `<version>` so a
  published set resolves against itself. The `@meum/contracts` range tracks the npm package published from
  `meum-id/api`, not this repo's version.
- [ ] `bun.lock` `workspaces` version entries edited to `<version>` and `bun install --frozen-lockfile` still accepts
  the lock (`test/lock-versions.test.ts` enforces the parity).
- [ ] The new `<version>` is not already published on npm for either client package (`npm view @meum/<pkg> versions`
  does not list it).

### Release mechanics sanity

Driven by `scripts/release/preflight.sh mechanics`.

These items duplicate steps in `RELEASES.md` deliberately: easy to skip, expensive to recover from. Confirm explicitly.

- [ ] Every PR merged into `dev` since `$LAST_TAG` has a non-empty `## Changelog` section. Spot-check via `gh pr list
  --base dev --state merged --search "merged:>$(git log -1 --format=%aI $LAST_TAG)"` then `gh pr view <num> --json
  body`. A PR without one falls back to its title as a `Changed` bullet.
- [ ] `CHANGELOG.md` regenerated on the release branch (`scripts/generate-changelog.py --from-dev-prs`), versioned
  section matches the bumped version, no `[Unreleased]` placeholder.
- [ ] Overlay verification lines A and B from `RELEASES.md` § Releasing dev to main are clean: the staged tree differs
  from `origin/dev` only by the version files and the stripped guarded set, and no guarded path is in the diff against
  `origin/main`. Diff-B is filtered by the guarded set, not all of `docs/`, since a directory that ships to `main`
  would hide a missed change.
- [ ] **Leak check before pushing the release branch.** No guarded path may surface in the diff vs `origin/main`. The
  set resolves from `.github/workflows/guard-main-docs.yml` via `scripts/release/guarded-paths.sh`; never restate the
  pattern inline. If a cherry-pick pulled in guarded paths via rename detection, resolve per `RELEASES.md` §
  Cherry-pick conflicts on guarded paths.

  ```bash
  GUARDED="$(scripts/release/guarded-paths.sh)"
  git diff origin/main..HEAD --name-only | grep -E "$GUARDED" && echo "LEAKED: reset and redo" || echo "(clean)"
  ```

- [ ] **Every doc this release adds to `main` is meant to ship.** The leak check is blind to a category nobody
  registered. `git diff origin/main..HEAD --diff-filter=A --name-only | grep -E '(^docs/|\.md$)' | grep -Ev "$GUARDED"`
  lists the unguarded additions; each one needs a reason to ship, or it gets registered in the workflow's
  `extra_paths` and removed from the branch.
- [ ] `NPM_TOKEN` secret exists on `meum-id/sdk` (or Trusted Publishing / OIDC is configured on `release.yml`) when the
  cut is a real publish. Otherwise the publish step skips npm and the cut is tag-only; see `RELEASES.md` § Release
  mode.

### Public-repo hygiene

This repo is public and holds no PII by design. Confirm before cutting.

- [ ] No PII, account/tenant identifiers, internal hostnames, or secrets in the ship surface (`git diff
  origin/main..HEAD`). Secret scanning + push protection are the backstop, not the first line.
- [ ] No engineering docs in the ship surface (covered by the leak check above, restated because it is a public
  branch).
- [ ] **First real npm publish only:** the `@meum/verify` tarball ships `src/fixtures/` private key material (the test
  signing keys and the sealed-credential X25519 keypair). Confirm every fixture key is test-only, used by no deployed
  demo, staging issuer, or device. A fixture key that ever signed or sealed anything outside the test suites holds the
  release.

### Post-tag verification

Moved to [`RELEASES-POSTFLIGHT.md`](./RELEASES-POSTFLIGHT.md) because tagging happens **after** the release-branch cut
and PR-to-main merge, so verification of the tag-triggered pipeline (`release.yml` -> npm publish -> GitHub Release) is
post-flight, not pre-flight. Run `scripts/release/postflight.sh all` immediately after the tag push.

## Related docs

- [`RELEASES-POSTFLIGHT.md`](./RELEASES-POSTFLIGHT.md): runs AFTER the tag push to verify the npm publish.
- [`RELEASES.md`](./RELEASES.md): operational runbook this checklist gates.
- [`RELEASES-RATIONALE.md`](./RELEASES-RATIONALE.md): release-flow rationale.
- [`AGENTS.md`](./AGENTS.md): project structure, package surface.
