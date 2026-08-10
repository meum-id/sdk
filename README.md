# Meum SDK

Public, Apache-2.0 licensed client repo for the Meum Phase-0 age-verification demo. This repo holds a reference offline
receipt-verifier with a single runtime dependency (`@hpke/core`) and the relying-party client. The wire contract
(`@meum/contracts`) is sourced as a published npm dependency, owned and published by `meum-id/api`. This repo carries no
PII.

## Packages

This is a Bun workspace monorepo. Two client packages ship from `packages/`:

| Package        | Path              | Role                                                                                     |
| -------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| `@meum/verify` | `packages/verify` | Offline receipt-verifier (WebCrypto ES256, HPKE sealed receipts), fixtures, mock Worker. |
| `@meum/sdk`    | `packages/sdk`    | Relying-party (RP) client: sessions, deep links, receipt verification.                   |

Both packages ship TypeScript source directly (`exports` point at `src/`); Bun consumes them natively. They depend on
`@meum/contracts` (`^0.2.0`), which resolves from the public npm registry.

## The wire contract

`@meum/contracts` — the Zod wire schemas (endpoint payloads, predicate grammar, error codes, ID prefixes) — is owned and
published by `meum-id/api`, which is its reference implementation. It is a public npm package (`@meum` scope): consumers
resolve `@meum/contracts` from npm anonymously, with no auth token, no scoped `.npmrc`, and no private-registry config.
The client packages here consume it as a normal versioned dependency; a contract bump surfaces as a dependency update.

The standalone-contracts extraction trigger — extract `@meum/contracts` to its own repo when a second independent server
implementation appears — is recorded in the canonical ADR in `meum-id/api`
(`docs/adr/0001-contracts-ownership-and-extraction-trigger.md`).

## Install

The client packages are consumed by cloning this repo at a frozen `v*` tag and referencing them via `file:` paths; a
bare `git` dependency does not resolve a Bun workspace subpackage. `@meum/contracts` resolves from npm, so no `file:`
entry or override redirects the contract:

```bash
git clone --branch v0.3.0 --depth 1 https://github.com/meum-id/sdk.git vendor/meum-sdk
```

```jsonc
// package.json of the consuming project
{
  "dependencies": {
    "@meum/contracts": "^0.2.0",
    "@meum/verify": "file:./vendor/meum-sdk/packages/verify",
    "@meum/sdk": "file:./vendor/meum-sdk/packages/sdk"
  },
  // Required: the vendored client packages reference `@meum/verify` with the
  // `workspace:*` protocol, which Bun cannot resolve outside the vendored
  // workspace. This override redirects that spec to the file: path.
  // `@meum/contracts` needs no override — it resolves from npm.
  "overrides": {
    "@meum/verify": "file:./vendor/meum-sdk/packages/verify"
  }
}
```

Then `bun install` (the public npm registry must be reachable).

Each `v*` tag is a deliberate contract re-cut: consumers (`meum-id/api`, `meum-id/ios`) pick up a new contract by
re-vendoring at the new tag. At `v0.3.0`, `KeyRevokeRequest` requires `proof`: a compact JWS signed by the device key
being revoked, with claims per `RevokeProofPayload` (`kid`, `iat`, `jti`, `purpose`); the backend rejects a proofless
revoke.

## Verifying a receipt offline

`@meum/verify` validates a device-signed receipt with **no Meum server in the path** — only the receipt, the RP's
session expectations, and a JWKS document (or resolver):

```ts
import { verify } from '@meum/verify';

const result = await verify(receiptJwt, {
  jwksResolver: async (kid) => {
    const res = await fetch(`https://api.meum.id/v1/.well-known/jwks.json?kid=${kid}`);
    return res.status === 404 ? null : res.json();
  },
  expectedAudience: 'rp_example_123', // your rp_id
  expectedNonce: sessionNonce, // from the session you created
  expectedSessionId: sessionId,
});

if (result.valid) {
  // result.predicate_result === true; the holder satisfied the predicate
} else {
  // result.reason: 'bad_signature' | 'wrong_audience' | 'expired' | 'wrong_nonce' | ...
}
```

The RP-side rules: the receipt is RP-bound (`aud`), single-session (`session_id` + `nonce`), short-lived (`exp`), and
only `predicate_result: true` verifies. Track seen nonces yourself to reject replays.

Version 2 receipts are sealed: the signed receipt arrives inside an HPKE envelope (`HPKE-P256-SHA256-A256GCM`, via
`@hpke/core`, the verifier's single runtime dependency). Pass `recipientKey`, the RP's P-256 private JWK, and `verify`
opens the envelope before checking the inner receipt; the outer session id and nonce bind as HPKE `aad`, so a sealed
receipt only opens for the session it was issued to. `acceptedVersions` narrows which receipt versions the RP accepts,
and the sealing primitives (`sealToRecipient`, `openFromEnvelope`) are exported for tests and tooling.

The higher-level client wraps the same verifier with a per-kid JWKS cache (1h, force-refresh on a cached miss):

```ts
import { MeumClient } from '@meum/sdk';

const meum = new MeumClient({ apiKey: 'mm_...' });
const session = await meum.createSession({
  predicate: { allOf: ['age_over_18', 'locale_US_CA'] },
  returnUrl: 'https://rp.example.com/verify/callback',
});
const link = meum.deepLink(session.sessionId);
const result = await meum.verifyReceipt(receiptJwt, {
  expectedAudience: 'rp_example_123',
  expectedNonce: session.nonce,
  expectedSessionId: session.sessionId,
});
```

## Fixtures and the mock Worker

`@meum/verify` ships deterministic stubs so downstream tracks develop with no live backend:

- `@meum/verify/fixtures`: a valid receipt; invalid variants (bad signature, wrong `aud`, expired, wrong nonce,
  `predicate_result:false`, unknown `kid`); the device and issuer JWKS; a sealed-credential envelope with its matching
  X25519 test keypair; and the test signing keys.
- Mock Worker: every API endpoint served from fixtures. Run with `bun packages/verify/src/mock-worker.ts` (port 8788,
  override with `PORT`), or load `@meum/verify/mock-worker` under Miniflare/workerd.

## Development

```bash
bun install
bun run lint       # Biome
bun run typecheck  # tsc --noEmit
bun test           # includes the <50KB gz bundle gate and Miniflare smoke test
```

## Stack

- **Runtime + tooling:** [Bun](https://bun.sh) (workspaces + test runner).
- **Lint + format:** [Biome](https://biomejs.dev).
- **Language:** TypeScript 5.6+, strict mode.
- **Layout:** monorepo, `packages/{verify,sdk}`. `@meum/verify` declares exactly one runtime dependency, `@hpke/core`;
  `@meum/contracts` is a published npm dependency owned by `meum-id/api`.

## Branch and release model

- `main` is the stable, published branch. It receives code only via PR from `release/*` branches.
- `dev` is the forever integration branch. Feature branches cut from `dev`, PR back to `dev` (squash merge).
- Release branches cut from `origin/main`, cherry-pick the non-docs commits from `dev`, then PR to `main`.
- Client freezes are annotated `vX.Y.Z` tags on `main`, cut through `release/*` branches per the runbook. A tag push
  triggers `release.yml`, which publishes each package to npm and requires the `NPM_TOKEN` secret (or npm trusted
  publishing / OIDC); a cut without the token fails the publish job rather than no-opping. `@meum/contracts` publishes
  separately from `meum-id/api`.
- Squash-only merges, delete-branch-on-merge.

Full runbook: [`RELEASES.md`](RELEASES.md). Rationale: [`RELEASES-RATIONALE.md`](RELEASES-RATIONALE.md). Pre-cut and
post-tag checklists: [`RELEASES-PREFLIGHT.md`](RELEASES-PREFLIGHT.md) and
[`RELEASES-POSTFLIGHT.md`](RELEASES-POSTFLIGHT.md).

## Local hooks

Git-native hooks live in `scripts/hooks/` and mirror CI. Activate once per clone:

```bash
git config core.hooksPath scripts/hooks
```

`pre-commit` runs Biome format and lint on staged files; `pre-push` runs lint, typecheck, and tests.

## License

[Apache-2.0](LICENSE).
