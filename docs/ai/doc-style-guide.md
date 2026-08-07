# DOC_STYLE_GUIDE — How to Write a Page in `docs/`

> Not translated from an older document — written new on 2026-08-08, after repeatedly having to
> re-derive the same conventions (page template, when to use Mermaid, how to validate a diagram,
> how to check for dead links) from scratch across several docs PRs. Read this before adding or
> restructuring anything under `docs/`.

**Position**: This is process/authoring guidance, not a design document — it does not describe the
product, only how to write and wire up a documentation page. Companion to
[git-workflow.md](./git-workflow.md) (how changes land) and
[../ja/Git運用フロー.html](../ja/Git運用フロー.html) (its Japanese counterpart).

## The two tracks, and which one a new page belongs in

| | `docs/ai/` | `docs/ja/` |
|---|---|---|
| Language | English | Japanese |
| Format | Markdown (`.md`) | HTML (`.html`) |
| Audience | An AI coding assistant | samatsum |
| Filename style | English, kebab-case (`ws-protocol.md`, `doc-style-guide.md`) | Descriptive Japanese, not a literal translation or romanization (`チーム体制.html`, not `team-plan.html` or `chiimu-taisei.html`) |

If content is genuinely reference material an AI would consult while implementing (protocol specs,
backlog, coding rules, git process) → `docs/ai/`. If it's something samatsum reads to understand
or learn the project (onboarding, terminology, conceptual "why is it built this way" explanations,
the project overview) → `docs/ja/`. When in doubt, lean toward writing *both*: an English `.md` for
the mechanical facts, a Japanese `.html` companion for the narrative/visual version — see how
[architecture.md](./architecture.md) and [`../ja/プロジェクト概要.html`](../ja/プロジェクト概要.html)
or [git-workflow.md](./git-workflow.md) and [`../ja/Git運用フロー.html`](../ja/Git運用フロー.html)
pair up. When you do pair them, put the authoritative source of anything mechanical (shell
commands, exact file paths) in **one** of the two and have the other link out to it — don't
maintain the same command block in two places, they will drift.

## HTML page template

Every `docs/ja/*.html` page follows the same skeleton. Copy an existing page
(`docs/ja/チーム体制.html` is a good short example) rather than writing one from scratch:

```html
<!doctype html>
<html lang="ja">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="color-scheme" content="dark">
	<title>ページ名 — ft_transcendence</title>
	<link rel="stylesheet" href="./assets/style.css">  <!-- or ../assets/style.css if one level deep -->
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
`チーム体制.html` for an example of a page without one.

## The shared stylesheet (`docs/ja/assets/style.css`)

One stylesheet, referenced by every `docs/ja/*.html` page — never write page-specific `<style>`
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
| Big numbers | `.metric` / `.metric-note` inside a `.card` — **only for things that are actually counts**; an Issue id like "W-13" displayed at this size reads as a number, prefix it so it's unambiguous (a CodeRabbit review caught exactly this on `サーバー開発工程.html`) |
| Long quoted narration | `.script` wrapping a `<blockquote>` |
| Code | Plain `<pre><code>…</code></pre>` for actual code/commands/terminal output. **Not** for diagrams — see below |

Full source: [`../ja/assets/style.css`](../ja/assets/style.css) — its own header comment says what
it's for and where it's referenced from; keep that comment accurate if you move things around
(caught stale twice already: once pointing at an archived path, once at the pre-rename `md_files/`
directory name).

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
  `docs/ja/explanations/サーバ権威モデル.html`'s remaining plain-text diagrams for examples that
  were deliberately left alone.
- **A literal file-format example, directory listing, or code/terminal output** → plain
  `<pre><code>`, never Mermaid — Mermaid renders relationships/flow, not arbitrary text layout.

### How to embed a Mermaid diagram in a `docs/ja/*.html` page

These are static files with no build step — Mermaid isn't natively available like it is inside a
published Claude Artifact. Load it from a CDN and initialize with theme colors matching
`assets/style.css`'s palette (`--bg #07111f`, `--panel #12243a`, `--line #29415d`,
`--text #edf6ff`, `--cyan #5de4d6`). Put the diagram in a `<pre class="mermaid">` block, and add
this script once, right before `</body>` (copy from `docs/ja/explanations/サーバ権威モデル.html`
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
for internal dev docs (not part of the graded 42 submission's runtime), but if `docs/ja/` is ever
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

A new `docs/ja/*.html` page is invisible until it's linked from somewhere. At minimum:

1. Add a row to [`../ja/index.html`](../ja/index.html)'s file table (`#files` section).
2. If it's something newcomers should read, add it to the same page's reading-order list
   (`#reading-order`) in the right position — not necessarily at the end; e.g. the terminology
   glossary was inserted *first* because every later page assumes its vocabulary.
3. Cross-link from any page whose content now overlaps (don't leave a page as a dead-end island —
   every page added so far links to at least one sibling).

A new `docs/ai/*.md` file: add a row to [README.md](./README.md)'s Documents table.

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
context: [`../ja/チーム体制.html`](../ja/チーム体制.html) is the authoritative source for current
team status.

- Never state a former team member (torinoue / mamiyaza / hminemur) as a **current** owner of
  unfinished work. Use **完了 (done) / 未完成 (not started) / 担当未定 (unassigned)** instead of a
  name for anything not finished.
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
