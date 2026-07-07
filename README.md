# Meum SDK

Public, Apache-2.0 licensed contract seam for the Meum Phase-0 age-verification demo. This repo holds the wire schemas,
the receipt and JWKS format, a zero-dependency reference offline receipt-verifier, and the relying-party client. It is
published to npm under the `@meum` scope and carries no PII.

## Packages

This is a Bun workspace monorepo. Three packages ship from `packages/`:

| Package          | Path                 | Role                                                                        |
| ---------------- | -------------------- | --------------------------------------------------------------------------- |
| `@meum/contracts`| `packages/contracts` | Zod wire schemas for the request/response contract.                         |
| `@meum/verify`   | `packages/verify`    | Zero-dependency reference offline receipt-verifier plus receipt/JWKS types. |
| `@meum/sdk`      | `packages/sdk`       | Relying-party (RP) client.                                                  |

## Stack

- **Runtime + tooling:** [Bun](https://bun.sh) (workspaces + test runner).
- **Lint + format:** [Biome](https://biomejs.dev).
- **Language:** TypeScript 5.6+, strict mode.
- **Layout:** monorepo, `packages/{contracts,verify,sdk}`.

The product source (packages, TypeScript, build scripts) is not in this repo yet. It is built later by another agent
against Plan A. The repo infrastructure here (config, governance docs, release quad, hooks, CI and release skeletons) is
pre-seeded so that build connects to a ready baseline.

## Plan

This repo implements the public-package portion of Plan A. The plan lives in the `meum-control` repo at
`docs/plans/2026-07-06-001-feat-meum-demo-backend-contracts-plan.md`.

## Branch and release model

- `main` is the stable, published branch. It receives code only via PR from `release/*` branches.
- `dev` is the forever integration branch. Feature branches cut from `dev`, PR back to `dev` (squash merge).
- Release branches cut from `origin/main`, cherry-pick the non-docs commits from `dev`, then PR to `main`.
- An annotated `v*` tag on `main` triggers CI to publish each package to npm with `--access public`.
- Squash-only merges, delete-branch-on-merge.

Full runbook: [`RELEASES.md`](RELEASES.md). Rationale: [`RELEASES-RATIONALE.md`](RELEASES-RATIONALE.md). Pre-cut and
post-tag checklists: [`RELEASES-PREFLIGHT.md`](RELEASES-PREFLIGHT.md) and
[`RELEASES-POSTFLIGHT.md`](RELEASES-POSTFLIGHT.md).

## Local hooks

Git-native hooks live in `scripts/hooks/` and mirror CI. They no-op until the toolchain and scaffolding are present, so
they are safe to enable now. Activate once per clone:

```bash
git config core.hooksPath scripts/hooks
```

`pre-commit` runs Biome format and lint on staged files; `pre-push` runs lint, typecheck, and tests. Both skip cleanly
while `package.json` is absent.

## License

[Apache-2.0](LICENSE).
