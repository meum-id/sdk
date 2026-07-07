# Pre-release verification: `@meum` SDK

Operational pre-flight checklist. Runs **before** step 1 of
[`RELEASES.md` § Releasing dev to main](./RELEASES.md#releasing-dev-to-main). Gates the cut of the `release/v<version>`
branch, not the daily dev integration. Each box is an explicit go/no-go. If any item is unchecked or red, hold the
release.

CI catches mechanical regressions inside the repo. This checklist covers what CI structurally cannot: contract drift in
the published package surface, version consistency across the three packages, and clean packing before anything reaches
npm.

Post-tag verification (release.yml -> npm publish) lives in [`RELEASES-POSTFLIGHT.md`](./RELEASES-POSTFLIGHT.md). The
tag push happens AFTER the release-branch cut and the PR-to-main merge, so verification of the tag-triggered pipeline is
post-flight, not pre-flight.

## Establish the surface

Everything below assumes you know what is changing. Run this first.

```bash
LAST_TAG=$(git tag --sort=-version:refname | head -n 1)
git log "$LAST_TAG..dev" --oneline                              # commits going out
git diff "$LAST_TAG..dev" --stat                                # file-level scope
git log "$LAST_TAG..dev" --grep '^[a-z]\+!:' --oneline          # Conventional-Commits breaking markers
```

Every `!:` commit drives the major-version decision and gets a row in the release's `### Changed` (or breaking-changes)
changelog section.

## Checklist

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

- [ ] Exported API of each package (`@meum/contracts`, `@meum/verify`, `@meum/sdk`) matches the previous release plus
  any net additions or removals. Every removed or renamed export has a `!:` commit and a `### Changed` bullet in the
  release changelog.
- [ ] `@meum/verify` still declares **zero runtime dependencies**. Check its `package.json` `dependencies` is empty (the
  zero-dependency guarantee is part of its contract).
- [ ] Each `package.json` has the correct `"name"` (`@meum/<pkg>`), `"exports"` map, `"types"` entry, `"files"`
  allowlist, and `"publishConfig": {"access": "public"}`.
- [ ] `npm pack --dry-run` (or `bun pm pack --dry-run`) for each package lists exactly the intended files (built output +
  types + LICENSE + README), with no stray source, tests, or secrets.

### Version consistency

- [ ] Every `packages/*/package.json` `"version"` is bumped to the new `<version>` and they all match.
- [ ] Inter-package dependency ranges (`@meum/contracts` consumed by `@meum/sdk`, etc.) reference the new `<version>` so
  a published set resolves against itself.
- [ ] `bun.lock` regenerated (`bun install`) and committed after the version bump.
- [ ] The new `<version>` is not already published on npm for any of the three packages (`npm view @meum/<pkg> versions`
  does not list it).

### Release mechanics sanity

These items duplicate steps in `RELEASES.md` deliberately: easy to skip, expensive to recover from. Confirm explicitly.

- [ ] Every PR merged since `$LAST_TAG` has a non-empty `## Changelog` section (spot-check via `gh pr view <num> --json
  body`).
- [ ] `CHANGELOG.md` regenerated on the release branch (`scripts/generate-changelog.py`), versioned section matches the
  bumped version, no `[Unreleased]` placeholder.
- [ ] Triple-diff verification before tag: `git diff origin/main..HEAD`, `git diff HEAD..origin/dev` (no non-doc paths),
  `git diff origin/dev..origin/main` (sanity): all three agree on intended scope.
- [ ] Leak check: `git diff origin/main..HEAD --name-only | grep -E
  '^(docs/plans|docs/brainstorms|docs/ideation|docs/reviews|docs/solutions|\.context)'` returns nothing. If cherry-picks
  pulled in guarded paths via rename detection, resolve per `RELEASES.md` § Cherry-pick conflicts on guarded paths.
- [ ] `NPM_TOKEN` secret exists on `meum-id/sdk` (or Trusted Publishing / OIDC is configured on `release.yml`).
  Otherwise the publish step 401s post-tag.

### Public-repo hygiene

This repo is public and holds no PII by design. Confirm before cutting.

- [ ] No PII, account/tenant identifiers, internal hostnames, or secrets in the ship surface (`git diff
  origin/main..HEAD`). Secret scanning + push protection are the backstop, not the first line.
- [ ] No engineering docs (`docs/plans/`, `docs/solutions/`, etc.) in the ship surface (covered by the leak check
  above, restated because it is a public branch).

### Post-tag verification

Moved to [`RELEASES-POSTFLIGHT.md`](./RELEASES-POSTFLIGHT.md) because tagging happens **after** the release-branch cut
and PR-to-main merge, so verification of the tag-triggered pipeline (`release.yml` -> npm publish) is post-flight, not
pre-flight.

## Related docs

- [`RELEASES-POSTFLIGHT.md`](./RELEASES-POSTFLIGHT.md): runs AFTER the tag push to verify the npm publish.
- [`RELEASES.md`](./RELEASES.md): operational runbook this checklist gates.
- [`RELEASES-RATIONALE.md`](./RELEASES-RATIONALE.md): release-flow rationale.
- [`AGENTS.md`](./AGENTS.md): project structure, package surface.
