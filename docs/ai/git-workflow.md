# GIT_WORKFLOW — Branch / PR / Merge Operating Rule

> Not translated from an older document — written new on 2026-08-07, codifying a decision made in a
> conversation with samatsum about why local-only merges into `main` are risky for this repo.

**Position**: This is the canonical git operating procedure for this repository, for both the human
maintainer (samatsum) and any AI agent (Claude Code or otherwise) working in this repo. It is
process guidance, not a design document — it does not describe the product, only how changes should
land in `main`. Follow this exactly unless samatsum explicitly asks for a one-off exception. Japanese
companion: [`../human/運用/Git運用フロー.html`](../human/運用/Git運用フロー.html).

## The rule, in one sentence

**`origin/main` on GitHub is the single source of truth. Merge there first, then `pull` local `main`
to catch up — never the other way around.**

Do not merge a feature branch into local `main` and consider the work done. A merge that only exists
on one machine's local `main` is invisible to CI, invisible to `git clone`, and (for a 42 evaluation
project) invisible to anyone grading the repository. It does not count as "done" until it is on
`origin/main`.

## Why: the CI trigger is what makes PRs still worth it

This repo's `.github/workflows/ci.yml` triggers on both `push: branches: [main]` and
`pull_request`. That difference in *timing* is the entire reason to keep using PRs even now that
the team has dissolved to a single active contributor (samatsum — see
[`../human/はじめに/チーム体制.html`](../human/はじめに/チーム体制.html)):

| Route | When CI runs | Consequence if it fails |
|---|---|---|
| Merge locally into `main`, then `git push origin main` directly | **After** the push — `main` already has the bad commit | `main` is broken until fixed; anyone cloning in that window gets a broken build |
| Push a branch, open a PR, merge on GitHub once CI is green | **Before** the merge — on the PR, not on `main` | `main` never sees the bad commit; nothing to revert |

There is no longer a human reviewer to wait on, so a PR here is not a review gate — it is a
**CI gate**. Self-merging your own green PR is normal and expected; the point is never to hand-merge
into `main` before CI has had a chance to run on the exact commit that's about to land.

## The canonical flow

```bash
# 1. Start from an up-to-date main
git checkout main
git pull

# 2. Branch, then work
git checkout -b feat/xxx
# ...implement, commit as you go...

# 3. Push the branch and open a PR
git push -u origin feat/xxx
gh pr create --fill

# 4. Once CI is green, merge on GitHub (CLI or Web UI both fine)
gh pr merge --squash    # or --merge / --rebase — see "Merge strategy" below

# 5. Bring local main up to date with what actually landed
git checkout main
git pull
```

Step 5 is not optional. Skipping it is exactly how local `main` ended up 31 commits behind
`origin/main` in this repo before (discovered 2026-08-07) — nobody had run `git pull` on `main` in
several days, so an entire branch of work (`samatsum/refactor-project-docs-776717` /
`samatsum/md-files-docs-update-2f94f3`) was built on a stale base and had to be reconciled by hand
against `origin/main` afterward.

## Lane prefixes, and the 2026-08-08 rename

> **This section is the canonical lane definition.** Until 2026-08-08 the lanes were also defined —
> in two *different* vocabularies — in [`../human/はじめに/チーム体制.html`](../human/はじめに/チーム体制.html)
> §03 and [`../human/はじめに/オンボーディング.html`](../human/はじめに/オンボーディング.html), so three
> competing vocabularies coexisted. They now point here instead. Change a lane boundary here first.

Issue ids carry a lane prefix. **Lanes are divided by what the code is and who maintains it — not by
where it runs.** That is why `render.wasm` belongs to the Engine lane even though it executes in the
browser: the exact same `raycast.c` compiles into both the native binary and `render.wasm`, so a
boundary drawn by runtime location would split one source file across two lanes and stop working as
an ownership boundary.

| Prefix | Lane | Scope |
|---|---|---|
| `E-` / `G-` | **Engine** | The C engine in `codes/` + `web/`. Two prefixes, one lane: `E-` was the porting/platform work, `G-` the game rules. Kept separate only because renumbering finished work buys nothing |
| `B-` | **Backend** | Fastify, auth, REST, WS, GameRoom, and the database (Prisma/SQLite) |
| `I-` | **Infra / DevOps** | Repo skeleton and tooling, Docker/nginx/TLS, CI |
| `F-` | **Frontend** | General web screens: auth, layout, lobby, responsive work |
| `GV-` | **GameView** | Game screens: Canvas + `render.wasm` integration, HUD, match transition, spectator UI |

### Inside `B-` there are two different kinds of work

`B-` is one lane, but its contents split into "an ordinary web app" and "a realtime game server." The
experience each needs is quite different, so the distinction matters when choosing where to start.
**This is a reading aid inside the Backend lane, not a lane of its own** — both keep the `B-` prefix.

| Group | Issues | Content | Character |
|---|---|---|---|
| **Foundation** | `B-02`–`B-05` | Fastify common layer, Prisma+SQLite, auth (argon2id/cookie), Origin validation | Ordinary web-app CRUD and auth. Well covered by tutorials; general web experience transfers directly |
| **Game server** | `B-08`–`B-12`, `B-17` | Lobby WS, match formation, GameRoom, game WS, disconnect/AI takeover, spectator fan-out | 30Hz tick, 15Hz snapshot, state machines, reconnection. Requires understanding how `sim.wasm` behaves; you start by reading the existing implementation |
| (neither) | `B-14` | `GET /api/maps` and map-text distribution | Done. Used by both groups |

`F-` and `GV-` are split for the same reason — ordinary web screens versus screens that touch
`render.wasm` and WebSockets. There the gap is wide enough that they are **separate lanes** rather than
groups inside one.

### Mapping from the old ids

Before 2026-08-08 the backend, database and infra work all shared a single `W-` prefix ("Web"),
which said nothing about what an issue actually was, and the frontend lane mixed ordinary screens
with the wasm/WebSocket game view. **Numbers were preserved through the rename**, so the mapping is
mechanical — but roughly 85 commit messages and several closed GitHub issues still use the old ids
and can never be rewritten, so both vocabularies will coexist in the history permanently.

| Old | New |
|---|---|
| `W-01` | `I-01` |
| `W-02` – `W-14` | `B-02` – `B-14` (same number) |
| `W-15`, `W-16` | `I-15`, `I-16` |
| `F-06`, `F-07`, `F-08`, `F-12` | `GV-06`, `GV-07`, `GV-08`, `GV-12` |
| every other `F-` | unchanged |
| `E-`, `G-` | unchanged |

Reading an old commit: substitute the prefix, keep the number. `W-12` in a 2026-07 commit is today's
`B-12`; `F-07` in [PR #35](https://github.com/samatsum/ft_Transcendence/pull/35) is today's `GV-07`.

## Branch naming

Match the convention already established across 35+ PRs in this repo's history — `<type>/<slug>`:

| Prefix | Use for |
|---|---|
| `feat/` | New functionality (`feat/f-01-scaffold`, `feat/b-08-lobby`) |
| `fix/` | Bug fixes, review-feedback fixups |
| `docs/` | `docs/` directory or `README.md` changes only, no code |
| `chore/` | Tooling, deps, config with no product-facing behavior change |
| `ci/` | CI workflow changes |

`<slug>` is a short kebab-case description, optionally prefixed with the Issue id it implements
(`feat/b-12-reconnect`, `docs/b-08-design-complete`). Avoid personal-name-prefixed branches
(`claude/...`, `samatsum/...`) going forward — they don't sort next to the work they relate to and
don't communicate what they contain; prefer `<type>/<slug>` even for AI-authored branches.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), matching what's already in the log:
`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `build:`, `lint:`, with an optional scope —
`fix(F-01): address CodeRabbit review feedback`. Write the summary line in English or Japanese,
whichever matches the surrounding commits on that branch; don't mix languages within one summary
line.

## Merge strategy

- **Default: `--squash`.** One PR = one commit on `main`. Keeps `git log main` readable as a list of
  shipped units of work, regardless of how messy the in-branch history was (fixup commits, WIP
  commits, CodeRabbit-feedback commits are all common and fine — they get squashed away).
- **`--merge`** only when the branch's individual commits are independently meaningful and you want
  them preserved as-is (rare; e.g. a branch that bundles several unrelated doc fixes worth citing
  separately later).
- **`--rebase`** only for a short, already-clean, single-purpose branch where a merge commit would
  be pure noise.
- **Never `--ff-only` a merge commit for `main` locally and push that**, per the rule above — always
  go through GitHub so CI gates the exact merge result.

## After merging: delete the branch

Once a PR is merged, its branch has no further purpose. Delete both copies:

```bash
git branch -d feat/xxx                  # local
git push origin --delete feat/xxx       # remote (gh pr merge --delete-branch does both at once)
```

`gh pr merge --squash --delete-branch` folds step 4 above and this cleanup into one command. Leaving
merged branches around is how this repo accumulated 7 stale branches that all needed manual
archaeology (`git branch --merged`, `git diff --stat`, checking PR state via `gh pr list`) to confirm
they were safe to delete — see [`../human/はじめに/チーム体制.html`](../human/はじめに/チーム体制.html)'s note on team status
for why nobody was doing that cleanup as it happened.

## Tracking work: backlog.md + GitHub Issues (added 2026-08-08)

`docs/ai/backlog.md` remains the authoritative source of truth for every E-/G-/W-/F- item —
acceptance criteria, dependencies, and status live there first. As of 2026-08-08, samatsum also
wants newly discovered gaps mirrored as real GitHub Issues, for the visual open/closed tracking the
Issues tab gives (backlog.md's git-log-buried rows don't show that at a glance). By agreement,
**pre-2026-08-08 backlog rows were not backfilled** — this applies going forward only, starting with
G-11/G-12 ([#46](https://github.com/samatsum/ft_Transcendence/issues/46),
[#47](https://github.com/samatsum/ft_Transcendence/issues/47)).

When filing one:

- **Title**: `<Issue-ID>: <short description>` (e.g. "G-11: FPS's shoot mechanic can eliminate the
  other seat").
- **Labels**: one `lane:engine` / `lane:backend` / `lane:infra` / `lane:frontend` / `lane:gameview` matching the
  E/G/W/F prefix, plus `backlog-tracked`, plus `bug` or `enhancement` as fits.
- **Body**: cite file:line with **absolute GitHub URLs**
  (`https://github.com/samatsum/ft_Transcendence/blob/main/...`), never repo-relative paths — an
  Issue body isn't part of the file tree, so `../../` links silently fail to resolve there even
  though the identical pattern works fine inside `docs/`.
- **Cross-link both directions**: the backlog.md row should link back to the Issue number, and the
  Issue body should link back to the backlog.md section, so either one is findable from the other.
- **Close the Issue only when the matching backlog.md row is marked done in a merged PR** — the two
  must not drift out of sync.

## Anti-patterns — don't do these

- **Committing directly on `main`** (local or pushed). Always branch first, even for a one-line docs
  fix.
- **Merging a branch into local `main` and stopping there.** It is not done until `origin/main` has
  it and local `main` has pulled that.
- **Force-pushing `main`**, ever. If history needs to be rewritten, that's a branch-level operation
  before merge, not something done to shared history after the fact.
- **Letting local `main` sit stale.** Run `git checkout main && git pull` before starting *any* new
  branch, not just occasionally. If you're not sure whether local `main` matches `origin/main`, check
  before assuming: `git fetch && git rev-parse main origin/main` should print the same hash.
- **Branching from another feature branch instead of from `main`**, unless you're intentionally
  stacking PRs (and if so, say so in the PR description, as [PR #35](https://github.com/samatsum/ft_Transcendence/pull/35) did: "積む形").
