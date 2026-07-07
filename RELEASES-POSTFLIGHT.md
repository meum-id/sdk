# Post-release verification: `@meum` SDK

Operational post-flight checklist. Runs **after** the `release/v<version> -> main` PR merges and you push the tag (`git
push origin v<version>`) per [`RELEASES.md` § Tagging and publishing](./RELEASES.md#tagging-and-publishing). Verifies
that the tag-triggered pipeline (`release.yml`) published every `@meum` package to npm and that the published versions
resolve for consumers.

Companion to [`RELEASES-PREFLIGHT.md`](./RELEASES-PREFLIGHT.md), which gates the release-branch cut. Both docs follow
the same go/no-go shape: every box is explicit, an unchecked or red item holds the next release (or motivates a hotfix).

## Checklist

Run immediately after the tag push triggers `release.yml`.

- [ ] **`release.yml` green end-to-end.** `gh run watch <id> --exit-status` then verify with `gh run view <id> --json
  conclusion --jq .conclusion` (a completed watcher is not a green watcher). The run builds every package and runs `npm
  publish --access public` per `packages/*`.

- [ ] **Every package published at the new version.** For each of `@meum/contracts`, `@meum/verify`, `@meum/sdk`:

  ```bash
  npm view @meum/contracts version   # expect <version>
  npm view @meum/verify version
  npm view @meum/sdk version
  ```

  All three report the new `<version>`, not the previous one.

- [ ] **Public access confirmed.** Each package resolves for an anonymous consumer (scoped packages default to
  restricted; a missing `--access public` publishes privately). `npm view @meum/<pkg>` succeeds without auth.

- [ ] **Tarball contents correct.** `npm pack @meum/<pkg>@<version>` (or inspect on npmjs.com) contains the built output,
  type declarations, LICENSE, and README, with no stray source, tests, or secrets.

- [ ] **`@meum/verify` stays zero-dependency.** `npm view @meum/verify dependencies` is empty. The zero-dependency
  guarantee is part of its published contract; a leaked transitive dependency is a release-blocking regression.

- [ ] **Fresh-install smoke on a clean environment.** In a throwaway directory (not a polluted local project):

  ```bash
  mkdir /tmp/meum-postflight && cd /tmp/meum-postflight
  npm init -y >/dev/null
  npm install @meum/sdk@<version> @meum/verify@<version> @meum/contracts@<version>
  node -e "require('@meum/verify'); console.log('resolved')"
  ```

  Confirms the publish landed all package data and the packages resolve against each other and against a real registry
  install, not just the local workspace.

- [ ] **GitHub Release (if the workflow creates one) is present and non-draft** for `v<version>`, and
  `releases/latest` resolves to it: `gh api repos/meum-id/sdk/releases/latest --jq .tag_name` returns `v<version>`.
  Skip if `release.yml` does not create a GitHub Release.

- [ ] **Backport `main` -> `dev`.** Run `scripts/sync-dev-after-release.sh v<version>` to bring the release bookkeeping
  (version bumps, `bun.lock`, `CHANGELOG.md`) to `dev` via a PR. Keeps the next release's PREFLIGHT diff-B step quiet so
  a real missed cherry-pick stands out instead of hiding in expected divergence noise. Confirm the sync PR merged to
  `dev`.

## Related docs

- [`RELEASES-PREFLIGHT.md`](./RELEASES-PREFLIGHT.md): pre-cut go/no-go checklist (runs BEFORE this one).
- [`RELEASES.md`](./RELEASES.md): operational runbook for the full release lifecycle.
- [`RELEASES-RATIONALE.md`](./RELEASES-RATIONALE.md): release-flow rationale.
