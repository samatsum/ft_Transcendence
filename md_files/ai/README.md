# ft_transcendence — AI reference docs

This directory is the **AI-facing documentation set**: English Markdown, written for an AI coding
assistant (e.g. Claude Code) to consult while implementing or reviewing code in this repository.

The **human-facing** documentation set is the parallel `md_files/ja/` directory: Japanese HTML,
written for samatsum. Start there instead if you're a person, not an AI — [`../ja/index.html`](../ja/index.html).

Superseded/original documents (the Japanese Markdown these files were translated from, plus
material that didn't carry forward into either the AI or human doc set) live under
[`../../archive/`](../../archive/) for historical reference. They are not maintained.

## Project status (as of 2026-08-05)

- **C engine** (Engine E-01–E-14 / Gameplay G-01–G-10): complete.
- **Server** (W-series): W-01, W-08, W-09, W-10, W-11, W-12, W-14 complete. W-08–W-12 were
  built ahead of schedule against `ALLOW_DEV_AUTH` and still need to integrate with real cookie
  auth (**W-02–W-05**, not yet done). **W-13** is also outstanding. CI is green on all jobs.
- **Frontend** (F-series): F-01–F-12 not yet started. Next milestone is **Gate 2**
  (2 browsers, 2v2 RSP match working end-to-end).

## Team status (important — read before assuming a multi-person workflow)

As of 2026-08-05 the former 4-person team (torinoue / mamiyaza / hminemur, plus samatsum) has
**dissolved**. **samatsum is the only active contributor**; no new members have joined yet.

- Do not expect or generate per-person task assignments, hand-off routing, or "ask X about Y"
  guidance — that information was deliberately removed from the docs during the 2026-08-05
  refactor because there is no one to route it to.
- The project brief still requires a 4–5 person team (this is an open, unresolved discrepancy
  with the repo's own README — see [`../ja/team-plan.html`](../ja/team-plan.html) for the
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
| [ws-protocol.md](./ws-protocol.md) | WebSocket protocol: GameRoom, matchmaking, disconnect/reconnect (W-12). Ends with a dedicated **W-10 (GameRoom + sim.wasm integration) implementation notes** section — a 9-item list of implementation-detail caveats carried over from the original Phase 3 report. |
| [rest-api.md](./rest-api.md) | REST API: auth, users, friends, matches/stats, maps. Includes the Prisma schema. |
| [frontend.md](./frontend.md) | Frontend design: SPA screens, HUD, WS hooks, Privacy/ToS pages. |
| [backlog.md](./backlog.md) | The full issue backlog — every E/G/W/F issue, gate criteria, and the project's decision log. Check this first for current implementation status. |
| [coding-rules.md](./coding-rules.md) | The canonical C coding-rules document. Every `CRxxx` code that `make check` can print maps 1:1 to a rule here. |
| [dev-doc.md](./dev-doc.md) | Engine developer reference: module structure, enemy AI / RSP AI internals, data flow, tuning values, lint tooling. |

## Where these came from (old → new filename)

All nine files above are English translations of documents that used to live under
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
| `03_実装レポート/3-エンジンPhase3レポート.md` §W-10申し送り | ws-protocol.md's "Implementation notes: W-10" section |

⑥ (`02_設計書/6-チーム分担計画.md`, the old team-assignment plan) has no AI-doc counterpart — it
was human-facing organizational content and was rewritten for the solo-dev era as
[`../ja/team-plan.html`](../ja/team-plan.html) instead.

Note: cross-reference links *inside* these translated files (e.g. a line pointing at
`../03_実装レポート/...` or `./コーディング規約.md`) were preserved verbatim from the Japanese
originals during translation and may still point at archived paths rather than these new
filenames — treat this table as the authoritative old→new mapping if an in-doc link doesn't
resolve.
