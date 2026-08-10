# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-08-10

### Added

- Add `RevokeProofPayloadSchema`, `RevokePurposeSchema`, and `REVOKE_PURPOSES` to `@meum/contracts`: the claim set (`kid`, `iat`, `jti`, `purpose`) the device signs when revoking a key. by @brettdavies in [#19](https://github.com/meum-id/sdk/pull/19)
- Add a lock-consistency test that fails CI when a `packages/*/package.json` version disagrees with its `workspaces` entry in `bun.lock`. by @brettdavies in [#21](https://github.com/meum-id/sdk/pull/21)
- Add sealed-receipt v2 envelope types and frozen HPKE constants to the `@meum/verify` public surface. by @brettdavies in [#28](https://github.com/meum-id/sdk/pull/28)
- Add sealed-receipt (v2) verification: HPKE open plus inner-JWS checks, thumbprint validation, and an `acceptedVersions` downgrade gate. by @brettdavies in [#29](https://github.com/meum-id/sdk/pull/29)
- Add `sealToRecipient` / `openFromEnvelope` / `computeJwkThumbprint` helpers shared by the RP callback, demo, and parity harness.
- Add `@hpke/core` as the package's single runtime dependency, lazy-loaded so v1-only consumers never download it.
- Add RP encryption-key lifecycle helpers: keypair generation with thumbprint `kid`, public-JWK export, rotation with retention, and key-domain registration via the client. by @brettdavies in [#31](https://github.com/meum-id/sdk/pull/31)

### Changed

- Change the release pipeline to verify the tag (on `main`, version match) before publishing to npm, and to create the GitHub Release after the publish. by @brettdavies in [#15](https://github.com/meum-id/sdk/pull/15)
- Require `proof` on `KeyRevokeRequest`: a compact JWS signed by the device key being revoked. A proofless revoke fails contract validation. by @brettdavies in [#19](https://github.com/meum-id/sdk/pull/19)
- Change `@meum/sdk` and `@meum/verify` to depend on the published `@meum/contracts` from npm; the in-repo contracts package is removed. by @brettdavies in [#24](https://github.com/meum-id/sdk/pull/24)
- Remove the `./mock-worker` export from `@meum/verify`: the mock Worker and the sealed-receipt parity harness move to the sdk repo's internal test tree, so the published package ships exactly the runtime verifier and shared fixtures. by @brettdavies in [#42](https://github.com/meum-id/sdk/pull/42)

### Fixed

- Fix key-domain registration sending a bare host instead of the https origin the API requires; registration now works against a real backend. by @brettdavies in [#33](https://github.com/meum-id/sdk/pull/33)

### Documentation

- Add `CONCEPTS.md`, a shared domain glossary seeded with the contract-seam and key-revocation vocabulary. by @brettdavies in [#20](https://github.com/meum-id/sdk/pull/20)
- Fix the RELEASES.md version-bump step: edit the `workspaces` version fields in `bun.lock` directly and verify with `bun install --frozen-lockfile`; `bun install` does not rewrite them.
- Add References entries in AGENTS.md for `CONCEPTS.md` and the `docs/solutions/` knowledge store.
- Direct agents to always search the `meum` collection (`-c meum`) alongside `solutions` when invoking `qmd` from this repo. by @brettdavies in [#27](https://github.com/meum-id/sdk/pull/27)
- Add Control brand-canon symlinks and AGENTS load notes for package and developer docs by @brettdavies in [#32](https://github.com/meum-id/sdk/pull/32)
- Add `CLAUDE.md` that imports `AGENTS.md`, loading repo rules into Claude Code sessions. by @brettdavies in [#41](https://github.com/meum-id/sdk/pull/41)
- Change the qmd rule to require both the `solutions` and `meum` collections on every invocation.
- Correct README and the release gates to state `@meum/verify`'s single runtime dependency (`@hpke/core`), document HPKE sealed-receipt verification, and use unprefixed `v*` tag examples. by @brettdavies in [#42](https://github.com/meum-id/sdk/pull/42)
- Document the real-publish vs tag-only release modes in RELEASES.md and add a first-publish PREFLIGHT check that the fixture private keys are test-only.

**Full Changelog**: [sdk-v0.1.0...v0.3.0](https://github.com/meum-id/sdk/compare/sdk-v0.1.0...v0.3.0)

## [0.1.0] - 2026-07-07

First frozen contract set for the Phase-0 demo. Consumed via git clone at this tag + `file:` paths (not npm).

### Added

- `@meum/contracts` 0.1.0: Zod wire schemas for every `/v1` endpoint payload (sessions, keys, events, enrollment, JWKS, receipt), the bounded predicate grammar (7 named claims, `all_of` of 1–3 unique claims), the error envelope with frozen numeric codes, and ID-prefix constants. Zod-free subpath exports (`/claims`, `/codes`, `/ids`) for runtime consumers.
- `@meum/verify` 0.1.0: zero-runtime-dependency offline receipt verifier (`verify()`, WebCrypto ES256), receipt/JWKS types, deterministic fixtures (valid receipt, six invalid variants, device + issuer JWKS, sealed credential with X25519 test keypair), and a mock Worker covering every endpoint (runnable via `bun` or Miniflare).
- `@meum/sdk` 0.1.0: relying-party client — `createSession()`, `deepLink()`, `verifyReceipt()` with a per-kid 1h JWKS cache and force-refresh on a cached miss, typed errors, camelCase↔snake_case boundary transforms. Bundle gated at <50KB gzipped in CI (currently ~3KB).
