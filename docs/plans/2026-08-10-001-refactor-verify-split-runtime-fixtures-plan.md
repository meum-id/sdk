---
title: "refactor: evict the sdk-internal test harness from @meum/verify's published surface and ship v0.3.0"
date: 2026-08-10
type: refactor
status: implementation-ready
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
target_repo: meum-sdk
---

# refactor: evict the sdk-internal test harness from @meum/verify's published surface and ship v0.3.0

**Target repo:** `meum-sdk` (all repo-relative paths are meum-sdk paths unless prefixed `meum-api:` or `meum-sites:`).

Product Contract preservation: no upstream brainstorm; this is a `ce-plan-bootstrap` plan authored live from a
cross-repo drift-guard finding. Scope was set interactively and then revised during `ce-doc-review`: an initial full
2-way package split (`@meum/verify-fixtures`) was **replaced with a surgical eviction** after review found the
standalone package doubled cross-repo vendoring cost to buy runtime-purity no consumer uses (KTD1). Version is **0.3.0
(minor)** for the dropped `./mock-worker` export.

---

## Goal Capsule

- **Objective:** Move the genuinely sdk-internal test harness — `mock-worker.ts` and `sealed-receipt-parity{,-types}.ts`
  — out of `packages/verify/src/` (the published, byte-for-byte-vendored surface) into `packages/verify/test/`
  (sdk-repo-only), so the vendored + drift-guarded content is exactly what consumers use. Keep the shared fixtures where
  they are (`src/fixtures/`, `./fixtures` export). Ship it with the release-doc drift fixes, the `v*` tag
  standardization, the version bump, and a generated CHANGELOG, as `v0.3.0`.
- **Why now:** meum-api's `check-verify-sync.ts` drift guard hashes the entire `packages/verify/src/**` tree
  byte-for-byte against the sdk release tag. Byte-identity is what makes the guard meaningful, but it drags files the
  api never imports (`mock-worker.ts`, `sealed-receipt-parity{,-types}.ts`) across the vendor boundary. Evicting them
  from `src/` shrinks the guarded surface to exactly the runtime + shared-fixtures that consumers actually vendor, and
  the same release closes stale "zero-dependency" claims (false since 0.2.0 added `@hpke/core`) and a never-generated
  0.2.0 CHANGELOG.
- **Authority hierarchy:** this document, then repo conventions (`AGENTS.md`, Biome, the release quad `RELEASES*.md`).
  This restructures the *packaging* of the reference verifier, not the wire contract.
- **Stop conditions:** stop and surface if evicting the harness to `test/` forces a fixture or runtime import that
  cannot resolve; if dropping the `./mock-worker` export breaks a real consumer (confirm meum-sites does not import it —
  see Open Questions); if the `v*` tag standardization turns out to be load-bearing for a downstream consumer this plan
  cannot see; or if a real npm publish is expected today but `NPM_TOKEN` is unset (the first `v0.3.0` publish attempt
  red-fails without it — it does not silently no-op; KTD7).
- **Execution profile:** Standard, in-repo, low-runtime-risk (the harness and fixtures are tree-shaken test-only; the
  runtime bundle is unaffected). Touches the release pipeline and the cross-repo vendor surface, so the downstream
  re-vendor is a coordinated follow-on.
- **Blast radius:** entirely internal. `@meum/verify` is unpublished on npm; every consumer is the sdk workspace or a
  byte-for-byte vendor (meum-api, meum-sites), each vendoring one package. Downstream guards pin explicit tags
  (`sdk-v0.2.0`), so tagging `v0.3.0` does not break their CI until they choose to adopt.

---

## Product Contract

### Summary

Relocate `mock-worker.ts`, `sealed-receipt-parity.ts`, and `sealed-receipt-parity-types.ts` from `packages/verify/src/`
into `packages/verify/test/`, so they leave `@meum/verify`'s `files: ["src"]` published + vendored surface. Drop the two
parity re-exports from `src/fixtures/index.ts` and remove the `./mock-worker` package export. Keep the runtime verifier
and the shared fixtures (`src/fixtures/`, `./fixtures` export) exactly where they are. Rewire the relocated harness's
imports, its two test files, and the parity-import script. Then fix the "zero-dependency" doc drift in README + the
PREFLIGHT/POSTFLIGHT gates, standardize the tag convention on unprefixed `v*`, bump every workspace package **and the
root `package.json`** to `0.3.0`, add the missing `cliff.toml`, generate the CHANGELOG, and cut `v0.3.0`.

### Problem Frame

- `packages/verify/src/**` mixes two published audiences plus a genuinely-internal one. Runtime verifier (`b64url`,
  `hpke`, `jwks`, `receipt-types`, `verify`, `index`) and shared fixtures (`src/fixtures/**`, consumed by the api's test
  suites via `@meum/verify/fixtures` and the sdk's client test) both legitimately belong in the published + vendored
  surface. The internal harness — `mock-worker.ts` (186 LOC, Miniflare-shaped, never imported by the api) and
  `sealed-receipt-parity{,-types}.ts` (213 LOC, the CryptoKit cross-stack parity matrix from #35, exercised only by the
  sdk's own test) — does not.
- meum-api vendors `packages/verify/{src,package.json}` byte-for-byte and its `scripts/check-verify-sync.ts` hashes the
  whole `src/**` against the `sdk-v0.2.0` tag. So the internal harness is dead weight inside the vendored, drift-guarded
  surface: the api can never touch it, but any byte change to it trips the api's guard.
- The dependency direction is already clean and one-way: runtime files import no fixtures; fixtures import runtime
  types; the internal harness imports fixtures. So the runtime/fixtures boundary is already real (a clean DAG, enforced
  by `dependency-boundary.test.ts`, with fixtures reachable only via the `./fixtures` export subpath that is tree-shaken
  out of runtime bundles). The harness is the only thing that does not belong in `src/`.
- Consumer-facing docs drifted: README calls the repo "zero-dependency" (×3) and PREFLIGHT/POSTFLIGHT assert
  `@meum/verify` `dependencies` is empty — all false since 0.2.0 added `@hpke/core`, and those gates would now *fail*.
  README describes 0.2.0 as only the revoke-proof change, omitting HPKE sealed envelopes, and its two tag examples cite
  `sdk-v0.2.0`.
- The `sdk-v0.2.0` CHANGELOG entry was never generated (CHANGELOG stops at `sdk-v0.1.0`); the release pipeline has never
  fired (see tag mismatch below), and no `cliff.toml` exists, so `scripts/generate-changelog.py` currently hard-fails.
- `release.yml` triggers on `v[0-9]+.[0-9]+.[0-9]+` and the runbook prose already says `git tag v<version>`, but the
  only tags ever pushed used the `sdk-v*` prefix, so none fired the pipeline. `release.yml` also gates on the **root**
  `package.json` version matching the tag, and the root is still `0.1.0`.

### Requirements

- **R1.** `packages/verify/src/**` contains the runtime verifier (`b64url`, `hpke`, `jwks`, `receipt-types`, `verify`,
  `index`) and the shared fixtures (`src/fixtures/**`) — no mock worker, no parity matrix.
- **R2.** `mock-worker.ts` and `sealed-receipt-parity{,-types}.ts` live under `packages/verify/test/` (sdk-repo-only):
  excluded from `@meum/verify`'s `files`/`exports`, and therefore absent from the vendored + drift-guarded surface.
- **R3.** `@meum/verify`'s `exports` drop `./mock-worker`; the `./fixtures` export is unchanged; `src/fixtures/index.ts`
  no longer re-exports the parity matrix/types.
- **R4.** `@meum/verify` runtime `dependencies` stay exactly `{@hpke/core}`; `@meum/sdk` runtime deps stay
  `{@meum/contracts, @meum/verify}`. No new package is created.
- **R5.** Every existing test stays green after relocation + import rewiring: the sdk client test (unchanged import),
  the verify runtime + fixture tests (unchanged imports), and the relocated harness tests (path-updated imports). No
  coverage is dropped or expanded.
- **R6.** README and the PREFLIGHT/POSTFLIGHT gates state the true dependency surface (`@meum/verify` declares
  `@hpke/core`) and no longer claim zero dependencies; README documents the 0.2.0 HPKE sealed-envelope support and uses
  `v0.3.0` in its tag examples.
- **R7.** The tag convention is uniformly unprefixed `v*` across `RELEASES.md`, `RELEASES-POSTFLIGHT.md`, README, and
  `release.yml`'s trigger, so a pushed `v0.3.0` tag fires the pipeline; historical `sdk-v*` tags stay as legacy.
- **R8.** `@meum/verify`, `@meum/sdk`, **and the root `meum-sdk` `package.json`** are all `0.3.0`, their `bun.lock`
  workspace-version entries match, and `test/lock-versions.test.ts` plus `release.yml`'s root-version integrity check
  both pass.
- **R9.** `CHANGELOG.md` carries a generated `0.3.0` section covering the user-facing surface since `0.1.0` (HPKE sealed
  envelopes, revoke-proof, RP keygen, the harness eviction), produced by `scripts/generate-changelog.py` against a
  committed `cliff.toml` whose tag range spans `0.1.0..HEAD` — not hand-edited.

### Scope Boundaries

**In scope:** the harness eviction, the `./mock-worker` export drop + parity-barrel trim, the consumer/test rewiring,
the README/PREFLIGHT/POSTFLIGHT drift fixes, standardizing the tag convention on `v*`, adding `cliff.toml`, the `0.3.0`
version bump (including the root `package.json`) + lockfile, and CHANGELOG generation — all in `meum-sdk`, shipped as
`v0.3.0`.

**Out of scope / non-goals:**

- **No standalone `@meum/verify-fixtures` package.** Considered and rejected in review (KTD1): the api and sites both
  consume the fixtures, so a separate package doubles their vendoring surface (two trees, two drift-guard scopes, two
  lockstep version streams) to buy a runtime-pure `@meum/verify` no consumer needs. The `./fixtures` export subpath is
  the seam to extract at cheaply *when* a concrete external or second consumer needs runtime-without-fixtures.
- No change to the verifier wire behavior, the receipt/JWKS format, or `verify()`'s logic. Packaging, not protocol.
- No change to `@meum/sdk`'s public runtime API (`client.ts`, `rp-keys.ts`, `deeplink.ts`).
- No edit to meum-api or meum-sites source in this plan (see coordinated follow-on).

**Deferred to coordinated follow-on (separate repos, after the `v0.3.0` tag exists):**

- **meum-api + meum-sites re-vendor** `@meum/verify` (one package) against `v0.3.0` and bump
  `scripts/check-verify-sync.ts` `SDK_TAG` from `sdk-v0.2.0` to `v0.3.0`. **Trigger (A5):** the re-vendor is the action
  that actually removes the internal harness from a consumer's guarded surface — this sdk release only makes the clean
  tree *available*. Until a consumer re-vendors, its guard keeps hashing the old `src/**` against `sdk-v0.2.0` and
  reports "in sync" against a stale pin. So schedule the api/sites re-vendor as the immediate next step in the same
  release wave, not open-ended; a permanently-deferred re-vendor degrades the guard to a stale-but-green signal.

---

## Planning Contract

### Key Technical Decisions

- **KTD1. Evict the internal harness to `test/`; keep the shared fixtures in-package (surgical, not a second package).**
  `test/` already sits outside `@meum/verify`'s `files: ["src"]`, so moving `mock-worker.ts` + `sealed-receipt-parity*`
  there removes them from the tarball and the vendored copy with no new artifact. The runtime/fixtures separation that
  matters (runtime `src/` imports zero fixtures; fixtures reachable only via the tree-shaken `./fixtures` subpath) is
  already real and guard-enforced — a standalone fixtures package would not make it more real, only add a public
  artifact
  - a doubled cross-repo vendor contract for purity no current consumer uses (api and sites both consume fixtures).
    Revisit only when a concrete external/second consumer needs the runtime verifier without fixtures; extraction is
    mechanical then because the subpath is the seam.
- **KTD2. Drop the `./mock-worker` export and the parity barrel re-exports; keep `./fixtures`.** `mock-worker` and the
  parity matrix are sdk-internal test scaffolding, not part of the reference surface consumers use. Removing the
  `./mock-worker` export and the two parity lines from `src/fixtures/index.ts` is the export-surface change that makes
  this a `0.3.0` minor. `@meum/verify/fixtures` stays intact so the api and the sdk client test change nothing.
- **KTD3. One tag convention: unprefixed `v*`.** `release.yml`'s `on.push.tags` and the runbook already use `v*`; the
  only anomaly is the historical `sdk-v*` tags, which never fired the pipeline. No workflow or runbook tag-form change
  is needed; update README's two `sdk-v0.2.0` examples to `v0.3.0`; leave the legacy tags in place. Downstream, the api
  guard's `SDK_TAG` moves to `v0.3.0` on re-vendor. `generate-changelog.py`'s `release/vX.Y.Z` *branch* convention is
  independent of the git *tag* and is unchanged.
- **KTD4. 0.3.0 (minor) is the honest bump.** Dropping the `./mock-worker` export and trimming the `./fixtures` barrel
  is an export-surface change (a 0.x-minor under semver). No external consumer exists to break (unpublished; consumers
  vendor and adopt in lockstep), so the minor is honest signaling, not breakage protection.
- **KTD5. The root `package.json` is release-version-bearing.** `release.yml`'s integrity step gates on
  `require('./package.json').version` (the private root, currently `0.1.0`) equalling the tag. Standardizing on `v*`
  fires this check for the first time ever, so the root must be bumped to `0.3.0` alongside the workspace packages, or
  the very first real cut red-fails before publishing anything.
- **KTD6. `cliff.toml` must exist and pin the changelog range to span `0.1.0..HEAD`.** `scripts/generate-changelog.py`
  `fail()`s with "cliff.toml not found" before its `--check` branch, and no `cliff.toml` is committed, so the changelog
  gate is currently unrunnable. Add one (owner `meum-id`, repo `sdk`). git-cliff keys the range off git *tags*, and the
  `sdk-v0.2.0` tag exists — so a default range would start at `sdk-v0.2.0` and drop the never-captured 0.2.0 work
  (#28–#35). Configure the range to span from `sdk-v0.1.0` (e.g. via `tag_pattern`/explicit range) so the `0.3.0`
  section captures HPKE, revoke-proof, and RP keygen. Because git-cliff aggregates PR-body `## Changelog` sections and
  the 0.2.0-era PRs predate that discipline, plan for a manual backfill of those bullets into the release-PR body if the
  generator does not surface them.
- **KTD7. A no-token cut fails the pipeline; it does not no-op.** `release.yml`'s only no-op guard is `[ -d packages ]`
  (the bare pre-scaffolding repo). With the scaffolding present, the publish loop runs `npm publish` with an empty
  `NODE_AUTH_TOKEN`, 401s, `exit 1`, and `github-release` (`needs: publish`) is skipped — so neither packages nor a
  GitHub Release land. To make today's cut deterministic, either set `NPM_TOKEN` (real publish) **or** restructure
  `release.yml` so the publish loop `exit 0`s on an empty token and `github-release` is decoupled from publish success
  (tag + GitHub Release only). Note: the first real `v0.3.0` publish is also the first time `@meum/verify` reaches
  public npm at all, and its tarball includes `src/fixtures/` test key material — confirm those keys are test-only (used
  by no deployed demo/staging issuer or device) as a PREFLIGHT check before a real publish.
- **KTD8. Characterize-first, then move.** Capture a full-suite green baseline (`bun test`) before touching files, then
  relocate + rewire and re-run; any break signals a real import-path miss, not a behavior change to introduce.

### High-Level Technical Design

Post-eviction package shape (directional; not an implementation spec):

```mermaid
flowchart TB
  subgraph verify["@meum/verify (one package: published + vendored)"]
    RT["src/: b64url, hpke, jwks, receipt-types, verify, index — dep {@hpke/core}"]
    FX["src/fixtures/: constants, device/issuer-jwks, sealed-credential, test-keys, valid/invalid receipts — ./fixtures export"]
    HARNESS["test/: mock-worker.ts, sealed-receipt-parity{,-types}.ts (sdk-only, NOT in files/exports)"]
  end

  FX -->|imports runtime types| RT
  HARNESS -->|imports fixtures + runtime| FX
  HARNESS --> RT

  SDK["@meum/sdk (client.ts, rp-keys.ts)"] -->|runtime| RT
  SDKTEST["sdk test/client.test.ts"] -->|@meum/verify/fixtures (unchanged)| FX
  API["meum-api apps/api/test/** (vendored)"] -->|runtime + fixtures| RT
  API --> FX
  SITES["meum-sites (vendored)"] --> RT
  SITES --> FX

  classDef internal fill:#eee,stroke:#999,stroke-dasharray:4 3;
  class HARNESS internal;
```

The dashed box (`test/` harness) never crosses the vendor boundary: the drift guard hashes `src/** + package.json`, so
it shrinks to exactly the runtime + shared-fixtures surface. No consumer import path changes — `@meum/verify/fixtures`
stays.

### Assumptions

- The api guard pinning `sdk-v0.2.0` (verified in `meum-api:scripts/check-verify-sync.ts`) means `v0.3.0` does not break
  downstream CI on tag push; downstream adopts on re-vendor (KTD3, A5 trigger).
- The runtime bundle-size gate (`packages/sdk/test/bundle-size.test.ts`, <50KB) is unaffected: the harness and fixtures
  were already test-only and tree-shaken out of the runtime path.
- No new workspace package is created, so `bun.lock` needs only the `0.1.0/0.2.0 → 0.3.0` version-field edits
  (hand-edited per the lockfile quirk, then proven under `--frozen-lockfile`; see [[bun-lock-workspace-version-bump]]
  and `RELEASES.md` "Version bump"). The root and both workspace packages get bumped.
- meum-sites currently vendors `mock-worker.ts`. Dropping the `./mock-worker` export is safe for the api (never imports
  it); confirm sites does not import it before/at re-vendor (Open Questions).

### Sequencing

U1 (eviction + export/barrel changes + rewiring) is the structural core. U2 (doc + tag drift) is independent and can
proceed in parallel. U3 (cliff.toml + version bump + lockfile + CHANGELOG) is last and depends on U1/U2 being final. All
land on one `refactor` branch → PR to `dev` → cherry-pick to `release/v0.3.0` cut from `main` → PR to `main` → `v0.3.0`
tag.

---

## Implementation Units

### U1. Evict the internal harness out of the published surface

- **Goal:** Move `mock-worker.ts` and `sealed-receipt-parity{,-types}.ts` into `packages/verify/test/`, drop the
  `./mock-worker` export and the parity barrel re-exports, and rewire every affected import — without touching the
  runtime or shared-fixtures surface.
- **Requirements:** R1, R2, R3, R4, R5.
- **Dependencies:** none.
- **Files:**
  - `packages/verify/src/mock-worker.ts` → `packages/verify/test/mock-worker.ts` (rewire its `./fixtures/*` imports to
    `../src/fixtures/*`; update the runnable-path note in its doc comment).
  - `packages/verify/src/fixtures/sealed-receipt-parity.ts` → `packages/verify/test/sealed-receipt-parity.ts`;
    `packages/verify/src/fixtures/sealed-receipt-parity-types.ts` →
    `packages/verify/test/sealed-receipt-parity-types.ts` (rewire runtime-type imports from `../hpke` / `../jwks` /
    `../receipt-types` to `../src/hpke` etc., and the sibling `./sealed-receipt-parity-types` reference stays sibling).
  - `packages/verify/src/fixtures/index.ts` (remove the `sealed-receipt-parity` and `sealed-receipt-parity-types`
    re-export lines; the shared-fixture exports are unchanged).
  - `packages/verify/package.json` (`exports`: drop `./mock-worker`, keep `.` and `./fixtures`; `files` stays `["src"]`;
    devDeps unchanged — `miniflare` still justified by `test/mock-worker.ts`, `@noble/*` by the unchanged
    `scripts/generate-fixtures.ts`, `@meum/contracts` by the parity harness).
  - `packages/verify/test/mock-worker.test.ts` (`../src/mock-worker` → `../mock-worker`; `../src/fixtures/index` stays).
  - `packages/verify/test/sealed-receipt-parity.test.ts` (`../src/fixtures/sealed-receipt-parity-types` →
    `../sealed-receipt-parity-types`; the matrix import → `../sealed-receipt-parity`; `../src/fixtures/index`,
    `../src/hpke`, `../src/receipt-types`, `../src/verify` all stay).
  - `packages/verify/scripts/import-parity-fixtures.ts` (rewire `../src/fixtures/sealed-receipt-parity-types` →
    `../test/sealed-receipt-parity-types`).
- **Approach:** Move, don't rewrite. The runtime `src/` and `src/fixtures/` are untouched; the sdk client test and the
  verify runtime/fixture tests keep their imports. Because `files: ["src"]`, moving the three files into `test/` is
  sufficient to exclude them from the tarball and the vendor copy — no `.npmignore` needed.
- **Execution note:** Characterize-first (KTD8) — capture `bun test` green before the move, then move and re-run;
  reconcile only broken import paths.
- **Patterns to follow:** the current `packages/verify/test/*.test.ts` layout (tests already live in `test/`).
- **Test scenarios:**
  - Structural: `rg -l "mock-worker|sealed-receipt-parity" packages/verify/src` returns nothing; the three files exist
    under `packages/verify/test/`.
  - Guard: `@meum/verify` `package.json` `exports` has only `.` and `./fixtures`; `dependencies` is exactly
    `{@hpke/core}`.
  - Regression: `bun test` green — `mock-worker.test.ts` still serves every endpoint from the relocated file, and
    `sealed-receipt-parity.test.ts` still opens the CryptoKit matrix byte-exact.
  - Integration: the sdk client test still resolves `@meum/verify/fixtures` unchanged.
- **Verification:** `bun run typecheck` + `bun test` green; the vendored surface (`src/** + package.json`) no longer
  contains the harness or parity files, and `@meum/verify/fixtures` is unchanged.

### U2. Fix the doc drift and standardize the tag convention on `v*`

- **Goal:** README + release gates state the true dependency surface; every active tag reference is unprefixed `v*` so
  `v0.3.0` fires the pipeline.
- **Requirements:** R6, R7.
- **Dependencies:** none (parallel to U1).
- **Files:**
  - `README.md` (replace the 3 "zero-dependency" claims with the true surface — `@meum/verify` has a single runtime
    dependency `@hpke/core`; document 0.2.0 HPKE sealed-envelope support; update the two `sdk-v0.2.0` examples — the
    `git clone --branch` vendor line and the `KeyRevokeRequest` note — to `v0.3.0`).
  - `RELEASES-PREFLIGHT.md` (the "`@meum/verify` declares zero runtime dependencies" gate → "declares exactly
    `@hpke/core`"; add a first-publish check that the fixture private keys are test-only per KTD7).
  - `RELEASES-POSTFLIGHT.md` (the "stays zero-dependency / `dependencies` is empty" gate → "declares exactly
    `@hpke/core`"; its `releases/latest`/`git push` references already use `v<version>` — leave them).
  - `RELEASES.md` (no tag-form change — "Tagging and publishing" already says `git tag … v<version>`; add the KTD7
    no-op-is-actually-a-failure note + the real-publish-vs-tag-only decision to the runbook so the next cutter is not
    surprised).
  - `.github/workflows/release.yml` (no trigger change — `on.push.tags: v[0-9]+.[0-9]+.[0-9]+` already matches `v0.3.0`;
    apply the KTD7 fix only if the chosen release mode is tag-only: make the publish loop `exit 0` on empty
    `NODE_AUTH_TOKEN` and decouple `github-release` from publish success).
- **Approach:** Consumer-facing markdown + a possible workflow guard tweak → feature-branch + PR. Present-state prose
  only; the CHANGELOG records the change narrative. Run `/unslop` on reworded blocks before the PR.
- **Execution note:** Confirm `release.yml`'s `on:` pattern already matches `v0.3.0` (dry-check with `actionlint`)
  rather than editing the trigger. If tag-only publishing is chosen (KTD7), prefer a runtime check of the reworked
  workflow (empty-token path exits 0, `github-release` still runs) over unit coverage.
- **Test scenarios:**
  - Grep: no "zero-dependency" / "dependencies is empty" claim about `@meum/verify` remains in README or the gates.
  - Trigger: `v0.3.0` matches `release.yml`'s existing `on.push.tags` glob (no workflow edit required to confirm).
  - Doc consistency: `rg "sdk-v0" README.md RELEASES*.md` returns only intentional legacy-tag mentions; active tag
    examples read `v<version>`.
- **Verification:** `actionlint .github/workflows/release.yml` clean; README + gates describe the true surface; active
  tag references are uniformly `v*`; if tag-only mode was chosen, an empty-token run exits 0 and still creates the
  GitHub Release.

### U3. Add `cliff.toml`, bump to 0.3.0 (incl. root), fix the lockfile, and generate the CHANGELOG

- **Goal:** A committed `cliff.toml`, all version-bearing manifests at `0.3.0` with a matching `bun.lock`, and a
  generated `0.3.0` CHANGELOG section that includes the 0.2.0 work.
- **Requirements:** R8, R9.
- **Dependencies:** U1, U2 (versions + changelog reflect the final code + docs).
- **Files:**
  - `cliff.toml` (create at repo root: `[remote.github] owner = "meum-id", repo = "sdk"`; a `tag_pattern`/range that
    spans from `sdk-v0.1.0` so the `0.3.0` section covers the never-captured 0.2.0 work — KTD6).
  - `package.json` (root, private: `version` `0.1.0` → `0.3.0` so `release.yml`'s integrity check passes — KTD5).
  - `packages/verify/package.json`, `packages/sdk/package.json` (`version`: `0.3.0`).
  - `bun.lock` (hand-edit the `packages/*` workspace `version` entries to `0.3.0`; prove with `bun install
    --frozen-lockfile`).
  - `CHANGELOG.md` (generated — do not hand-write; hand-backfill the 0.2.0 bullets into the release-PR `## Changelog`
    only if the generator does not surface them — KTD6).
- **Approach:** Add `cliff.toml`, then follow `RELEASES.md` "Version bump": edit the three package.json versions (root +
  verify + sdk), hand-edit `bun.lock`, `bun install --frozen-lockfile`, `bun test test/lock-versions.test.ts`. Then run
  `scripts/generate-changelog.py` on the `release/v0.3.0` branch and confirm the `0.3.0` section spans `0.1.0..HEAD`; if
  the 0.2.0 PRs (#28–#35) predate the `## Changelog` PR-body discipline, backfill their bullets into the release-PR body
  which the generator re-fetches.
- **Execution note:** Release-prep unit; runs on the `release/v0.3.0` branch after the code PR merges to `dev`, per the
  runbook — not on the feature branch.
- **Test scenarios:**
  - `test/lock-versions.test.ts` passes: every `packages/*` version equals its `bun.lock` entry at `0.3.0`.
  - `release.yml`'s integrity check: `require('./package.json').version` (root) equals `0.3.0`.
  - `scripts/generate-changelog.py --check` runs (no "cliff.toml not found") and reports a versioned `0.3.0` section
    that includes the HPKE/revoke-proof/RP-keygen bullets.
  - `bun install --frozen-lockfile` accepts the hand-edited lock (no drift).
- **Verification:** `bun test` green; `cliff.toml` committed; root + workspace manifests at `0.3.0`; `CHANGELOG.md` has
  a `0.3.0` section covering the 0.2.0 + eviction surface; the lock matches.

---

## Verification Contract

| Gate                   | Command                                                                                                 | Applies to | Done signal                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| Lint/format            | `bunx biome check .`                                                                                    | all        | Clean                                                                 |
| Typecheck              | `bun run typecheck`                                                                                     | all        | No errors                                                             |
| Unit                   | `bun test`                                                                                              | U1, U3     | Green, incl. relocated harness tests + lock-versions                  |
| Vendored-surface check | `rg -l "mock-worker\|sealed-receipt-parity" packages/verify/src`                                        | U1         | Empty (harness gone from `src/`)                                      |
| Export-surface check   | `jaq -r '.exports \| keys[]' packages/verify/package.json`                                              | U1         | `.` and `./fixtures` only (no `./mock-worker`)                        |
| Doc-drift check        | `rg -i "zero-dependency\|dependencies is empty" README.md RELEASES-PREFLIGHT.md RELEASES-POSTFLIGHT.md` | U2         | Empty for `@meum/verify`                                              |
| Workflow lint          | `actionlint .github/workflows/release.yml`                                                              | U2         | Clean; `on.push.tags` matches `v0.3.0`                                |
| Root-version integrity | `node -p "require('./package.json').version"`                                                           | U3         | `0.3.0` (matches the tag `release.yml` gates on)                      |
| Lock parity            | `bun install --frozen-lockfile && bun test test/lock-versions.test.ts`                                  | U3         | Accepted; `packages/*` at `0.3.0`                                     |
| Changelog              | `scripts/generate-changelog.py --check`                                                                 | U3         | Runs (cliff.toml present); versioned `0.3.0` section incl. 0.2.0 work |

---

## Definition of Done

- `packages/verify/src` is the runtime verifier + `src/fixtures/`; `mock-worker.ts` and `sealed-receipt-parity*` live
  under `packages/verify/test/`; neither appears in `@meum/verify`'s `files`/`exports` or the vendored surface.
- `@meum/verify`'s `exports` are `.` and `./fixtures` only (no `./mock-worker`); `src/fixtures/index.ts` no longer
  re-exports the parity matrix; `@meum/verify/fixtures` and all consumer imports are unchanged.
- `@meum/verify` runtime deps stay `{@hpke/core}`; no new package created.
- Every pre-existing test is green after relocation + path-only rewiring; no coverage dropped or added.
- README + PREFLIGHT/POSTFLIGHT state the true dependency surface; no "zero-dependency" claim remains; HPKE is
  documented; active tag references are uniformly `v*` and `v0.3.0` fires `release.yml`.
- The chosen release mode is explicit: `NPM_TOKEN` set for a real publish, or `release.yml` reworked so a tag-only cut
  succeeds (no red publish job); PREFLIGHT confirms the fixture keys are test-only before any real publish.
- `cliff.toml` is committed; root + workspace manifests are `0.3.0`; `bun.lock` matches; `test/lock-versions.test.ts`
  and `release.yml`'s root-version check both pass; `CHANGELOG.md` has a generated `0.3.0` section covering the 0.2.0
  work + the eviction.
- `bun run typecheck` + `bun test` + `bunx biome check .` all green; `v0.3.0` is tagged.

---

## Open Questions

- **Real publish vs tag-only today (KTD7).** Set `NPM_TOKEN` for a real npm publish, or rework `release.yml` for a tag +
  GitHub-Release-only cut? A no-token cut red-fails as written. If real, PREFLIGHT must confirm the `src/fixtures/` test
  keys are used by no deployed demo/staging issuer or device, since the first `v0.3.0` publish ships `@meum/verify`
  (fixtures included) to public npm for the first time. Default: decide during PREFLIGHT; the eviction + docs land
  regardless.
- **CHANGELOG range (KTD6, decided-with-caveat).** `cliff.toml` must pin the range to span from `sdk-v0.1.0`, or
  git-cliff ranges from the newer `sdk-v0.2.0` tag and drops #28–#35. Confirm the actual range on the `release/v0.3.0`
  branch with `--dry-run`; hand-backfill the 0.2.0 bullets into the release-PR `## Changelog` if the PRs carry no `##
  Changelog` block.
- **meum-sites `mock-worker` usage.** Sites currently vendors `mock-worker.ts`. Dropping the `./mock-worker` export is
  safe for the api; confirm sites does not import it before the sites re-vendor (a sites-repo decision, flagged for the
  coordinated follow-on).
- **Semver (decided).** 0.3.0 (minor) matches the dropped `./mock-worker` export + trimmed `./fixtures` barrel; see
  KTD4.

---

## Sources / Research

- `packages/verify/src/**` and `test/**` (runtime vs shared-fixtures vs internal-harness split; clean one-way import DAG
  confirmed; the sdk client test and verify fixture tests consume `./fixtures`, which this plan leaves untouched).
- `packages/verify/package.json` (`exports` `.`/`./fixtures`/`./mock-worker`; deps `{@hpke/core}`),
  `packages/sdk/package.json`.
- `packages/verify/test/dependency-boundary.test.ts` (the runtime-allowlist guard, unchanged here),
  `test/lock-versions.test.ts`.
- `package.json` (root, `version: 0.1.0` — the value `release.yml`'s integrity check gates on).
- `.github/workflows/release.yml` (`on.push.tags: v[0-9]+…` already matches `v0.3.0`; root-version integrity gate;
  publish loop 401s + `exit 1` on empty token; `github-release` `needs: publish`).
- `scripts/generate-changelog.py` (`fail()`s with "cliff.toml not found" before `--check`; no `cliff.toml` committed;
  git-cliff ranges off git tags, and `sdk-v0.2.0` exists).
- `meum-api:scripts/check-verify-sync.ts` (the byte-for-byte drift guard: hashes `packages/verify/src/** + package.json`
  vs the pinned `sdk-v0.2.0` tag; the smell's origin; `SDK_TAG` re-vendor bump on the follow-on).
- `README.md`, `RELEASES-PREFLIGHT.md`, `RELEASES-POSTFLIGHT.md` ("zero-dependency" drift; empty-deps gates that would
  fail at 0.2.0; two `sdk-v0.2.0` README tag examples).
- `ce-doc-review` round 1 (feasibility, adversarial, security, product-lens, scope-guardian, coherence): the release
  blockers (root version, cliff.toml, no-token-fail), the surgical-vs-full-split verdict adopted as KTD1, and the
  CHANGELOG range correction.
