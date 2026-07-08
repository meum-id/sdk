# Plan A (Phase A1) — meum-sdk build learnings

Working notes for the U1–U4 build of `@meum/contracts`, `@meum/verify`, `@meum/sdk`. Decisions taken on plan-open details, resolved unknowns, and blockers with their fixes.

## Version pins

- Bun 1.3.14 (local + `bun-version: latest` in CI), TypeScript 5.9.3 (`^5.9.3`, satisfies the "5.6+" pin while staying on 5.x), Biome 2.5.1, Zod 4.5.0 (`^4.4.3`), Miniflare 4 + `@noble/{curves,ciphers,hashes}` as `@meum/verify` devDependencies only.
- All packages pinned at `0.1.0`; freeze tag `sdk-v0.1.0` on the dev merge commit.

## Decisions on plan-open details

- **Packages ship TypeScript source** (`exports` → `src/index.ts`, `files: ["src"]`). No build/dist step: Bun consumes TS natively and the demo consumers (Plan C via `file:` paths, Plan B reading fixtures) are Bun-side. Root `build` script aliases `typecheck` (nothing to emit) so the pre-seeded `release.yml` contract (`bun run build`) stays satisfiable.
- **SDK is zod-free at runtime.** Full zod in the bundle was 67.9KB gz (over the 50KB gate). `@meum/contracts` grew dependency-free subpath exports — `/claims` (NAMED_CLAIMS, MAX_CONJUNCTION_SIZE), `/codes` (ERROR_CODES, categories), `/ids` — and the SDK imports only those plus `import type` from the main entry. Client-side predicate and envelope validation are small structural checks. Result: 2.8KB gz.
- **ID prefixes include `rp_`** alongside the frozen four (`mm_`, `sess_`, `kid_`, `req_`): `rp_id` appears on the wire (`sessions/{id}` response, receipt `aud`), so the constant belongs in the SoT.
- **`app_attest` is optional** on `keys/register` (received-not-validated in the demo; a full-app registration path may omit it).
- **Nonce schema is an opaque string (min 16 chars)**, not `z.uuid()` — the backend implementation detail (`crypto.randomUUID()`) is not frozen into the wire contract.
- **Device JWKS response freezes `keys.length === 1`** (query-by-kid, no bulk listing). The verifier's own `Jwks` type accepts any array for generality.
- **`device_id` is an opaque device-chosen string** (no frozen prefix; none specified in the plan).
- **kyc_attestation payload shape is NOT in contracts** — on the wire it is a compact-JWS string; its claims are a Meum-internal matter between backend mint and backend verify (U10, Phase A2).
- **HKDF salt is empty/undefined** (RFC 5869 zero-salt) — the plan pins only the info string `meum-enrollment-v1`.
- **Mock Worker extras** (deterministic, beyond "return fixtures"): missing/invalid `Bearer mm_` on sessions/create → 401 code 1001; `sess_expired001` → 410; `kid_revoked001` revoke → 409; enrollment poll `device_pending_001` → 202 `{status:"pending"}`, unknown device → 410 (reusing code 2002); unknown route → 404 envelope code 7003.
- **Fixture timing** uses the plan's frozen example numbers: `iat 1751800000`, `exp 1751800300`, `FIXTURE_NOW 1751800060`; the expired variant sits 600s before NOW. Tests always pass `now` explicitly.
- **verify() reasons** beyond the plan's list: `malformed_receipt`, `unsupported_algorithm`, `key_not_active`, `wrong_session` (checked only when `expectedSessionId` is provided).
- **Fixtures are generated once and committed** (`packages/verify/scripts/generate-fixtures.ts`, WebCrypto P-256 + noble X25519/XChaCha20). Regeneration mints fresh key material — only rerun when the fixture set must change, and expect downstream cross-checks (Plan B Swift tests) to need the new values.

## Blockers hit and fixes

- **Bun isolated-linker resolution bug:** with Bun 1.3's default isolated installs, a repo-root `bun test` failed to resolve `@meum/contracts` from `packages/verify/test/*` while `bun test packages/verify` passed. Fix: `linker = "hoisted"` in `bunfig.toml`.
- **TS 5.9 `Uint8Array<ArrayBufferLike>` vs `BufferSource`:** WebCrypto params reject the generic default. Fix: `base64UrlToBytes` returns `Uint8Array<ArrayBuffer>`.
- **Miniflare smoke test** bundles the mock Worker with `Bun.build` (target browser, esm) and feeds the output to `new Miniflare({ modules: true, script })` — no scriptPath/temp file needed. The Bun-serve trailer in the mock Worker guards on `globalThis.Bun` + `import.meta.main`, so it parses clean under workerd.
- **`release.yml` stays inert:** it triggers on `v*` tags; the freeze tag is `sdk-v0.1.0`, which doesn't match the glob, and no `NPM_TOKEN` secret exists. Both conditions hold per decision-log entry 52.
- **`file:` consumption needs `overrides`:** a consumer's `bun install` fails on the vendored packages' `workspace:*` specs (`@meum/contracts@workspace:* failed to resolve`) even after installing the vendored workspace itself. Fix: the consumer's `package.json` adds an `overrides` block redirecting `@meum/contracts` and `@meum/verify` to the same `file:` paths (README documents the full recipe). Verified end-to-end from a scratch consumer: clean install, `verify()` accepts the valid fixture and rejects the wrong-aud fixture, `MeumClient.deepLink()`/`verifyReceipt()` work with an injected fetch.
- **Tag re-cut:** `sdk-v0.1.0` was re-pointed from the Phase-A1 squash commit to the merge that adds the `overrides` install recipe, before any downstream track had consumed or been notified of the tag. Package code is identical across both commits; only README/learnings differ.

## Frozen-contract cross-checks for B and C

- Receipt/JWKS/envelope shapes match the plan's "frozen contract set" section verbatim (snake_case wire).
- Plan B: read shapes from `packages/contracts/src/*.ts` and fixtures from `packages/verify/src/fixtures/*` — `test-keys.ts` carries the X25519 private key that opens `SEALED_CREDENTIAL`.
- Plan C: clone at `sdk-v0.1.0`, `file:` paths per README; `@meum/verify` works with zero further installs.
