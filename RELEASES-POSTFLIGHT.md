# Post-release verification: `@meum` SDK

Operational post-flight checklist. Runs **after** the `release/v<version> -> main` PR merges and you push the tag (`git
push origin main --tags`) per [`RELEASES.md` § Tagging and publishing](./RELEASES.md#tagging-and-publishing). Verifies
that the tag-triggered pipeline (`release.yml`) published every `@meum` package to npm and that the published versions
resolve for consumers.

Companion to [`RELEASES-PREFLIGHT.md`](./RELEASES-PREFLIGHT.md), which gates the release-branch cut. Both docs follow
the same go/no-go shape: every box is explicit, an unchecked or red item holds the next release (or motivates a hotfix).

## Quick start: run the automated gates

```bash
scripts/release/postflight.sh all
```

`scripts/release/postflight.sh` is vendored verbatim from the `github-repo-setup` skill. The gates that apply here are
`release` (the `release.yml` run for the tag concluded `success`), `make-latest` (the GitHub Release is non-draft,
non-prerelease, and `releases/latest` resolves to it), and `backport` (a merged PR to `dev` carries the tag in its
title). The `tap`, `finalize`, and `crates` gates belong to the Rust CLI chain and SKIP with a reason on this repo; the
npm-side checks below are human-driven. `--env` is irrelevant for this single-env repo. Re-run one gate with
`scripts/release/postflight.sh release|make-latest|backport`, or pass `--tag vX.Y.Z` to override the tag derived from
`package.json`.

## Checklist

Run immediately after the tag push triggers `release.yml`.

- [ ] **`release.yml` green end-to-end.** `gh run watch <id> --exit-status` then verify with `gh run view <id> --json
  conclusion --jq .conclusion` (a completed watcher is not a green watcher). The `publish` job verifies the tag commit
  is on `main` and the version match, builds every package, and runs `npm publish --access public` per `packages/*`; the
  `github-release` job then creates the GitHub Release for the tag. Run `scripts/release/postflight.sh release` for the
  automated check.

- [ ] **Every client package published at the new version.** For each of `@meum/verify`, `@meum/sdk`:

  ```bash
  npm view @meum/verify version   # expect <version>
  npm view @meum/sdk version
  ```

  Both report the new `<version>`, not the previous one. `@meum/contracts` is published from `meum-id/api`; it is not
  part of this repo's release.

- [ ] **Public access confirmed.** Each package resolves for an anonymous consumer (scoped packages default to
  restricted; a missing `--access public` publishes privately). `npm view @meum/<pkg>` succeeds without auth.

- [ ] **Tarball contents correct.** `npm pack @meum/<pkg>@<version>` (or inspect on npmjs.com) contains the built
  output, type declarations, LICENSE, and README, with no stray source, tests, or secrets.

- [ ] **`@meum/verify` declares exactly `@hpke/core`.** `npm view @meum/verify dependencies` lists `@hpke/core` and
  nothing else. The single-dependency surface is part of its published contract; any additional dependency is a
  release-blocking regression.

- [ ] **Fresh-install smoke on a clean environment.** In a throwaway directory (not a polluted local project):

  ```bash
  mkdir /tmp/meum-postflight && cd /tmp/meum-postflight
  npm init -y >/dev/null
  npm install @meum/sdk@<version> @meum/verify@<version>
  node -e "require('@meum/verify'); console.log('resolved')"
  ```

  Confirms the publish landed all package data and the client packages resolve against each other (and pull
  `@meum/contracts` from npm) against a real registry install, not just the local workspace.

- [ ] **GitHub Release is present and non-draft** for `v<version>`, created by the `github-release` job in
  `release.yml`, and `releases/latest` resolves to it: `gh api repos/meum-id/sdk/releases/latest --jq .tag_name` returns
  `v<version>`. Run `scripts/release/postflight.sh make-latest` for the automated check.

- [ ] **Last-good identifier recorded.** Before the release goes live, note the previous published version of each
  client package (`npm view @meum/<pkg> dist-tags.latest` before the tag push) somewhere reachable under incident
  pressure, so a rollback is a single command. Commands are in
  [`RELEASES.md` § Rollback commands](./RELEASES.md#rollback-commands).

- [ ] **Rollback path confirmed.** If this release is bad, re-point the `latest` dist-tag at the last-good version and
  deprecate the bad one first, then land a `fix` or `revert` through the normal `dev` to `release/*` to `main` flow so
  `main` reconverges with what `latest` resolves to.

- [ ] **Backport `main` -> `dev`** via a **merged PR to `dev` with the tag in its title.** Run
  `scripts/sync-dev-after-release.sh v<version>` to bring the release bookkeeping (`CHANGELOG.md`, `cliff.toml`, the
  root and `packages/*` manifests, `bun.lock`) to `dev` via a PR; the script titles it `chore(release): sync dev after
  v<version>`. Keeps the next release's overlay verification line A quiet so a real missed change stands out instead of
  hiding in expected divergence noise. The gate (`scripts/release/postflight.sh backport`) looks for the merged PR
  alone, since which files moved varies release to release. Confirm the sync PR merged to `dev`.

## Related docs

- [`RELEASES-PREFLIGHT.md`](./RELEASES-PREFLIGHT.md): pre-cut go/no-go checklist (runs BEFORE this one).
- [`RELEASES.md`](./RELEASES.md): operational runbook for the full release lifecycle.
- [`RELEASES-RATIONALE.md`](./RELEASES-RATIONALE.md): release-flow rationale.
