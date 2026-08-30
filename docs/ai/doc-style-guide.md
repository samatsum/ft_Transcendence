# DOC_STYLE_GUIDE — How to Write a Page in `docs/`

> Not translated from an older document — written new on 2026-08-07, after repeatedly having to
> re-derive the same conventions (page template, when to use Mermaid, how to validate a diagram,
> how to check for dead links) from scratch across several docs PRs. Read this before adding or
> restructuring anything under `docs/`.

**Position**: This is process/authoring guidance, not a design document — it does not describe the
product, only how to write and wire up a documentation page. Related to
[git-workflow.md](./git-workflow.md) (how changes land) and
[../human/運用/Git運用フロー.html](../human/運用/Git運用フロー.html) (its Japanese counterpart). Its own Japanese
companion is [`../human/運用/ドキュメント作法.html`](../human/運用/ドキュメント作法.html).

## The two tracks, and which one a new page belongs in

| | `docs/ai/` | `docs/human/` |
|---|---|---|
| Language | English | Japanese |
| Format | Markdown (`.md`) | HTML (`.html`) |
| Audience | An AI coding assistant | samatsum |
| Filename style | English, kebab-case (`ws-protocol.md`, `doc-style-guide.md`) | Descriptive Japanese, not a literal translation or romanization (`チーム体制.html`, not `team-plan.html` or `chiimu-taisei.html`) |

If content is genuinely reference material an AI would consult while implementing (protocol specs,
backlog, coding rules, git process) → `docs/ai/`. If it's something samatsum reads to understand
or learn the project (onboarding, terminology, conceptual "why is it built this way" explanations,
the project overview) → `docs/human/`. When in doubt, lean toward writing *both*: an English `.md` for
the mechanical facts, a Japanese `.html` companion for the narrative/visual version — see how
[architecture.md](./architecture.md) and [`../human/はじめに/プロジェクト概要.html`](../human/はじめに/プロジェクト概要.html)
or [git-workflow.md](./git-workflow.md) and [`../human/運用/Git運用フロー.html`](../human/運用/Git運用フロー.html)
pair up. When you do pair them, put the authoritative source of anything mechanical (shell
commands, exact file paths) in **one** of the two and have the other link out to it — don't
maintain the same command block in two places, they will drift.

## Category directories inside `docs/human/`

`docs/human/` is **not flat**. Files of a different content type never share a directory — and
never dump something into a catch-all "misc" bucket either; if nothing existing fits, create a new
category directory (samatsum's explicit instruction, 2026-08-07, after the original flat layout of
8 unrelated files sitting directly in `docs/human/` became unnavigable). Current categories:

| Directory | Content type |
|---|---|
| `はじめに/` | Orientation for a newcomer: project overview, team structure, common-knowledge onboarding |
| `運用/` | Process rules for contributing (git workflow, this style guide) — not about the product |
| `開発状況/` | Living progress-tracking documents (the B-/I- and F-/GV- lane status pages) |
| `説明用/` | Conceptual "why is it built this way" deep-dives, plus the TL self-check Q&A |
| `専門用語/` | The lane-by-lane terminology glossary |
| `プレイヤー向け/` | Product documentation for the people who *play* the game (players/evaluators), not the people who build it |

`docs/human/index.html` itself stays at the root (entry-point convention, like `README.md` at the
repo root) — it is the only file that doesn't live in a category directory. Before adding a new
page, check whether it fits an existing category; only create a new one if it's a genuinely
distinct content type (a single-file category directory is fine — `プレイヤー向け/` started that
way — it just means the type doesn't have a sibling yet).

## HTML page template

Every `docs/human/*.html` page follows the same skeleton, living inside one of the category
directories above. Copy an existing page in the category you're adding to
(`docs/human/はじめに/チーム体制.html` is a good short example) rather than writing one from scratch:

```html
<!doctype html>
<html lang="ja">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="color-scheme" content="dark">
	<title>ページ名 — ft_transcendence</title>
	<link rel="stylesheet" href="../assets/style.css">  <!-- every category dir is one level deep; docs/human/index.html itself uses ./assets/style.css -->
</head>
<body>
	<header class="hero">
		<div class="shell">
			<p class="eyebrow">Category label</p>
			<h1>Two-line punchy title</h1>
			<p class="hero-lead">One paragraph: what this page covers and who it's for.</p>
		</div>
	</header>

	<nav class="topnav" aria-label="ページ内目次">
		<div class="shell nav-inner">
			<a href="#section1">Section 1</a>
			<a href="#section2">Section 2</a>
			<button class="print-button" type="button" onclick="window.print()">印刷 / PDF</button>
		</div>
	</nav>

	<main class="shell">
		<section id="section1">
			<p class="section-kicker">01 · English label</p>
			<h2>Section heading</h2>
			<!-- content -->
		</section>
	</main>

	<footer class="shell">
		<p>Creation date, provenance note if translated/migrated from something older.</p>
	</footer>
</body>
</html>
```

The `nav.topnav` (with anchor links + print button) is only worth including on pages long enough
to need in-page navigation — short pages (a handful of short sections) can skip it, see
`docs/human/はじめに/チーム体制.html` for an example of a page without one.

## The shared stylesheet (`docs/human/assets/style.css`)

One stylesheet, referenced by every `docs/human/*.html` page — never write page-specific `<style>`
blocks; add a class to the shared sheet instead if you need something new. The classes you'll
actually use, grouped by purpose:

| Purpose | Classes |
|---|---|
| Page structure | `.shell` (max-width content wrapper), `.hero`, `.topnav` / `.nav-inner`, `main`, `footer` |
| Section headers | `.section-kicker` (small caps eyebrow above an `<h2>`), `.section-intro` (muted intro paragraph) |
| Cards / grids | `.card`, `.card-label`, `.grid.grid-2` / `.grid-3` / `.grid-4` |
| Callouts | `.callout` (cyan, informational), `.callout.warning` (yellow, "pay attention") |
| Tables | `.table-wrap` (wrapping div for horizontal scroll) around a plain `<table>` |
| Status tags | `.tag`, `.tag.status-done` (green) / `.tag.status-partial` (yellow) / `.tag.status-todo` (gray), `.tag.owner` |
| Numbered steps | `<ol class="path-list">` — auto-numbered circular badges |
| Big numbers | `.metric` / `.metric-note` inside a `.card` — **only for things that are actually counts**; an Issue id like "B-13" displayed at this size reads as a number, prefix it so it's unambiguous (a CodeRabbit review caught exactly this on `サーバー開発工程.html`) |
| Long quoted narration | `.script` wrapping a `<blockquote>` |
| Code | Plain `<pre><code>…</code></pre>` for actual code/commands/terminal output. **Not** for diagrams — see below |

Full source: [`../human/assets/style.css`](../human/assets/style.css) — its own header comment says what
it's for and where it's referenced from; keep that comment accurate if you move things around
(caught stale twice already: once pointing at an archived path, once at the pre-rename `md_files/`
directory name).

### The one sanctioned exception: print-first pages

`docs/human/説明用/技術スタック/` uses its own `印刷用.css` instead of the shared sheet. This is
deliberate, requested by samatsum on 2026-08-08, and is **not** a precedent for page-specific styling
in general. The reason it can't share: those pages are designed to be *printed in color*, under a
mandated design system — white base, only white/black/red, no rounded corners, no gradients or
shadows, weights limited to 900/700/500. That is fundamentally incompatible with the dark on-screen
theme in `assets/style.css`, so overriding it page-by-page would have been messier than a separate
sheet. The exception's scope is exactly those two pages; the CSS file's own header comment states
this. If you add another print-first page there, reuse `印刷用.css` rather than writing a third one.

## Diagrams: Mermaid vs. plain text

**Never hand-draw a multi-column box-and-arrow diagram with box-drawing characters
(`┌│└└▼→` etc.) mixed with Japanese text on the same line.** CJK characters render at roughly
double the width of ASCII characters even in a "monospace" font, so any line mixing them with
box-drawing alignment math will visibly drift in a browser — this was reported directly by
samatsum and confirmed by inspection across four pages that had this problem.

- **Multi-column / side-by-side layouts** (anything where two or more boxes need to line up
  horizontally, or several arrows fan out from one node) → **Mermaid**, always.
- **Two-actor request/response exchanges** (browser ⇄ server, client ⇄ sim) → Mermaid
  `sequenceDiagram`, which reads far better than a hand-drawn arrow chain for this shape.
- **Simple single-column vertical arrow chains** (`A → B → C`, nothing side-by-side) → plain
  `<pre><code>` text is fine and lower-effort; the misalignment risk that motivates Mermaid doesn't
  really apply to a single left-aligned column. Don't convert these reflexively — see
  `docs/human/説明用/サーバ権威モデル.html`'s remaining plain-text diagrams for examples that
  were deliberately left alone.
- **A literal file-format example, directory listing, or code/terminal output** → plain
  `<pre><code>`, never Mermaid — Mermaid renders relationships/flow, not arbitrary text layout.

### How to embed a Mermaid diagram in a `docs/human/*.html` page

These are static files with no build step — Mermaid isn't natively available like it is inside a
published Claude Artifact. Load it from a CDN and initialize with theme colors matching
`assets/style.css`'s palette (`--bg #07111f`, `--panel #12243a`, `--line #29415d`,
`--text #edf6ff`, `--cyan #5de4d6`). Put the diagram in a `<pre class="mermaid">` block, and add
this script once, right before `</body>` (copy from `docs/human/説明用/サーバ権威モデル.html`
or any of the other pages with a diagram — don't retype it, the theme values need to stay
consistent across pages):

```html
<pre class="mermaid">
flowchart TD
    a["node A"] --> b["node B"]
</pre>

<script type="module">
	import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
	mermaid.initialize({
		startOnLoad: true,
		theme: "base",
		themeVariables: {
			darkMode: true,
			background: "#07111f",
			primaryColor: "#12243a",
			primaryTextColor: "#edf6ff",
			primaryBorderColor: "#29415d",
			lineColor: "#5de4d6",
			secondaryColor: "#0d1b2d",
			secondaryTextColor: "#edf6ff",
			secondaryBorderColor: "#29415d",
			tertiaryColor: "#0d1b2d",
			tertiaryTextColor: "#edf6ff",
			tertiaryBorderColor: "#29415d",
			fontFamily: "Inter, 'Noto Sans JP', sans-serif",
			noteBkgColor: "#12243a",
			noteTextColor: "#c4d4e6",
			noteBorderColor: "#29415d",
			actorBkg: "#12243a",
			actorTextColor: "#edf6ff",
			actorBorder: "#29415d",
			signalColor: "#73a7ff",
			signalTextColor: "#edf6ff"
		}
	});
</script>
```

This depends on the CDN being reachable when the page is viewed. That's an acceptable trade-off
for internal dev docs (not part of the graded 42 submission's runtime), but if `docs/human/` is ever
viewed somewhere offline, the diagrams will show as raw text instead of failing loudly — keep the
Mermaid source readable as plain text as a fallback, don't rely on the diagram rendering to convey
information the surrounding prose doesn't already state.

In a **root-level `README.md`** (or any plain Markdown viewed on GitHub), use a fenced
` ```mermaid ` block instead — GitHub renders these natively, no script needed. See `README.md`'s
architecture diagram for the pattern.

### Validate a diagram before committing it

Don't rely on visual inspection alone — `mermaid.parse()` will catch real syntax errors that are
easy to introduce (unbalanced brackets, a stray quote inside a quoted label, etc.). Quick one-off
check with Node + jsdom (no need to keep this installed; `npm install --no-save` and delete
afterward):

```bash
cd /tmp && npm install mermaid@11 jsdom --no-save
cat > mermaid_check.mjs <<'EOF'
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.SVGElement = dom.window.SVGElement;
const mermaid = (await import("mermaid")).default;
mermaid.initialize({ startOnLoad: false });
try {
	await mermaid.parse(`PASTE YOUR DIAGRAM SOURCE HERE`);
	console.log("OK");
} catch (e) {
	console.log("FAIL:", e.message);
}
EOF
node mermaid_check.mjs
```

## Wiring a new page into navigation

A new `docs/human/*.html` page is invisible until it's linked from somewhere. At minimum:

1. Add a row to [`../human/index.html`](../human/index.html)'s file table (`#files` section).
2. If it's something newcomers should read, add it to the same page's reading-order list
   (`#reading-order`) in the right position — not necessarily at the end; e.g. the terminology
   glossary was inserted *first* because every later page assumes its vocabulary.
3. Cross-link from any page whose content now overlaps (don't leave a page as a dead-end island —
   every page added so far links to at least one sibling).

A new `docs/ai/*.md` file: add a row to [README.md](./README.md)'s Documents table.

## Before editing: the five ways doc edits actually go wrong

Written 2026-08-09 after a run of documentation work in which an external audit (Codex) found 13
defects, then 10 more on re-audit, then 1 more after that. **The same failure mode produced most of
them, four rounds in a row.** Read this before touching `docs/`.

### 1. The same fact lives in N places. Count them before you edit.

This repo stores one fact across `docs/ai/` (English) + `docs/human/` (Japanese) + up to three
READMEs + code comments. Editing one of them is not "fixing" it — it is *creating a contradiction*.

Real examples from that run: "F-05 has 5 lobby areas" was corrected in `backlog.md` and left wrong in
`frontend.md` and two Japanese pages. "The engine is complete" was corrected in
`engine-separation.md` and left wrong in **six** other files. "GV-06 is done" was qualified in
`backlog.md` and left unqualified in **six** status pages.

**Do this first**: grep the fact you are about to change and count the hits. If the count is > 1,
fix them in the same commit or explicitly say in the commit body why you did not.

### 2. Your sweep pattern is narrower than you think.

Twice in that run a sweep was reported as "0 remaining" and a later audit found 5 more. Causes:

- Only the literal form was searched. `W-` also appears as `E/G/W/F`, `W-series`, `W/F-series`,
  「Wの保証」, 「Wは」.
- Only body text was searched. Page **footers**, `<title>`, nav labels and `card-label`s were missed.
- The pattern assumed a delimiter that isn't there in Japanese (see the `\b` note in `CLAUDE.md`).

**Do this**: search 3–4 spellings of the thing, not one. Then re-run the sweep after editing and
paste the count into the commit body.

### 3. A dropped issue still has live dependents.

When a module is un-declared, the issues that *consumed* it stay in the plan and quietly become
unbuildable. F-05 kept two of its five lobby areas after B-07 and B-13 were dropped — the Friends
area had no API and the match feed had no `match_result` source. Nobody noticed until an audit
traced the data flow.

**Do this**: after dropping anything, grep for its ID and read every consumer, not just the row you
dropped.

### 4. A "verified" claim must name the artifact that proves it.

The worst defect of the run was a *fix* that introduced a new false claim: GV-06/GV-07 were
described as "verified through `ws-check.ts`". `ws-check.ts` is a B-11/B-12/B-14 backend check that
never loads the frontend, Canvas, or `render.wasm`.

**Do this**: never write "done" / "verified" / "measured" without naming the test, script, or run
that produced it — and open that artifact to confirm it covers what you are claiming. If nothing
proves it, write that instead. "Code merged, acceptance not currently reproducible" is a legitimate
status.

### 5. Your own previous edit may now be the stale fact.

`backlog.md` justified creating B-17 by stating that `app/shared/src/ws/game.ts` "still says
implementation is optional" — true when written, false one PR later because that comment was fixed.

**Do this**: when a doc cites the *current state of a file*, re-check that citation any time you
touch the file it cites.

### The sweep to run after any factual edit

```bash
# 1. dead links (see the fuller script below)
# 2. HTML tag balance
for f in $(find docs -name '*.html'); do
  for tag in div section article table thead tbody tr td th p a code span strong li em; do
    o=$(grep -o "<$tag[ >]" "$f" | wc -l); c=$(grep -o "</$tag>" "$f" | wc -l)
    [ "$o" != "$c" ] && echo "IMBALANCE $(basename $f) <$tag> $o/$c"
  done
done
# 3. MD028 (blank line inside a blockquote) — use `>` instead of an empty line
python3 -c "
import io,os
for dp,_,fs in os.walk('docs'):
    for fn in [f for f in fs if f.endswith('.md')]:
        p=os.path.join(dp,fn); L=io.open(p,encoding='utf-8').read().split(chr(10))
        for i in range(1,len(L)-1):
            if L[i].strip()=='' and L[i-1].startswith('>') and L[i+1].startswith('>'): print('MD028',p,i+1)"
# 4. the fact you just changed — re-grep it, in several spellings
```

Japanese companion (principles, for human editors):
[`../human/運用/ドキュメント作法.html`](../human/運用/ドキュメント作法.html).

## Before committing: check for dead links

Same discipline that caught real broken links across four separate docs PRs — run this after any
edit that touches links, renames a file, or adds a new page (adjust the `targets` walk if you're
only touching one subtree):

```python
import re, os, html
repo = os.path.abspath('.')
targets = ['README.md', 'infra/README.md', 'web/README.md']
for dirpath, dirs, files in os.walk('docs'):
    for fn in files:
        if fn.endswith('.html') or fn.endswith('.md'):
            targets.append(os.path.join(dirpath, fn))

def check(path):
    text = open(path, encoding='utf-8').read()
    d = os.path.dirname(os.path.abspath(path))
    for pat in [r'href="([^"]+)"', r'\]\(([^)]+)\)', r'src="([^"]+)"']:
        for m in re.finditer(pat, text):
            target = html.unescape(m.group(1))
            if target.startswith(('http', 'mailto:', '#')) or not target:
                continue
            resolved = os.path.normpath(os.path.join(d, target.split('#')[0]))
            if not os.path.exists(resolved):
                print(f"BROKEN in {os.path.relpath(path, repo)}: {target}")

for t in targets:
    check(t)
```

This only checks that the target *exists on disk* — it can't tell you a link points at the wrong
(but existing) file, so still read the diff.

## Status and team-attribution rules

These come up constantly when editing anything that mentions progress or who did what. Full
context: [`../human/はじめに/チーム体制.html`](../human/はじめに/チーム体制.html) is the authoritative source for current
team status.

- Never state a former or historical-period team member (mamiyaza / hminemur — and torinoue for the
  2026-08-05–2026-08-30 window, since torinoue rejoined 2026-08-30 as PM) as a **current** owner of
  unfinished work from a period before they held that role. Use **完了 (done) / 未完成 (not started) /
  担当未定 (unassigned)** instead of a name for anything not finished, unless you've checked the
  current roster in チーム体制.html and GitHub Issue assignees.
- Historical mentions (who actually built the thing that's now done, when a decision was made) are
  fine to keep — the distinction is "is this describing the past" vs. "is this implying someone is
  currently working on this." When historical content could be misread as a live assignment, add
  an explicit disclaimer rather than deleting the history (see `docs/ai/architecture.md` §6/§9 for
  the pattern: the original 4-person plan is preserved as a table, with a note above it saying it's
  superseded and pointing at the current source of truth).
- Before writing any progress claim ("X is done", "Y is not started"), verify it against
  `docs/ai/backlog.md` and, if there's any doubt, against `git log origin/main` directly — this
  repo has been caught out more than once by a doc claiming something was unimplemented when
  `origin/main` had already shipped it (or vice versa). Don't guess from memory of an earlier
  session.
- **Don't put GitHub-coverable status in `docs/` at all** (decided 2026-08-30 — see
  `docs/drafts/141-docs-restructure.md` for the discussion). Progress counts, completion
  percentages, per-issue status tags, and "N of M done" cards belong in GitHub Issues/Projects, not
  a `docs/` page, even as a "helpful at-a-glance summary" — that summary duplicates GitHub and starts
  going stale the moment either side moves (this repo has already removed several: the root
  README's status table, `評価対応/42モジュール対応表.html`'s completion tags, and the
  `開発状況/` pages' progress grids and per-issue card sections). `docs/ai/backlog.md` keeps
  acceptance criteria, dependencies, and the decision log — it does not restate current % done. If
  you're about to add a status grid, progress bar, or completion tag to a `docs/` page, link to
  GitHub instead.
- **Refer to individuals by role, not name, in prose** (decided 2026-08-30) — "the Technical Lead"
  rather than a person's name — so text doesn't need editing every time someone changes roles. The
  one exception is a page whose actual purpose is declaring who currently holds each role
  (`チーム体制.html`'s roster table, root `README.md`'s Team table) — those need real names to do
  their job; this rule is for narrative prose elsewhere.
