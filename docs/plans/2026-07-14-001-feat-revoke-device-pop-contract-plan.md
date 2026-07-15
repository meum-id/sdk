---
title: "feat: revoke device proof-of-possession — contract (KeyRevokeRequest proof field)"
date_created: 2026-07-14
status: active
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
plan_track: U9-device-pop-revoke
related:
  - "meum-id/api docs/plans/2026-07-14-002-feat-revoke-device-pop-verify-plan.md"
  - "meum-id/ios docs/plans/2026-07-14-001-feat-revoke-device-pop-signing-plan.md"
  - "meum-id/api docs/plans/2026-07-14-001-feat-api-prod-and-demo-access-plan.md (parent U9)"
tags: [meum-mvp, contracts, revoke, device-pop, frozen-seam]
---

# feat: revoke device proof-of-possession — contract

> **Target repo:** `meum-id/sdk` (this repo, `@meum/contracts`). This is one of three cross-referencing plans for U9 (device proof-of-possession on the key-revoke route). It defines the wire contract that the api (verifier) and iOS (signer) both depend on, so it **lands first**. It runs in its own session; there is no orchestrator plan. Sibling plans: `meum-id/api docs/plans/2026-07-14-002-…-verify-plan.md`, `meum-id/ios docs/plans/2026-07-14-001-…-signing-plan.md`. Parent: `meum-id/api docs/plans/2026-07-14-001-feat-api-prod-and-demo-access-plan.md` U9.

---

## Summary

`POST /v1/keys/{kid}/revoke` is unauthenticated today, and `kid` is public, so exposing `api.meum.id` would expose a
public destructive endpoint. The fix is device proof-of-possession: the device signs a canonical revoke payload with the
private key for the kid being revoked, and the api verifies it against that kid's stored public key. This plan adds the
`proof` field to `KeyRevokeRequestSchema` and defines the canonical proof payload so the api and iOS agree on exactly
what is signed and verified. It is the shared frozen-seam bump; the api-verify and iOS-signing plans depend on it.

---

## Problem frame and scope boundary

- **In scope:** add a `proof` field to `KeyRevokeRequestSchema`; define the revoke-proof payload shape and the `purpose`
  enum; export the types; re-tag the frozen seam and document propagation to consumers.
- **Out of scope:** the verification logic (api plan) and the signing logic (iOS plan); any change to other contracts;
  npm publishing (the seam is consumed vendored, not published — consumers re-vendor).
- **Invariant:** this is the frozen contract seam (`sdk-v0.1.x`). Any change here is a deliberate re-cut that both
  consumer repos must re-vendor. Keep the change minimal and additive.

---

## Key technical decisions

- **KTD1 — Proof encoding is a compact JWS (ES256), matching receipts.** The device already produces compact-JWS ES256
  receipts, and the codebase is JWT-everywhere (issuer credential, receipts). So `proof` is a compact-JWS string signed
  by the device key. Rejected alternative: a detached `{timestamp, nonce, signature}` object — it duplicates JWS
  machinery the device and api already have and drifts from the receipt pattern.
- **KTD2 — Payload claims: `{ kid, iat, jti, purpose }`.** `kid` binds the proof to the key being revoked (must match
  the URL path and the JWS header kid). `iat` and `jti` support anti-replay (the api owns the policy). `purpose`
  distinguishes a live self-revoke from a pre-signed migration token: `purpose ∈ { "revoke", "migration_to_full_app" }`.
  The top-level `reason` field stays (human/audit reason); `proof` is added alongside it.
- **KTD3 — Frozen-seam re-cut and propagation.** This bumps the contract; re-tag the seam (`sdk-v0.1.x` → the next tag
  on the new commit). Because consumers vendor rather than npm-install (Bun cannot resolve the vendored `workspace:*`;
  see the parent plan and repo README), document that `meum-id/api` and `meum-id/ios` must re-vendor the new contract.
  Keep backward-compat framing explicit: the `proof` field is **required** on the new contract version (the api rejects
  a proofless revoke), which is the intended breaking behavior.

---

## Implementation units

### U1. Add the revoke-proof payload schema and the purpose enum

- **Goal:** a validated schema for the JWS payload the device signs, plus the `purpose` enum.
- **Dependencies:** none.
- **Files:** `packages/contracts/src/keys.ts` (add `RevokeProofPayloadSchema`, `RevokePurpose`),
  `packages/contracts/test/keys.test.ts`.
- **Approach:** define `RevokePurpose = z.enum(['revoke', 'migration_to_full_app'])` and `RevokeProofPayloadSchema =
  z.object({ kid, iat, jti, purpose })` with the existing id/time schema types the file already uses. This schema
  documents the claim set; the api validates decoded proofs against it and iOS builds to it.
- **Test scenarios:** a well-formed payload validates; an unknown `purpose` is rejected; a missing `kid`/`iat`/`jti` is
  rejected; the type infers correctly.
- **Verification:** the contracts test suite covers the payload schema and the enum; `tsc` clean.

### U2. Add `proof` to `KeyRevokeRequestSchema` and export the types

- **Goal:** the wire request carries the device proof.
- **Dependencies:** U1.
- **Files:** `packages/contracts/src/keys.ts` (extend `KeyRevokeRequestSchema` with `proof: z.string()` — the compact
  JWS), `packages/contracts/src/index.ts` (export `RevokeProofPayloadSchema`, `RevokePurpose`),
  `packages/contracts/test/keys.test.ts`.
- **Approach:** add `proof: z.string().min(1)` alongside the existing `reason`. Do not decode/verify here (that is the
  api's job) — the contract only asserts the field is present and a string. Export the payload schema and enum so both
  consumers import one source of truth.
- **Test scenarios:** `{ reason, proof }` validates; a request missing `proof` is rejected; a request missing `reason`
  is rejected (unchanged); an empty-string `proof` is rejected.
- **Verification:** the suite passes; the exported types are importable; `tsc` clean.

### U3. Re-cut the frozen seam and document propagation

- **Goal:** consumers can pick up the new contract deterministically.
- **Dependencies:** U1, U2.
- **Files:** the contracts package version, `README.md`/`CHANGELOG.md` (or the release quad), the seam tag.
- **Approach:** bump the contracts version, re-tag the seam on the new commit, and add a short propagation note:
  `meum-id/api` and `meum-id/ios` re-vendor `@meum/contracts` at the new tag; the api rejects a proofless revoke from
  the new version onward. Follow the repo's existing release/tagging convention.
- **Test expectation:** none (release/config). **Verification:** the new tag exists on the commit carrying U1/U2; the
  README/overrides note names the new tag; consumers can vendor it.

---

## Verification contract / Definition of Done

- `KeyRevokeRequestSchema` requires `proof` (a non-empty compact-JWS string) alongside `reason`;
  `RevokeProofPayloadSchema` and `RevokePurpose` are defined, tested, and exported.
- The seam is re-tagged on the commit carrying the change, with a propagation note for the api and iOS consumers.
- `tsc` and the contracts test suite are green.

---

## Cross-plan dependencies

- **Downstream:** `meum-id/api docs/plans/2026-07-14-002-…-verify-plan.md` (imports
  `RevokeProofPayloadSchema`/`RevokePurpose`, verifies the proof) and `meum-id/ios
  docs/plans/2026-07-14-001-…-signing-plan.md` (builds the proof to this shape). Both re-vendor the re-cut seam.
- **This plan lands first.** The api and iOS plans should not start their contract-consuming units until this seam is
  re-tagged.

## Sources

- `packages/contracts/src/keys.ts` (`KeyRevokeRequestSchema`, current `{reason}` shape),
  `packages/contracts/src/jwks.ts` (`DeviceJwk`, ES256 P-256), `packages/contracts/src/receipt.ts` (the compact-JWS
  receipt precedent).
- Parent design: `meum-id/api docs/plans/2026-07-14-001-feat-api-prod-and-demo-access-plan.md` U9; the U9 investigation
  (iOS `dev` `6d6198e`; api `device-keys.ts` stores the public JWK; `jose` + `crypto.subtle` P-256 already present).
