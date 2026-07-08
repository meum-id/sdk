# Meum SDK

Public, Apache-2.0 licensed contract seam for the Meum Phase-0 age-verification demo. This repo holds the wire schemas, the receipt and JWKS format, a zero-dependency reference offline receipt-verifier, and the relying-party client. It carries no PII.

## Packages

This is a Bun workspace monorepo. Three packages ship from `packages/`:

| Package           | Path                 | Role                                                                               |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `@meum/contracts` | `packages/contracts` | Zod wire schemas: endpoint payloads, predicate grammar, error codes, ID prefixes.  |
| `@meum/verify`    | `packages/verify`    | Zero-dependency offline receipt-verifier (WebCrypto ES256), fixtures, mock Worker. |
| `@meum/sdk`       | `packages/sdk`       | Relying-party (RP) client: sessions, deep links, receipt verification.             |

Packages ship TypeScript source directly (`exports` point at `src/`); Bun consumes them natively.

## Install (from git — not npm)

The packages are **not published to npm**. Consume them by cloning this repo at a frozen `sdk-v*` tag and referencing the workspace packages via `file:` paths. A bare `git` dependency does not resolve a Bun workspace subpackage, so the clone + `file:` path is the supported route:

```bash
git clone --branch sdk-v0.1.0 --depth 1 https://github.com/meum-id/sdk.git vendor/meum-sdk
```

```jsonc
// package.json of the consuming project
{
  "dependencies": {
    "@meum/contracts": "file:./vendor/meum-sdk/packages/contracts",
    "@meum/verify": "file:./vendor/meum-sdk/packages/verify",
    "@meum/sdk": "file:./vendor/meum-sdk/packages/sdk"
  },
  // Required: the vendored packages reference each other with the
  // `workspace:*` protocol, which Bun cannot resolve outside the vendored
  // workspace. The overrides redirect those specs to the same file: paths.
  "overrides": {
    "@meum/contracts": "file:./vendor/meum-sdk/packages/contracts",
    "@meum/verify": "file:./vendor/meum-sdk/packages/verify"
  }
}
```

Then `bun install`.

## Verifying a receipt offline

`@meum/verify` validates a device-signed receipt with **no Meum server in the path** — only the receipt, the RP's session expectations, and a JWKS document (or resolver):

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

The RP-side rules: the receipt is RP-bound (`aud`), single-session (`session_id` + `nonce`), short-lived (`exp`), and only `predicate_result: true` verifies. Track seen nonces yourself to reject replays.

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

- `@meum/verify/fixtures`: a valid receipt; invalid variants (bad signature, wrong `aud`, expired, wrong nonce, `predicate_result:false`, unknown `kid`); the device and issuer JWKS; a sealed-credential envelope with its matching X25519 test keypair; and the test signing keys.
- Mock Worker: every API endpoint served from fixtures. Run with `bun packages/verify/src/mock-worker.ts` (port 8788, override with `PORT`), or load `@meum/verify/mock-worker` under Miniflare/workerd.

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
- **Layout:** monorepo, `packages/{contracts,verify,sdk}`. `@meum/verify` has zero runtime dependencies by design.

## Plan

This repo implements the public-package portion of Plan A. The plan lives in the `meum-control` repo at `docs/plans/2026-07-06-001-feat-meum-demo-backend-contracts-plan.md`.

## Branch and release model

- `main` is the stable, published branch. It receives code only via PR from `release/*` branches.
- `dev` is the forever integration branch. Feature branches cut from `dev`, PR back to `dev` (squash merge).
- Release branches cut from `origin/main`, cherry-pick the non-docs commits from `dev`, then PR to `main`.
- Contract freezes are `sdk-vX.Y.Z` tags on `dev` merge commits. npm publishing is deferred; the `v*`-triggered `release.yml` stays inert until publishing is deliberately cleared (it will use npm trusted publishing / OIDC).
- Squash-only merges, delete-branch-on-merge.

Full runbook: [`RELEASES.md`](RELEASES.md). Rationale: [`RELEASES-RATIONALE.md`](RELEASES-RATIONALE.md). Pre-cut and post-tag checklists: [`RELEASES-PREFLIGHT.md`](RELEASES-PREFLIGHT.md) and [`RELEASES-POSTFLIGHT.md`](RELEASES-POSTFLIGHT.md).

## Local hooks

Git-native hooks live in `scripts/hooks/` and mirror CI. Activate once per clone:

```bash
git config core.hooksPath scripts/hooks
```

`pre-commit` runs Biome format and lint on staged files; `pre-push` runs lint, typecheck, and tests.

## License

[Apache-2.0](LICENSE).
