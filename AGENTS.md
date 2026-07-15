---
name: meum-sdk
description: Public Apache-2.0 Meum SDK monorepo. Zod wire contracts, a zero-dependency reference offline receipt-verifier, and the relying-party client, published to npm under @meum.
homepage: https://github.com/meum-id/sdk
repository: https://github.com/meum-id/sdk
---

# `@meum` SDK

Agent instructions for the public Meum SDK monorepo. Read this before writing code or changing infrastructure.

## What this repo is

The published contract seam for the Meum Phase-0 age-verification demo. It ships three npm packages under the `@meum`
scope:

- `@meum/contracts` (`packages/contracts`): Zod wire schemas for the request/response contract.
- `@meum/verify` (`packages/verify`): zero-dependency reference offline receipt-verifier plus receipt/JWKS types.
- `@meum/sdk` (`packages/sdk`): relying-party (RP) client.

## Public boundary and PII

This repo is **public** and **Apache-2.0**. It holds **no PII**: only wire schemas, format definitions, verification
logic, and a client. Keep it that way. Nothing account-specific, tenant-specific, or holder-specific belongs in this
repo or its git history. The verifier is offline and reference-grade; it does not phone home.

## The plan this repo implements

This repo builds the public-package portion of Plan A. The plan lives in the `meum-control` repo at
`docs/plans/2026-07-06-001-feat-meum-demo-backend-contracts-plan.md`. That plan is the source of truth for the package
surface, schema shapes, and the receipt/JWKS format. Do not fetch it from here; reference it.

## Stack and conventions

- **Runtime + tooling:** Bun (workspaces + test runner). Use `bun install`, `bun run <script>`, `bun test`.
- **Lint + format:** Biome (`biome check --write`). One config at the repo root drives every package.
- **Language:** TypeScript 5.6+, strict mode.
- **Layout:** monorepo, `packages/{contracts,verify,sdk}`. `@meum/verify` stays zero-dependency by design; do not add
  runtime dependencies to it.
- **Commits:** Conventional Commits. No AI attribution in commits or PR bodies.

## Infrastructure is pre-seeded: connect to it, do not recreate it

The repo infrastructure is already in place. When you add the build, wire your `package.json` scripts to the existing
hooks and CI rather than replacing them:

- **CI** (`.github/workflows/ci.yml`) runs `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, and
  `bun test`. Each step guards on `package.json` and no-ops until the scaffolding lands. Define `lint`, `typecheck`, and
  `build` scripts in the root `package.json` so these steps do real work. Once green, add the `ci / Lint, typecheck,
  test` context to `.github/rulesets/protect-main.json` to make it a required check.
- **Release** (`.github/workflows/release.yml`) publishes each `packages/*` to npm on a `v*` tag. Add the `NPM_TOKEN`
  secret (or switch to npm Trusted Publishing / OIDC) and ensure each `package.json` sets `"publishConfig": {"access":
  "public"}` before the first real tag.
- **Hooks** (`scripts/hooks/pre-commit`, `scripts/hooks/pre-push`) mirror CI locally and no-op until `package.json`
  exists. Activate with `git config core.hooksPath scripts/hooks`.
- **Release quad** (`RELEASES.md`, `RELEASES-RATIONALE.md`, `RELEASES-PREFLIGHT.md`, `RELEASES-POSTFLIGHT.md`) plus
  `scripts/generate-changelog.py` and `scripts/sync-dev-after-release.sh` govern the cut. Do not invent a parallel
  release path.

Do not recreate governance files (`CODEOWNERS`, `.github/dependabot.yml`, `.github/pull_request_template.md`,
`.markdownlint-cli2.yaml`, the guard workflows, or the rulesets under `.github/rulesets/`).

## Branch model

- `main`: stable, published. Receives code only via PR from `release/*`.
- `dev`: forever integration branch. Feature branches cut from `dev`, PR back to `dev` (squash merge).
- `release/vX.Y.Z`: cut from `origin/main`, cherry-pick the non-docs commits from `dev`, PR to `main`.
- Engineering docs (`docs/plans/`, `docs/solutions/`, `docs/brainstorms/`, `docs/reviews/`) live on `dev` only.
  `guard-main-docs.yml` blocks them from `main`, and `guard-release-branch.yml` rejects any PR to `main` whose head is
  not `release/*`.

## Releasing

See [`RELEASES.md`](RELEASES.md) for the runbook, [`RELEASES-PREFLIGHT.md`](RELEASES-PREFLIGHT.md) for the pre-cut
checklist, [`RELEASES-POSTFLIGHT.md`](RELEASES-POSTFLIGHT.md) for post-tag verification, and
[`RELEASES-RATIONALE.md`](RELEASES-RATIONALE.md) for the why. Short version: feature branch to `dev` (squash),
cherry-pick to `release/vX.Y.Z` cut from `main`, PR to `main` (squash), annotated tag push triggers `release.yml` and
publishes to npm.

## References

- [`README.md`](README.md): what the packages are, the stack, hook activation.
- [`RELEASES.md`](RELEASES.md): release runbook.
- `meum-control` `docs/plans/2026-07-06-001-feat-meum-demo-backend-contracts-plan.md`: the plan this repo implements.
- [`CONCEPTS.md`](CONCEPTS.md): shared domain vocabulary (entities, named processes, status concepts); relevant when
  orienting to the codebase or discussing domain concepts.
- `docs/solutions/`: documented solutions to past problems (bugs, best practices, workflow patterns), organized by
  category with YAML frontmatter (`module`, `tags`, `problem_type`); a local symlink to a shared private corpus, present
  on dev workstations only.
