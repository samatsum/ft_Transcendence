# ft_transcendence — AI reference docs

This directory is the **AI-facing documentation set**: English Markdown, written for an AI coding
assistant (e.g. Claude Code) to consult while implementing or reviewing code in this repository.

The **human-facing** documentation set is the parallel `docs/human/` directory: Japanese HTML,
written for samatsum. Start there instead if you're a person, not an AI — [`../human/index.html`](../human/index.html).
It includes a lane-by-lane Japanese terminology glossary under `docs/human/専門用語/` (samatsum is
working toward the Technical Lead role and knows only the `codes/` C engine so far) — if you're
asked to explain a term to samatsum, check whether it's already defined there before improvising
your own explanation, so the vocabulary stays consistent across sessions.

Superseded/original documents (the Japanese Markdown these files were translated from, plus
material that didn't carry forward into either the AI or human doc set) live under
[`../../archive/`](../../archive/) for historical reference. They are not maintained.

## Project status (implementation as of 2026-08-07, reconciled against `origin/main` @ `40acdee`; module lineup as of the 2026-08-08 D-19 revision)

- **C engine** (Engine E-01–E-14 / Gameplay G-01–G-10): complete.
- **Server** (B-/I-series): I-01, B-09, B-10, B-11, B-12, B-14 complete (**6**); **B-08 is core-complete, not complete** — it still needs the real cookie auth from B-04/B-05, so backlog.md counts it separately. B-08–B-12 were
  built ahead of schedule against `ALLOW_DEV_AUTH` and still need to integrate with real cookie
  auth (**B-02–B-05**, not yet done). **B-17 (spectator server side), I-15, I-16** are also outstanding.
  **B-06, B-07 and B-13 were dropped on 2026-08-08** by the D-19 module revision. CI is green on all jobs.
- **Frontend** (F-/GV-series): **F-01 (scaffold), F-02 (fetch wrapper), GV-06 (GameView integration), and
  GV-07 (HUD overlay, merged via [PR #35](https://github.com/samatsum/ft_Transcendence/pull/35)) are
  complete and merged to main.** F-03, F-04, F-05, GV-08・F-11・GV-12 are not started; **F-09 and F-10 were
  dropped on 2026-08-08**, and **GV-12 was promoted from reserve to required** by the same revision. Next milestone is
  **Gate 2** (2 browsers, 2v2 RSP match working end-to-end), which needs F-05 and GV-08 (both not
  started — GV-06/GV-07 currently have no lobby to launch from).

## Team status (important — read before assuming a multi-person workflow)

As of 2026-08-05 the former 4-person team (torinoue / mamiyaza / hminemur, plus samatsum) has
**dissolved**. **samatsum is the only active contributor**; no new members have joined yet.

- Do not expect or generate per-person task assignments, hand-off routing, or "ask X about Y"
  guidance — that information was deliberately removed from the docs during the 2026-08-05
  refactor because there is no one to route it to.
- The project brief still requires a 4–5 person team (this is an open, unresolved discrepancy
  with the repo's own README — see [`../human/はじめに/チーム体制.html`](../human/はじめに/チーム体制.html) for the
  human-facing writeup of this risk). Don't try to resolve it; just be aware of it.
- Role/lane framework (PO / PM·SM / Technical Lead / Developer; Engine / Backend·DevOps /
  Frontend / Gameplay) is preserved as a structural requirement, with samatsum currently filling
  every active slot and the rest marked open.

## Documents

| File | What it covers |
|---|---|
| [requirements.md](./requirements.md) | The 42-school "ft_transcendence" subject: all 42 requirement items. Ground truth for whether an implementation is compliant. |
| [architecture.md](./architecture.md) | Overall architecture: tech stack selection, module boundaries, module structure. The §7 schedule table is flagged inline as stale/historical — do not treat it as a current plan. |
| [engine-separation.md](./engine-separation.md) | cub3D engine separation design: the `pf_*` platform-abstraction layer, the sim API, the 3 build targets (native / web / sim). |
| [ws-protocol.md](./ws-protocol.md) | WebSocket protocol: GameRoom, matchmaking, disconnect/reconnect (B-12). Ends with a dedicated **B-10 (GameRoom + sim.wasm integration) implementation notes** section — a 9-item list of implementation-detail caveats carried over from the original Phase 3 report. |
| [rest-api.md](./rest-api.md) | REST API: auth, users, friends, matches/stats, maps. Includes the Prisma schema. |
| [frontend.md](./frontend.md) | Frontend design: SPA screens, HUD, WS hooks, Privacy/ToS pages. |
| [backlog.md](./backlog.md) | The full issue backlog — every E/G/W/F issue, gate criteria, and the project's decision log. Check this first for current implementation status. |
| [coding-rules.md](./coding-rules.md) | The canonical C coding-rules document. Every `CRxxx` code that `make check` can print maps 1:1 to a rule here. |
| [dev-doc.md](./dev-doc.md) | Engine developer reference: module structure, enemy AI / RSP AI internals, data flow, tuning values, lint tooling. |
| [git-workflow.md](./git-workflow.md) | The mandatory branch → PR → CI → merge-on-GitHub → `pull` procedure. Not a design doc — read this before making any commit in this repo. |
| [doc-style-guide.md](./doc-style-guide.md) | How to write and wire up a page under `docs/`: page template, the shared CSS classes, when to use Mermaid vs. plain text for diagrams (and how to embed/validate one), the dead-link check, and the status/team-attribution wording rules. Read this before adding or restructuring anything under `docs/`. |

## Where these came from (old → new filename)

The nine documents translated from the original Japanese design docs — `requirements.md` through
`dev-doc.md` in the table above (i.e. everything except `git-workflow.md` and
`doc-style-guide.md`, which are new and were never translated from anything) — used to live under
`md_files/02_設計書/`, `md_files/04_エンジン資料/`, and `md_files/01_課題/`. The old Japanese
originals are archived, not deleted — each translated file has a one-line source note near the
top pointing at its original path. Old numbering (⓪①②③④⑤⑥) and legacy English filenames
(`ARCHITECTURE_DESIGN.md`, `WS_PROTOCOL_DESIGN.md`, etc.) that still appear in commit history,
code comments, or these documents' own prose all refer to the same content now living here:

| Old reference | This file |
|---|---|
| ⓪ / `ARCHITECTURE_DESIGN.md` / `02_設計書/0-全体アーキテクチャ設計.md` | [architecture.md](./architecture.md) |
| ① / `ENGINE_SEPARATION_DESIGN.md` / `02_設計書/1-エンジン分離設計.md` | [engine-separation.md](./engine-separation.md) |
| ② / `WS_PROTOCOL_DESIGN.md` / `02_設計書/2-WSプロトコル設計.md` | [ws-protocol.md](./ws-protocol.md) |
| ③ / `REST_API_DESIGN.md` / `02_設計書/3-REST_API設計.md` | [rest-api.md](./rest-api.md) |
| ④ / `FRONTEND_DESIGN.md` / `02_設計書/4-フロントエンド設計.md` | [frontend.md](./frontend.md) |
| ⑤ / `BACKLOG.md` / `02_設計書/5-バックログ.md` | [backlog.md](./backlog.md) |
| `CODING_RULES.md` / `04_エンジン資料/コーディング規約.md` | [coding-rules.md](./coding-rules.md) |
| `DEV_DOC.md` / `04_エンジン資料/開発ドキュメント.md` | [dev-doc.md](./dev-doc.md) |
| `01_課題/ft_トランセンデンス.md` | [requirements.md](./requirements.md) |
| `03_実装レポート/3-エンジンPhase3レポート.md` §B-10申し送り | ws-protocol.md's "Implementation notes: B-10" section |

⑥ (`02_設計書/6-チーム分担計画.md`, the old team-assignment plan) has no AI-doc counterpart — it
was human-facing organizational content and was rewritten for the solo-dev era as
[`../human/はじめに/チーム体制.html`](../human/はじめに/チーム体制.html) instead.

Note: cross-reference links *inside* these translated files (e.g. a line pointing at
`../03_実装レポート/...` or `./コーディング規約.md`) were preserved verbatim from the Japanese
originals during translation and may still point at archived paths rather than these new
filenames — treat this table as the authoritative old→new mapping if an in-doc link doesn't
resolve.
