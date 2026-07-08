# Changelog

## sdk-v0.1.0 — 2026-07-07

First frozen contract set for the Phase-0 demo. Consumed via git clone at this tag + `file:` paths (not npm).

### Added

- `@meum/contracts` 0.1.0: Zod wire schemas for every `/v1` endpoint payload (sessions, keys, events, enrollment, JWKS, receipt), the bounded predicate grammar (7 named claims, `all_of` of 1–3 unique claims), the error envelope with frozen numeric codes, and ID-prefix constants. Zod-free subpath exports (`/claims`, `/codes`, `/ids`) for runtime consumers.
- `@meum/verify` 0.1.0: zero-runtime-dependency offline receipt verifier (`verify()`, WebCrypto ES256), receipt/JWKS types, deterministic fixtures (valid receipt, six invalid variants, device + issuer JWKS, sealed credential with X25519 test keypair), and a mock Worker covering every endpoint (runnable via `bun` or Miniflare).
- `@meum/sdk` 0.1.0: relying-party client — `createSession()`, `deepLink()`, `verifyReceipt()` with a per-kid 1h JWKS cache and force-refresh on a cached miss, typed errors, camelCase↔snake_case boundary transforms. Bundle gated at <50KB gzipped in CI (currently ~3KB).
