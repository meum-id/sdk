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

Engineering docs (`docs/plans/`, `docs/solutions/`, `docs/brainstorms/`, `docs/reviews/`) and this repo's registered
`extra_paths` (`.agent/`, `.lighthouseci/`) live on `dev` only. They never reach `main`. `guard-main-docs.yml` blocks
them from PRs targeting `main`, `guard-main-provenance.yml` rejects commits that did not arrive through a squash-merged
PR to `dev`, and `guard-release-branch.yml` rejects any PR to main whose head is not `release/*`. This matters here
because this is a public repo: engineering planning and solutions notes stay off the published branch that consumers
browse.

### Why the release branch is cut from `main`, never from `dev`

Every release squash-merges into `main`, so `dev` and `main` diverge in history even as their content converges: after
the first release they share only an ancient merge-base. Cutting the release branch from `dev` (or merging `dev` into
`main`) forces a 3-way merge across that divergence: `add/add` collisions on files both sides changed, plus
rename/delete pairs git cannot auto-resolve. The conflict pile is an artifact of the lineage, not of the content
shipping.

Always cut the release branch from `origin/main` and bring `dev`'s content onto it as a forward diff, never by
reconciling histories. The default is the whole-tree overlay (`git checkout origin/dev -- .`, then strip the guarded
set): `main` ships `dev`'s tree minus a small, known exclusion set, so asserting that end-state directly is simpler and
safer than hand-resolving a merge. The overlay commit carries no per-PR history, so the changelog is built from the PRs
merged into `dev` since the previous release (`generate-changelog.py --from-dev-prs`) rather than from the branch's
commits; the result is the same per-PR section a cherry-picked branch would yield. Cherry-picking the dev
squash-commits is kept only as an exception for a repo with a stated reason it cannot overlay, at the cost of
guarded-path conflict handling.

Either way, the release must start from a `main` that `dev` fully contains. Security PRs, hotfixes, and config edits
land on `main` first, and both constructions take `dev`'s content for the files they touch, so anything `main` holds
that `dev` never received is reverted by the release. `scripts/release/drift.sh` lists that set and the cut waits until
it is empty.

### Version branch naming

Branch naming `release/v<version>` or `release/v<version>-<slug>` makes release branches sortable and unambiguous when
multiple cuts are in flight. `generate-changelog.py` extracts the version from the branch name, so the `v<version>`
prefix is required. Slug is kebab-case, short, descriptive.

## PR body conventions

### No explainer prose in the body

Every section of a PR body is user-facing substance only: the **net diff**, what is changing for the consumer that was
not already there, not the commit history or intermediate state that produced it. Workflow mechanics (overlay,
regenerate, pre-push gate, CI behavior) are documented in RELEASES.md and `.github/`, NOT in the PR body. Diff output,
leak-check narration, patch-id cherry-check counts, pre-push gate results, CI check status, and other verification
artifacts stay local; anomalies get fixed before push, not audit-trailed in the body.

### Why `feat`/`fix` are preferred over `chore`

`cliff.toml` drops commits whose subject starts with `chore`, `style`, `test`, `ci`, or `build` regardless of body
content, and `generate-changelog.py --from-dev-prs` applies the same rule to a PR whose body carries no `## Changelog`.
Mistyping a user-facing change as `chore` silently strips it from release notes. Prefer `feat` / `fix` when the change
has any user-observable effect (schema changes, exported API changes, verifier behavior, new package exports).

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

The overlay recipe verifies with lines A (staged tree vs `dev`), B (guarded paths vs `main`), and D (what the release
adds to `main`). The cherry-pick exception runs three diffs (A: main->release, B: release->dev filtered by the guarded
set, C: dev->main) plus a patch-id cherry check. This is belt-and-suspenders because missed cherry-picks have shipped to
`main` on sibling repos before, and the file-level diff in B alone does not catch the patch-id false-negative class.

### Why the guarded set resolves from the workflow

`guard-main-docs` is what CI enforces on a PR to `main`: the reusable workflow's hardcoded base list plus this repo's
`extra_paths`. Every hand-kept copy of that union (runbook, checklist, preflight script) drifted from it, and a copy
that omits a guarded path reports a real leak as clean while CI turns red after the push.
`scripts/release/guarded-paths.sh` reads `extra_paths` out of the caller workflow and adds the base list, so
registering a path in the workflow is the only edit a new guarded path needs. The base list is the one copy that still
needs a manual edit when the reusable changes, because it lives in another repo. Entries are globs with one rule set
shared by the reusable and the script (`**/` any depth, `*` and `?` within a segment, trailing slash guards the
subtree), so `**/.agent/` guards that directory wherever it appears and the two never disagree about what is guarded.

### Why the release enumerates what it adds

The leak check screens the diff against the registered set, so it says nothing about a category nobody registered. A
new engineering directory or a stray note under `docs/` passes the local check and `guard-main-docs` alike. Step D
lists every `docs/` file and every markdown file the release adds to `main` outside the guarded set and puts them in
front of a human; each one needs a reason to ship, or it gets registered in `extra_paths` and dropped from the branch.
Root-level markdown is in scope because an agent-facing glossary at the repo root is exactly the kind of addition a
`docs/`-only listing misses.

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

`scripts/generate-changelog.py` (vendored from the `github-repo-setup` skill, with the repo-local `cliff.toml`) is the
only sanctioned way to update `CHANGELOG.md`. On the overlay-built release branch it runs as `--from-dev-prs`: the PRs
merged into `dev` since the previous release are the entries, and each PR's body supplies its `## Changelog -> ###
Breaking changes / Added / Changed / Fixed / Documentation` subsections (with author and PR-link attribution). On a
cherry-picked branch it runs `git-cliff` first to prepend a versioned entry from the branch's commits, then expands the
same way.

If a PR's body carries no changelog content, its title becomes a `Changed` bullet, except for `chore`, `ci`, `build`,
`style`, and `test` PRs, which stay out unless they carry a `## Changelog` of their own. To fix a wrong CHANGELOG entry,
fix the input: edit the squash-merged PR body, then re-run the script. Do **not** edit `CHANGELOG.md` directly.

### Why `cliff.toml` skips chore/style/test/ci/build

These commit types do not produce user-facing content. If a PR has user-facing `## Changelog` content but its commit
subject starts with one of those types, its bullets get silently dropped. After running the script, cross-check the
generated section against `gh pr view <num> --json body` for each PR in the release; correct mistyped PR titles and
re-run.

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

The two client packages version together for the Phase-0 demo, so the release bumps the root `package.json` (the value
`release.yml` checks against the tag) and every `packages/*/package.json` to the same value in one commit. The
inter-package range (`@meum/verify` consumed by `@meum/sdk`) bumps in the same commit so a published set always
resolves against itself. The `@meum/contracts` range is not bumped here: the contract is owned and published by
`meum-id/api` and consumed from npm, so its version tracks that repo's releases, not this one.

### npm auth: token vs OIDC

The skeleton reads an `NPM_TOKEN` automation secret as `NODE_AUTH_TOKEN`. The alternative is npm Trusted Publishing
(OIDC): the workflow requests a short-lived token from npm at publish time with `id-token: write` and no stored secret.
OIDC is preferred once the packages exist on npm because there is no long-lived credential to rotate or leak; the token
path is the simpler bootstrap for the first publish.

### Why backport `main` -> `dev` after publish

The release-bookkeeping files on `main` (`CHANGELOG.md`, `cliff.toml`, the version-bearing manifests, `bun.lock`) need
to reach `dev` so future builds from `dev` report the released version and the next dev work starts from the released
baseline.

The backport is a PR opened by `scripts/sync-dev-after-release.sh`, never a merge of `main` into `dev` and never a
direct push. The squash-merged branches share no recent history, so a merge conflicts on every file both sides touched,
and a direct push to `dev` bypasses its PR-only convention. This repo's copy of the script diverges from the skill
template on purpose: it copies the bookkeeping set verbatim from `origin/main` because the two workspace manifests and
the hand-edited `bun.lock` `workspaces` entries must move together, and it proves the result with `bun install
--frozen-lockfile` plus `test/lock-versions.test.ts` before opening the PR. The
postflight backport gate treats that merged PR as the durable signal that the backport ran, and it keeps the next
release's overlay verification line A quiet so a real missed change stands out instead of hiding in expected divergence
noise.

### Rollback

Rollback happens at the surface consumers resolve (the `latest` dist-tag on npm), not in git. Re-pointing a dist-tag
and deprecating a version is fast and reversible; `npm unpublish` is neither (a 72-hour window, and every consumer that
already resolved the version breaks), and rewriting `main` is neither, since the release flow exists so that `main`
only ever moves forward through a PR. After the rollback, the fix or revert lands through `dev`, a release branch, and
`main` like any other change, so the branch reconverges with what `latest` resolves to. Recording the last-good version
before the release is what makes the rollback a single command under incident pressure.

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
typecheck, test`. The guard callers use job keys `guard-docs:`, `guard-provenance:`, and `guard-release:`, so their
contexts are `guard-docs / check-forbidden-docs`, `guard-provenance / check-provenance`, and `guard-release /
check-release-branch-name`. Mixing these produces a stuck-but-green PR: confirm the real contexts after a first CI run
with `gh api repos/meum-id/sdk/commits/<sha>/check-runs --jq '.check_runs[].name'` before adding them to the ruleset.

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
