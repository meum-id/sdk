# Releases rationale

Companion to [`RELEASES.md`](./RELEASES.md). RELEASES.md is the runbook (commands, paths, decision tables). This file
holds the WHY behind those rules: branching model, PR conventions, release pipeline, CHANGELOG generation, prose-check
pipeline, branch-protection pitfalls.

Read this when:

- A rule in RELEASES.md does not make sense and you are tempted to change it.
- A new contributor asks "why do we do X this way".
- You are adding a new release-flow rule and need to know where it fits the existing model.

## Branching model

### Forever `dev`, ephemeral release branches

`dev` is never deleted, even after a release. The next release cycle reuses the same `dev`. The repo's
`delete_branch_on_merge: true` setting does not touch `dev` as long as `dev` is never the head of a PR. Using a
short-lived `release/*` head is what keeps the setting compatible with a forever integration branch.

Engineering docs (`docs/plans/`, `docs/solutions/`, `docs/brainstorms/`, `docs/reviews/`) live on `dev` only. They never
reach `main`. `guard-main-docs.yml` blocks them from PRs targeting `main`, and `guard-release-branch.yml` rejects any PR
to main whose head is not `release/*`. This matters here because this is a public repo: engineering planning and
solutions notes stay off the published branch that consumers browse.

### Why cherry-pick from `main`, not branch from `dev`

Branching from `dev` and then trashing the guarded paths seems simpler but produces `add/add` merge conflicts whenever
`dev` and `main` have diverged (which they always do after the first squash merge). The file appears as "added" on both
sides with different content. Always branch from `origin/main` and cherry-pick the dev commits onto it.

### Version branch naming

Branch naming `release/v<version>` or `release/v<version>-<slug>` makes release branches sortable and unambiguous when
multiple cuts are in flight. `generate-changelog.py` extracts the version from the branch name, so the `v<version>`
prefix is required. Slug is kebab-case, short, descriptive.

## PR body conventions

### No explainer prose in the body

Every section of a PR body is user-facing substance only: the **net diff**, what is changing for the consumer that was
not already there, not the commit history or intermediate state that produced it. Workflow mechanics (cherry-pick,
regenerate, pre-push gate, CI behavior) are documented in RELEASES.md and `.github/`, NOT in the PR body. Triple-diff
output, leak-check narration, patch-id cherry-check counts, pre-push gate results, CI check status, and other
verification artifacts stay local; anomalies get fixed before push, not audit-trailed in the body.

### Why `feat`/`fix` are preferred over `chore`

`cliff.toml` drops commits whose subject starts with `chore`, `style`, `test`, `ci`, or `build` regardless of body
content. Mistyping a user-facing change as `chore` silently strips it from release notes. Prefer `feat` / `fix` when the
change has any user-observable effect (schema changes, exported API changes, verifier behavior, new package exports).

Security advisory bumps in particular use `fix(deps):`, never `chore(deps):`, so they appear in the changelog. A bumped
dependency that closes a CVE is user-visible value, not internal tooling.

### Why required-when-empty sub-headers

`Related Issues/Stories` has four labels (`Story:` / `Issue:` / `Architecture:` / `Related PRs:`). `Files Modified` has
four sub-headers (`Modified` / `Created` / `Renamed` / `Deleted`). All four must appear in every PR, even when empty:
write `- None.` or `n/a` rather than deleting the label. Scanners and humans both rely on a known section shape.
Conditionally-absent sections force every reader to check "did the author skip this or does it not apply?"

### Why no AI attribution

`Co-Authored-By: Claude ...`, robot-emoji / "Generated with Claude Code" trailers, or any similar AI-attribution trailer
is banned from commit messages and PR bodies. Commits and PRs stand on their own technical content. Attribution trailers
are noise and they age poorly as tools shift.

### Why no hard line wraps

Author each paragraph and each bullet as one logical line, however long. GitHub soft-wraps for display. Hard wraps
within prose produce visible mid-sentence breaks in some renderers and interfere with the prose-check pipeline.

## Triple-diff verification

The release-PR procedure runs three diffs (A: main->release, B: release->dev for non-doc paths, C: dev->main) plus a
patch-id cherry check. This is belt-and-suspenders because missed cherry-picks have shipped to `main` on sibling repos
before, and the file-level diff in B alone does not catch the patch-id false-negative class.

### Why patch-id cherry-check output is noisy

In a squash-merge workflow, `git cherry HEAD origin/dev` produces many `+` lines that need human triage. They do NOT
auto-block the release. Expected sources of false positives:

1. **Historical commits squash-merged in prior releases.** The squash commit on main has a different patch-id than the
   dev commits it consolidates, so old commits show as `+` forever.
2. **Cherry-picks where conflict resolution stripped guarded paths** or otherwise altered the tree. Same source intent,
   different patch-id.
3. **Intentionally skipped commits** (docs-only commits, release-prep backports).

A real miss looks like: a recent feat/fix commit on dev whose *file content* is not yet on main. Triage a `+` line with
`git show <sha> --stat` then `git diff origin/main..HEAD -- <those-files>`.

## CHANGELOG generation

### Generated, never hand-written

`scripts/generate-changelog.py` (vendored, with the repo-local `cliff.toml`) is the only sanctioned way to update
`CHANGELOG.md`. It runs `git-cliff` to prepend a versioned entry for commits since the last tag, then walks each
squash-merged PR's body to extract the `## Changelog -> ### Added / Changed / Fixed / Documentation` subsections,
replacing the auto-generated bullets with the curated PR-body content (with author and PR-link attribution).

If a PR's `## Changelog` section is empty, that PR's entry is omitted (empty section = no user-facing change). To fix a
wrong CHANGELOG entry, fix the input: edit the squash-merged PR body, then re-run the script. Do **not** edit
`CHANGELOG.md` directly.

> `cliff.toml` is not shipped by this bootstrap. Add it alongside the build; `generate-changelog.py` fails fast with
> `cliff.toml not found` until it exists.

### Why `cliff.toml` skips chore/style/test/ci/build

These commit types do not produce user-facing content. If a cherry-picked PR has user-facing `## Changelog` content but
its commit subject starts with one of those types, its bullets get silently dropped. After running the script,
cross-check the generated section against `gh pr view <num> --json body` for each cherry-picked PR; correct mistyped PR
titles and re-amend before re-running.

## Release pipeline

### Annotated tags

Always use annotated tags (`-a -m`). Bare `git tag <name>` silently fails with `fatal: no tag message?` on machines
where `tag.gpgsign=true` is set globally. The annotated `vX.Y.Z` tag on `main` is the single trigger for `release.yml`
(also re-runnable via `workflow_dispatch` for an existing tag).

### npm publish and package versioning

`release.yml` verifies the tag commit is on `main` and the package version matches the tag, builds each package, and
runs `npm publish --access public` per `packages/*`. The `--access public` flag is mandatory for scoped packages
(`@meum/*`): npm defaults scoped packages to restricted, and a first publish without the flag fails or publishes
privately. Equivalently, each `package.json` can carry `"publishConfig": {"access": "public"}`.

The two client packages version together for the Phase-0 demo, so the release bumps every `packages/*/package.json` to
the same value in one commit. The inter-package range (`@meum/verify` consumed by `@meum/sdk`) bumps in the same commit
so a published set always resolves against itself. The `@meum/contracts` range is not bumped here: the contract is owned
and published by `meum-id/api` and consumed from npm, so its version tracks that repo's releases, not this one.

### npm auth: token vs OIDC

The skeleton reads an `NPM_TOKEN` automation secret as `NODE_AUTH_TOKEN`. The alternative is npm Trusted Publishing
(OIDC): the workflow requests a short-lived token from npm at publish time with `id-token: write` and no stored secret.
OIDC is preferred once the packages exist on npm because there is no long-lived credential to rotate or leak; the token
path is the simpler bootstrap for the first publish.

### Why backport `main` -> `dev` after publish

The release-bookkeeping files on `main` (version bumps, `bun.lock`, `CHANGELOG.md`) need to reach `dev` so future builds
from `dev` report the released version and the next dev work starts from the released baseline.
`scripts/sync-dev-after-release.sh` backports via a PR against `dev` (direct commits to `dev` are not permitted).
Keeping the next release's PREFLIGHT diff-B step quiet means a real missed cherry-pick stands out instead of hiding in
expected divergence noise.

## Prose scrubbing scope

Three release-flow artifacts live outside any automated prose check and need a manual scrub before they ship: PR bodies
(`gh pr create` / `gh pr edit` send body text directly to GitHub), `CHANGELOG.md` (generated from upstream PR bodies),
and release-PR bodies (composed after `CHANGELOG.md` is generated). Author in `/tmp/`, scrub with `unslop` (and Vale +
LanguageTool where wired up), submit via `--body-file`. The auto-format hook skips `/tmp/` paths so the body keeps its
authored shape.

## Branch protection

### Status-check context strings

The `required_status_checks[].context` strings in `protect-main.json` must match exactly what GitHub publishes for each
check:

- **Inline job** (with `name:` field): published as just `<job-name>` (no workflow-name prefix).
- **Reusable-workflow caller** (`uses: .../foo.yml@ref`): published as `<caller-job-id> / <reusable-job-id-or-name>`.

The `ci.yml` job key is `ci:` and its `name:` is `Lint, typecheck, test`, so once wired the context is `ci / Lint,
typecheck, test`. The guard callers use job keys `guard-docs:` and `guard-release:`, so their contexts are `guard-docs /
check-forbidden-docs` and `guard-release / check-release-branch-name`. Mixing these produces a stuck-but-green PR:
confirm the real contexts after a first CI run with `gh api repos/meum-id/sdk/commits/<sha>/check-runs --jq
'.check_runs[].name'` before adding them to the ruleset.

### Why the applied rulesets omit required status checks (for now)

The live `protect-main.json` and `protect-dev.json` deliberately omit required status checks: the CI and release
workflows are skeletons until the build lands, and wiring a skeleton as a required check would block every PR on a job
that does no real work. Add the checks after the scaffolding is in place. The owner `RepositoryRole` (id 5) break-glass
bypass on both rulesets is what lets an org-admin token push directly to `main`/`dev` during bootstrap.

### Why rulesets live in-repo

Committing the JSON alongside code means ruleset changes land via the same review process as workflow changes. A
`chore(ci): tighten protect-main` change goes through dev -> release/* -> main like anything else.

## Related docs

- [`RELEASES.md`](./RELEASES.md): operational runbook (commands, paths, decision tables).
- [`RELEASES-PREFLIGHT.md`](./RELEASES-PREFLIGHT.md): pre-cut checklist gating the release-branch cut.
- [`RELEASES-POSTFLIGHT.md`](./RELEASES-POSTFLIGHT.md): post-tag pipeline verification.
- [`.github/pull_request_template.md`](.github/pull_request_template.md): PR body structure with changelog sections.
