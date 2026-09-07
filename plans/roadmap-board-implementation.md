# Roadmap Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, live Kanban page of `plans/roadmap-2026-09.md` — cards in lanes, drag to move, each card showing what blocks it and what it blocks — so the dependency graph stops living in Caelan's head.

**Architecture:** The board is a single self-contained HTML page published as a **private claude.ai Artifact** with the `db` runtime capability. Card state (lane, order, blockers) lives in the artifact's own JSON document store, **seeded from the roadmap markdown** by the orchestrator via `write_db` — never hardcoded in the page. The page's logic lives in a pure ES module (`board-model.js`) that is node-tested and inlined into the page by a build step, the same way this repo's `tools/gen_*.py` scripts generate assets. A dependency view is a Mermaid graph regenerated from the same data; artifacts render Mermaid natively, no library.

**Tech Stack:** Vanilla HTML/CSS/JS, native HTML5 drag-and-drop, `node --test`, Python (build step), claude.ai Artifact runtime contract 0.2.41 (`db` capability). No CDN dependencies — the artifact CSP allows only a short allowlist and the page needs none of it.

**Orchestration (Caelan's ask):** Fable is the orchestrator and does the two things only its tools can do — **publish** and **seed the db**. Agents are dispatched per task:

| Task | Model | Why that model |
|---|---|---|
| 1 · Extract cards from the markdown | **Haiku** | Mechanical parsing with a test that pins the output |
| 2 · The pure model + tests | **Sonnet** | Small, well-specified logic; TDD |
| 3 · The page | **Sonnet** | Integration — must load the `artifact-design` skill first |
| 4 · Build, publish, seed, verify | **Fable** | `Artifact` / `write_db` are orchestrator tools |
| 5 · Design + review pass | **Opus** | Judgment: theme, hierarchy, a11y, "does the graph read" |
| 6 · Sync-back exporter | **Haiku** | Mechanical; droppable if the session runs long |

**Where things live:** page source under `tools/roadmap-board/` (it is project tooling, not game code — same home as the generators). Committed on `dev`. The published artifact is a *build output* of that source.

**How Caelan views it:** the Artifact tool returns a `claude.ai/code/artifact/<id>` URL on first publish. It is **private** — visible in his gallery (claude.ai/code/artifacts; `/artifacts` in the terminal; ctrl+] reopens the latest) and to nobody else unless he shares the link. Republishing the same source file redeploys to the same URL.

**Stronger than private-by-default:** the `db` contract (0.2.41) states that a `db`-declaring artifact is *organization-internal and cannot be shared publicly* — every reader and writer must be a signed-in member of the owner's organization. So the board is structurally incapable of becoming a public page. The flip side: anyone in the org with the link can *write* the store, which is why every db value is treated as untrusted in the page (Task 3).

**Contract facts the page and the seed rely on** (from `db.d.ts`, read 2026-09-07):
- `update()` **requires the document to exist** (rejects `invalid_argument` otherwise). The seed uses `set`, so every card exists before the page ever calls `update`.
- Document paths: `cards/<id>` is 2 segments — a document. Ids may use letters, digits and `_ - . ~ : @ +` only; the extractor's slugs and the ruling codes all comply.
- Bodies are plain objects ≤ 256 KiB; the store holds ≤ 5,000 documents. ~50 cards is nothing.
- Without `orderBy`, a query delivers docs in id order; `byLane` sorts by `order` anyway.
- One subscription per view (cap is 64). A drag is one `update`. Nothing here approaches a rate limit.

**Orchestrator discipline, learned the hard way on Task 1:** never edit the working tree while an implementer agent is running on it — the agent's process reverted two uncommitted plan edits underneath the orchestrator. Commit controller edits *before* dispatching, or wait for the agent to land.

---

## File Structure

**Create:**
- `tools/roadmap-board/extract-roadmap.mjs` — parses `plans/roadmap-2026-09.md` tables → `cards.json`. Pure; node-tested.
- `tools/roadmap-board/cards.json` — the generated seed snapshot. Committed, so the seed is reproducible.
- `tools/roadmap-board/board-model.js` — pure ES module: lane definitions, ordering, blocker index, Mermaid string. Node-tested. **No DOM, no `claude`.**
- `tools/roadmap-board/page.html` — the page body: `<title>`, `<style>`, markup, and a `<script>` that imports nothing (the model is inlined at build). **No doctype/html/head/body** — the artifact wraps it.
- `tools/roadmap-board/build.py` — inlines `board-model.js` into `page.html` → `tools/roadmap-board/dist/index.html`. The file Fable publishes.
- `tools/roadmap-board/export-board.mjs` — (Task 6) `read_db` JSON → regenerated markdown lanes.
- `tests/roadmap-extract.test.js`, `tests/roadmap-board-model.test.js`

**Data model — the `db` collections the page and the seed agree on:**

```
cards/<id>          one document per roadmap item
  id        string   stable slug, e.g. "A1", "B2", "zone-3", "ship-v0-22"
  title     string
  lane      "now" | "rulings" | "ready" | "design" | "later" | "done"
  order     number   position within the lane (float, so inserts need no renumbering)
  kind      "ruling" | "build" | "design" | "later" | "done"
  size      "S" | "M" | "L" | ""
  blockedBy string[] card ids
  doc       string   where the spec lives, e.g. "plans/zone-identity.md §1"
  note      string   the one-line description
meta/board          { lanes: [...], seededFrom: "plans/roadmap-2026-09.md", seededAt: iso }
```

`blocks` is **derived** (the inverse of `blockedBy`), never stored — one source of truth for an edge.

---

### Task 1: Extract cards from the roadmap markdown — **Haiku**

**Files:**
- Create: `tools/roadmap-board/extract-roadmap.mjs`
- Create: `tools/roadmap-board/cards.json` (generated)
- Test: `tests/roadmap-extract.test.js`

The roadmap's lanes are the markdown tables under §1–§5 and the DONE table under §6. Each table row is one card. The lane is the section it sits in. Ids: rulings already carry short codes in their first column (`A1`, `Z1`, `B3`, `P2`…) — use those verbatim. Everything else gets a slug from the title.

- [ ] **Step 1: Write the failing test**

Create `tests/roadmap-extract.test.js`:

```javascript
// roadmap-extract.test.js — the roadmap markdown becomes the board's seed.
//
// The board is seeded from plans/roadmap-2026-09.md, not hand-typed, so the
// two cannot drift at seed time. This pins the parse: lanes map to sections,
// ruling ids survive verbatim, and every card has the fields the page needs.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractCards, LANE_FOR_SECTION } from '../tools/roadmap-board/extract-roadmap.mjs';

const SAMPLE = `
## 1. NOW — in flight on \`dev\`

| Item | State | Size | Doc |
|---|---|---|---|
| **Ship v0.22.0 to \`main\`** | held | S | \`plans/demo-readiness.md\` §0 |

## 2. RULINGS CAELAN OWES — cheap

| # | Ruling | What it gates | Source |
|---|---|---|---|
| **A1** | **The −15 armor band has no Law 4 row.** Is it 15–40? | Pike's kit, the boss line | A1 |
| **Z1** | **Vendor Interior Pack?** | Zone §1 | zone-identity |

## 3. READY TO BUILD — design settled

| Item | Size | Blocked by | Doc | Where |
|---|---|---|---|---|
| **B1 — first real boss** | L | **A1, A4** | Law 5 never ran. | dev |
| **B2 — enemies eat kits** | M | nothing | Diegetic. | dev |

## 6. DONE — do NOT re-implement

| Parked as open in | Item | Shipped as |
|---|---|---|
| C2 | No modifier-key guard | checked in game/ |
`;

describe('extractCards', () => {
    test('maps each numbered section to a lane', () => {
        assert.equal(LANE_FOR_SECTION['1'], 'now');
        assert.equal(LANE_FOR_SECTION['2'], 'rulings');
        assert.equal(LANE_FOR_SECTION['3'], 'ready');
        assert.equal(LANE_FOR_SECTION['4'], 'design');
        assert.equal(LANE_FOR_SECTION['5'], 'later');
        assert.equal(LANE_FOR_SECTION['6'], 'done');
    });

    test('one card per table row, in the right lane', () => {
        const cards = extractCards(SAMPLE);
        assert.equal(cards.length, 6);
        assert.deepEqual(cards.map(c => c.lane), ['now', 'rulings', 'rulings', 'ready', 'ready', 'done']);
    });

    test('ruling ids survive verbatim', () => {
        const ids = extractCards(SAMPLE).map(c => c.id);
        assert.ok(ids.includes('A1'));
        assert.ok(ids.includes('Z1'));
    });

    test('blockedBy parses the "Blocked by" column into ids, and "nothing" into []', () => {
        const cards = extractCards(SAMPLE);
        const b1 = cards.find(c => c.title.startsWith('B1'));
        const b2 = cards.find(c => c.title.startsWith('B2'));
        assert.deepEqual(b1.blockedBy, ['A1', 'A4']);
        assert.deepEqual(b2.blockedBy, []);
    });

    test('titles are stripped of markdown emphasis', () => {
        const ship = extractCards(SAMPLE).find(c => c.lane === 'now');
        assert.equal(ship.title, 'Ship v0.22.0 to `main`');
    });

    test('every card has every field the page needs', () => {
        for (const c of extractCards(SAMPLE)) {
            for (const k of ['id', 'title', 'lane', 'order', 'kind', 'size', 'blockedBy', 'doc', 'note']) {
                assert.ok(k in c, `${c.id ?? '?'} missing ${k}`);
            }
            assert.ok(Array.isArray(c.blockedBy));
        }
    });

    test('order is unique within a lane and increases in document order', () => {
        const cards = extractCards(SAMPLE);
        const ready = cards.filter(c => c.lane === 'ready');
        assert.ok(ready[0].order < ready[1].order);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test tests/roadmap-extract.test.js
```
Expected: FAIL — `Cannot find module '../tools/roadmap-board/extract-roadmap.mjs'`.

- [ ] **Step 3: Write the extractor**

Create `tools/roadmap-board/extract-roadmap.mjs`:

```javascript
// extract-roadmap.mjs — plans/roadmap-2026-09.md tables -> cards.json
//
// The board is seeded from this output, so the markdown stays the committed
// record and the board is a view of it. Lanes are the numbered sections; each
// table row is a card. Run: node tools/roadmap-board/extract-roadmap.mjs
//
// Pure: extractCards(markdown) -> cards[]. The file I/O is at the bottom.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const LANE_FOR_SECTION = {
    '1': 'now', '2': 'rulings', '3': 'ready', '4': 'design', '5': 'later', '6': 'done',
};

// Lane -> the card kind the page colours by. Rulings are their own kind.
const KIND_FOR_LANE = {
    now: 'build', rulings: 'ruling', ready: 'build', design: 'design', later: 'later', done: 'done',
};

const strip = s => s
    .replace(/\*\*/g, '')          // bold
    .replace(/(^|[^`])\*(?!\*)/g, '$1')  // stray single asterisks
    .replace(/<br\s*\/?>/g, ' ')
    .trim();

const slug = s => strip(s)
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

// A ruling row leads with a short code in bold: "**A1**", "**Z2**", "**AU**".
const RULING_ID = /^\*{0,2}([A-Z]{1,2}\d?)\*{0,2}$/;

function parseBlockedBy(cell) {
    const s = strip(cell);
    if (!s || /^nothing$/i.test(s)) return [];
    // "**A1, A4**" or "A1, A4" -> ids. Ignore prose like "needs 0".
    return s.split(/[,/]/).map(x => x.trim()).filter(x => RULING_ID.test(x) || /^[A-Z]\d$/.test(x))
        .map(x => x.replace(/\*/g, ''));
}

function splitRow(line) {
    // "| a | b | c |" -> ["a","b","c"], tolerating escaped pipes inside code spans.
    const cells = [];
    let cur = '', inCode = false;
    for (let i = 1; i < line.length; i++) {
        const ch = line[i];
        if (ch === '`') inCode = !inCode;
        if (ch === '|' && !inCode) { cells.push(cur); cur = ''; continue; }
        cur += ch;
    }
    return cells.map(c => c.trim()).filter((_, i, a) => !(i === a.length - 1 && a[i] === ''));
}

export function extractCards(markdown) {
    const lines = markdown.split(/\r?\n/);
    const cards = [];
    let lane = null, header = null, orderInLane = {};

    for (const raw of lines) {
        const line = raw.trimEnd();
        const sec = line.match(/^## (\d)\./);
        if (sec) { lane = LANE_FOR_SECTION[sec[1]] ?? null; header = null; continue; }
        if (!lane || !line.startsWith('|')) { if (!line.startsWith('|')) header = null; continue; }

        const cells = splitRow(line);
        if (cells.every(c => /^:?-+:?$/.test(c))) continue;          // the |---| separator
        if (!header) { header = cells.map(h => strip(h).toLowerCase()); continue; }

        const col = name => {
            const i = header.findIndex(h => h.includes(name));
            return i >= 0 ? (cells[i] ?? '') : '';
        };

        // Which column is the title depends on the table. Rulings: "#" then "ruling".
        // NOW/READY/DESIGN/LATER: "item" or "thread". DONE: "item".
        const idCell = col('#');
        const titleCell = col('ruling') || col('item') || col('thread') || cells[0];
        const m = strip(idCell).match(RULING_ID);
        const id = m ? m[1] : slug(titleCell);
        if (!id) continue;

        orderInLane[lane] = (orderInLane[lane] ?? 0) + 10;
        cards.push({
            id,
            title: strip(titleCell).replace(/\.$/, ''),
            lane,
            order: orderInLane[lane],
            kind: KIND_FOR_LANE[lane],
            size: strip(col('size')).replace(/[^SML–\-]/g, '').slice(0, 3),
            blockedBy: parseBlockedBy(col('blocked by')),
            doc: strip(col('doc') || col('source') || col('where') || col('shipped as')),
            note: strip(col('state') || col('what it gates') || col('one line') || col('open questions') || col('shipped as') || ''),
        });
    }
    return cards;
}

// CLI: regenerate cards.json beside this file.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const here = dirname(fileURLToPath(import.meta.url));
    const md = readFileSync(join(here, '..', '..', 'plans', 'roadmap-2026-09.md'), 'utf8');
    const cards = extractCards(md);
    writeFileSync(join(here, 'cards.json'), JSON.stringify(cards, null, 2) + '\n');
    console.log(`wrote ${cards.length} cards to cards.json`);
}
```

- [ ] **Step 4: Run the test**

```bash
node --test tests/roadmap-extract.test.js
```
Expected: PASS, 7 tests. If a title/blockedBy assertion fails, fix the parser — do not loosen the assertion.

- [ ] **Step 5: Generate the real seed and sanity-check it**

```bash
node tools/roadmap-board/extract-roadmap.mjs
node -e "const c=require('./tools/roadmap-board/cards.json');const l={};for(const x of c)l[x.lane]=(l[x.lane]||0)+1;console.log(c.length,'cards',JSON.stringify(l));const ids=c.map(x=>x.id);const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);console.log('duplicate ids:',dup.length?dup:'none');const dangling=c.flatMap(x=>x.blockedBy.filter(b=>!ids.includes(b)));console.log('dangling blockedBy:',dangling.length?dangling:'none');"
```
Expected: roughly **45–55 cards**, all six lanes populated, **no duplicate ids, no dangling blockedBy**. If a blocker points at an id that does not exist, the roadmap uses a name the extractor did not map — fix the extractor's id derivation, and report which.

- [ ] **Step 6: Commit**

```bash
git add tools/roadmap-board/extract-roadmap.mjs tools/roadmap-board/cards.json tests/roadmap-extract.test.js
git commit -m "tool(roadmap): extract the roadmap's tables into a board seed

The Kanban board is seeded from plans/roadmap-2026-09.md rather than
typed by hand, so the markdown stays the committed record and the board
is a view of it. One card per table row; lane is the section; ruling
ids survive verbatim so blockedBy edges resolve.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The pure board model — **Sonnet**

**Files:**
- Create: `tools/roadmap-board/board-model.js`
- Test: `tests/roadmap-board-model.test.js`

Everything the page computes that does not need a DOM: lane order, sorting, the blocker index (both directions), a "what is unblocked right now" query, and the Mermaid source for the graph view. Node-tested; inlined into the page by Task 4's build.

- [ ] **Step 1: Write the failing test**

Create `tests/roadmap-board-model.test.js`:

```javascript
// roadmap-board-model.test.js — the board's logic, with no DOM.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LANES, byLane, blockerIndex, unblocked, mermaidSource, moveCard } from '../tools/roadmap-board/board-model.js';

const cards = [
    { id: 'A1', title: 'The -15 band', lane: 'rulings', order: 10, kind: 'ruling', blockedBy: [] },
    { id: 'A4', title: 'Boss tag',     lane: 'rulings', order: 20, kind: 'ruling', blockedBy: [] },
    { id: 'B1', title: 'First boss',   lane: 'ready',   order: 10, kind: 'build',  blockedBy: ['A1', 'A4'] },
    { id: 'B2', title: 'Eat kits',     lane: 'ready',   order: 20, kind: 'build',  blockedBy: [] },
    { id: 'C2', title: 'Modifier keys',lane: 'done',    order: 10, kind: 'done',   blockedBy: [] },
];

describe('LANES', () => {
    test('six lanes in board order', () => {
        assert.deepEqual(LANES.map(l => l.id), ['now', 'rulings', 'ready', 'design', 'later', 'done']);
    });
});

describe('byLane', () => {
    test('groups and sorts by order', () => {
        const g = byLane(cards);
        assert.deepEqual(g.rulings.map(c => c.id), ['A1', 'A4']);
        assert.deepEqual(g.ready.map(c => c.id), ['B1', 'B2']);
        assert.deepEqual(g.now, []);            // every lane present, even empty
    });
});

describe('blockerIndex', () => {
    test('derives blocks as the inverse of blockedBy', () => {
        const ix = blockerIndex(cards);
        assert.deepEqual(ix.blocks.A1, ['B1']);
        assert.deepEqual(ix.blocks.A4, ['B1']);
        assert.deepEqual(ix.blockedBy.B1, ['A1', 'A4']);
        assert.deepEqual(ix.blocks.B2 ?? [], []);
    });

    test('a blocker that is done no longer counts as blocking', () => {
        const ix = blockerIndex([...cards, { id: 'X', title: 'x', lane: 'ready', order: 30, kind: 'build', blockedBy: ['C2'] }]);
        assert.deepEqual(ix.openBlockedBy.X, []);       // C2 is done
        assert.deepEqual(ix.openBlockedBy.B1, ['A1', 'A4']);
    });
});

describe('unblocked', () => {
    test('returns buildable cards whose open blockers are all done', () => {
        const ids = unblocked(cards).map(c => c.id);
        assert.ok(ids.includes('B2'));
        assert.ok(!ids.includes('B1'));
        assert.ok(!ids.includes('C2'));          // done is not "unblocked", it is finished
        assert.ok(!ids.includes('A1'));          // rulings are decisions, not builds
    });
});

describe('mermaidSource', () => {
    test('emits one node per card with an edge, and one edge per blockedBy', () => {
        const src = mermaidSource(cards);
        assert.match(src, /^flowchart LR/);
        assert.match(src, /A1 --> B1/);
        assert.match(src, /A4 --> B1/);
        assert.ok(!src.includes('C2'), 'done cards with no edges are omitted');
    });

    test('escapes quotes in titles', () => {
        const src = mermaidSource([{ id: 'Q', title: 'say "hi"', lane: 'ready', order: 1, kind: 'build', blockedBy: ['A1'] }, cards[0]]);
        assert.ok(!src.includes('say "hi"'));
    });
});

describe('moveCard', () => {
    test('moves to a new lane at the end when no target given', () => {
        const next = moveCard(cards, 'B2', { lane: 'now' });
        const b2 = next.find(c => c.id === 'B2');
        assert.equal(b2.lane, 'now');
        assert.ok(b2.order > 0);
    });

    test('inserts before a target card by halving the gap, so nothing else renumbers', () => {
        const next = moveCard(cards, 'B2', { lane: 'rulings', before: 'A4' });
        const b2 = next.find(c => c.id === 'B2');
        assert.equal(b2.lane, 'rulings');
        assert.ok(b2.order > 10 && b2.order < 20);
        assert.equal(next.find(c => c.id === 'A1').order, 10);
        assert.equal(next.find(c => c.id === 'A4').order, 20);
    });

    test('does not mutate its input', () => {
        const before = JSON.stringify(cards);
        moveCard(cards, 'B2', { lane: 'now' });
        assert.equal(JSON.stringify(cards), before);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test tests/roadmap-board-model.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the model**

Create `tools/roadmap-board/board-model.js`:

```javascript
// board-model.js — the roadmap board's logic, with no DOM and no `claude`.
//
// Pure so it can be node-tested. The page inlines this file at build time
// (tools/roadmap-board/build.py) — do not import anything here, and do not
// reference window/document. The artifact runtime is wired in page.html.

export const LANES = [
    { id: 'now',     label: 'Now',            hint: 'in flight on dev' },
    { id: 'rulings', label: 'Rulings owed',   hint: 'no code — each one gates something' },
    { id: 'ready',   label: 'Ready to build', hint: 'design settled, a plan exists' },
    { id: 'design',  label: 'Needs design',   hint: 'open questions first' },
    { id: 'later',   label: 'Post-1.0',       hint: 'scoped, none started' },
    { id: 'done',    label: 'Done',           hint: 'do not re-implement' },
];

const isDone = c => c.lane === 'done';

export function byLane(cards) {
    const out = Object.fromEntries(LANES.map(l => [l.id, []]));
    for (const c of cards) (out[c.lane] ??= []).push(c);
    for (const k in out) out[k].sort((a, b) => a.order - b.order);
    return out;
}

// blocks   : id -> ids it blocks          (derived — the inverse of blockedBy)
// blockedBy: id -> ids that block it      (as stored)
// openBlockedBy: same, minus blockers that are already done
export function blockerIndex(cards) {
    const byId = Object.fromEntries(cards.map(c => [c.id, c]));
    const blocks = {}, blockedBy = {}, openBlockedBy = {};
    for (const c of cards) {
        blockedBy[c.id] = [...(c.blockedBy ?? [])];
        openBlockedBy[c.id] = blockedBy[c.id].filter(b => byId[b] && !isDone(byId[b]));
        for (const b of blockedBy[c.id]) (blocks[b] ??= []).push(c.id);
    }
    return { blocks, blockedBy, openBlockedBy };
}

// Cards you could start right now: buildable, not done, and every blocker done.
export function unblocked(cards) {
    const ix = blockerIndex(cards);
    return cards.filter(c => c.kind !== 'ruling' && !isDone(c) && ix.openBlockedBy[c.id].length === 0);
}

const mmId = id => id.replace(/[^A-Za-z0-9_]/g, '_');
const mmLabel = c => `${c.id}: ${c.title}`.replace(/"/g, "'").replace(/[<>]/g, '');

// One node per card that participates in an edge; one edge per blockedBy.
// Cards with no edges are omitted so the graph shows structure, not a list.
export function mermaidSource(cards) {
    const byId = Object.fromEntries(cards.map(c => [c.id, c]));
    const inEdge = new Set();
    const edges = [];
    for (const c of cards) for (const b of c.blockedBy ?? []) {
        if (!byId[b]) continue;
        inEdge.add(c.id); inEdge.add(b);
        edges.push(`    ${mmId(b)} --> ${mmId(c.id)}`);
    }
    const nodes = cards.filter(c => inEdge.has(c.id))
        .map(c => `    ${mmId(c.id)}["${mmLabel(c)}"]:::${c.kind}`);
    return [
        'flowchart LR',
        '    classDef ruling fill:#f3d9a4,stroke:#8a5a2c,color:#2a1f06',
        '    classDef build  fill:#cfe8c9,stroke:#3a6b35,color:#0f2a0d',
        '    classDef design fill:#d9d4ee,stroke:#5a4a8a,color:#1f1a33',
        '    classDef later  fill:#e6e6e6,stroke:#777,color:#333',
        '    classDef done   fill:#dfe9e0,stroke:#6a8a6e,color:#243326,stroke-dasharray:4 3',
        ...nodes, ...edges,
    ].join('\n');
}

// Returns a NEW array. `before` = insert ahead of that card; omitted = append.
export function moveCard(cards, id, { lane, before }) {
    const lanes = byLane(cards);
    const target = lanes[lane] ?? [];
    let order;
    if (before) {
        const i = target.findIndex(c => c.id === before);
        const next = target[i]?.order ?? 0;
        const prev = i > 0 ? target[i - 1].order : 0;
        order = (prev + next) / 2;
    } else {
        order = (target.at(-1)?.order ?? 0) + 10;
    }
    return cards.map(c => c.id === id ? { ...c, lane, order } : c);
}
```

- [ ] **Step 4: Run the test**

```bash
node --test tests/roadmap-board-model.test.js
```
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/roadmap-board/board-model.js tests/roadmap-board-model.test.js
git commit -m "tool(roadmap): the board model, pure and node-tested

Lane order, the blocker index in both directions, an 'unblocked right
now' query, Mermaid source for the graph view, and a move that inserts
by halving the gap so nothing else renumbers. No DOM, no claude - the
page inlines this at build time.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The page — **Sonnet**

**Files:**
- Create: `tools/roadmap-board/page.html`

**BEFORE WRITING A LINE:** invoke the `artifact-design` skill (`Skill` tool, name `artifact-design`) and follow it. It calibrates how much design the page warrants and carries the theme rules. Then read the capability contract at the path the `artifact-capabilities` skill names for `db.d.ts` — the call shapes below were written against contract 0.2.41 and the `.d.ts` is authoritative if they differ.

**What the page is.** Six lanes as columns. Cards drag between lanes and reorder within one (native HTML5 DnD). Each card shows its id, title, size, and two chip rows — **blocked by** and **blocks** — derived from the model. Hovering or focusing a card highlights every card it is connected to and dims the rest. A **Graph** toggle swaps the board for the Mermaid dependency view. An **Unblocked now** strip at the top lists what could start today. State is read from and written to the artifact `db`; with no `db` (the promise resolves `null`) the page renders the seed embedded at build time **read-only** and says so.

**Artifact rules this page must obey** (from the tool contract — the page will silently break otherwise):
- **No `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>`** — write the body content directly. Put `<title>` and `<style>` at the top.
- `<title>` is a **name**: `Violencetown Board`. Not a summary.
- **Theme-aware:** define the full light palette on bare `:root`; redefine only the tokens under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`; redefine again under `:root[data-theme="dark"]`. Give `body` an explicit token background.
- **No external scripts or stylesheets.** Nothing on the allowlist is needed. Inline everything.
- Mermaid renders natively from `<pre class="mermaid">` — **do not load a Mermaid library.**
- Toggle visibility with `el.hidden`, not `style.display` — the wrapper reset defines `[hidden]`.
- Wide content scrolls inside its own `overflow-x: auto` container; the body never scrolls horizontally.

**The runtime wiring.** The model is inlined by the build at the marker `/* @@BOARD_MODEL@@ */`, and the seed at `/* @@SEED@@ */`. Write against those two markers exactly.

```html
<title>Violencetown Board</title>
<style>
  :root {
    --bg: #f6f1e7; --panel: #fffaf0; --ink: #2a1f06; --muted: #7a6a4a;
    --line: #d9c9a8; --accent: #8a5a2c; --gold: #d4b96a;
    --ruling: #f3d9a4; --build: #cfe8c9; --design: #d9d4ee; --later: #e6e6e6; --done: #dfe9e0;
    --lift: 0 2px 8px rgba(42,31,6,.12);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #1a1610; --panel: #241f16; --ink: #f3e3c0; --muted: #b9a684;
      --line: #4a3d28; --accent: #d4b96a; --gold: #d4b96a;
      --ruling: #4a3a1a; --build: #223a22; --design: #2c2640; --later: #333; --done: #1f2a20;
      --lift: 0 2px 10px rgba(0,0,0,.5);
    }
  }
  :root[data-theme="dark"] {
    --bg: #1a1610; --panel: #241f16; --ink: #f3e3c0; --muted: #b9a684;
    --line: #4a3d28; --accent: #d4b96a; --gold: #d4b96a;
    --ruling: #4a3a1a; --build: #223a22; --design: #2c2640; --later: #333; --done: #1f2a20;
    --lift: 0 2px 10px rgba(0,0,0,.5);
  }
  body { background: var(--bg); color: var(--ink); font: 14px/1.4 ui-monospace, "Cascadia Mono", Consolas, monospace; }
  /* …layout: a header bar, the Unblocked strip, a horizontally scrolling lane rail,
     cards with chips, and the graph panel. Design per the artifact-design skill. */
</style>

<header class="bar">
  <h1>Violencetown Board</h1>
  <p class="sub" id="status">loading…</p>
  <nav>
    <button id="view-board" aria-pressed="true">Board</button>
    <button id="view-graph" aria-pressed="false">Graph</button>
  </nav>
</header>

<section id="unblocked" aria-label="Unblocked now"></section>
<main id="board" class="rail" aria-label="Lanes"></main>
<section id="graph" hidden><pre class="mermaid" id="mermaid-src"></pre></section>

<script>
/* @@BOARD_MODEL@@ */
const SEED = /* @@SEED@@ */ [];

// ── State ──────────────────────────────────────────────────────────────────
let cards = SEED.map(c => ({ ...c }));
let db = null;                 // resolved capability, or null (read-only)
let unsub = null;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  const lanes = byLane(cards);
  const ix = blockerIndex(cards);
  const byId = Object.fromEntries(cards.map(c => [c.id, c]));

  $('#unblocked').innerHTML = `<h2>Unblocked now</h2><div class="chips">${
    unblocked(cards).map(c => `<button class="chip build" data-jump="${esc(c.id)}">${esc(c.id)} · ${esc(c.title)}</button>`).join('') || '<span class="muted">nothing — every build is waiting on a ruling</span>'
  }</div>`;

  $('#board').innerHTML = LANES.map(l => `
    <section class="lane" data-lane="${l.id}" aria-label="${esc(l.label)}">
      <h2>${esc(l.label)} <span class="count">${lanes[l.id].length}</span><small>${esc(l.hint)}</small></h2>
      <div class="cards" data-lane="${l.id}">${lanes[l.id].map(c => cardHTML(c, ix, byId)).join('')}</div>
    </section>`).join('');

  $('#mermaid-src').textContent = mermaidSource(cards);
  bindDnD();
}

function cardHTML(c, ix, byId) {
  const chip = (id, cls) => byId[id]
    ? `<button class="chip ${cls}" data-jump="${esc(id)}" title="${esc(byId[id].title)}">${esc(id)}</button>`
    : `<span class="chip ghost">${esc(id)}</span>`;
  const open = ix.openBlockedBy[c.id] ?? [];
  return `
    <article class="card ${c.kind}${open.length ? ' blocked' : ''}" draggable="${db ? 'true' : 'false'}"
             data-id="${esc(c.id)}" tabindex="0">
      <header><b>${esc(c.id)}</b>${c.size ? `<em>${esc(c.size)}</em>` : ''}</header>
      <p class="title">${esc(c.title)}</p>
      ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
      ${(ix.blockedBy[c.id] ?? []).length ? `<p class="row"><span>blocked by</span>${ix.blockedBy[c.id].map(id => chip(id, byId[id]?.lane === 'done' ? 'done' : 'ruling')).join('')}</p>` : ''}
      ${(ix.blocks[c.id] ?? []).length ? `<p class="row"><span>blocks</span>${ix.blocks[c.id].map(id => chip(id, 'build')).join('')}</p>` : ''}
      ${c.doc ? `<p class="doc">${esc(c.doc)}</p>` : ''}
    </article>`;
}

// ── Hover / focus: light up the connected subgraph ─────────────────────────
document.addEventListener('mouseover', e => highlight(e.target.closest('.card')?.dataset.id));
document.addEventListener('focusin',   e => highlight(e.target.closest('.card')?.dataset.id));
document.addEventListener('mouseout',  e => { if (!e.relatedTarget?.closest?.('.card')) highlight(null); });
function highlight(id) {
  const ix = blockerIndex(cards);
  const keep = id ? new Set([id, ...(ix.blockedBy[id] ?? []), ...(ix.blocks[id] ?? [])]) : null;
  for (const el of document.querySelectorAll('.card')) el.classList.toggle('dim', !!keep && !keep.has(el.dataset.id));
}
document.addEventListener('click', e => {
  const j = e.target.closest('[data-jump]'); if (!j) return;
  const el = document.querySelector(`.card[data-id="${CSS.escape(j.dataset.jump)}"]`);
  el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); el?.focus();
});

// ── Drag and drop (native; desktop) ────────────────────────────────────────
function bindDnD() {
  let dragging = null;
  for (const el of document.querySelectorAll('.card[draggable="true"]')) {
    el.addEventListener('dragstart', e => { dragging = el.dataset.id; e.dataTransfer.effectAllowed = 'move'; el.classList.add('lifting'); });
    el.addEventListener('dragend',   () => { dragging = null; el.classList.remove('lifting'); });
  }
  for (const zone of document.querySelectorAll('.cards')) {
    zone.addEventListener('dragover', e => { if (dragging) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
    zone.addEventListener('drop', async e => {
      e.preventDefault(); if (!dragging) return;
      const lane = zone.dataset.lane;
      const over = e.target.closest('.card');
      const before = over && over.dataset.id !== dragging ? over.dataset.id : undefined;
      const next = moveCard(cards, dragging, { lane, before });
      const moved = next.find(c => c.id === dragging);
      cards = next; render();
      await persist(moved);
    });
  }
}

// ── Persistence: the artifact's own db ─────────────────────────────────────
async function persist(card) {
  if (!db) return;
  try {
    await db.doc(`cards/${card.id}`).update({ lane: card.lane, order: card.order });
    setStatus(`saved · ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    setStatus(`save failed: ${err.code ?? err.message} — showing local state`);
  }
}
function setStatus(s) { $('#status').textContent = s; }

async function boot() {
  render();                                    // seed first: the page works with nothing
  $('#view-board').onclick = () => setView('board');
  $('#view-graph').onclick = () => setView('graph');

  db = await claude.use('db');                 // resolves later; null = read-only
  if (!db) { setStatus('read-only · no store in this view'); render(); return; }

  // Live: every change from any view of this page re-renders. Last write wins.
  // Contract 0.2.41: `next` receives a QuerySnapshot — `.docs` is DocumentSnapshot[],
  // each with `.id`, `.exists`, `.data()`. Delivered snapshots and their data()
  // are FROZEN: never mutate them, clone before editing (moveCard spreads a copy).
  // The first delivery may be `metadata.fromCache`; a definitive one follows.
  unsub = db.collection('cards').onSnapshot(
    snap => {
      if (snap.empty) { setStatus('connected · store is empty — seed it from the roadmap'); return; }
      cards = snap.docs.map(d => d.data());
      render();
      setStatus(`live · ${snap.size} cards${snap.metadata.hasPendingWrites ? ' · saving…' : ''}`);
    },
    err => setStatus(`store error: ${err.code} — showing last known state`),   // terminal; listener is dead
  );
  setStatus('connected');
}
function setView(v) {
  $('#board').hidden = v !== 'board'; $('#unblocked').hidden = v !== 'board';
  $('#graph').hidden = v !== 'graph';
  $('#view-board').setAttribute('aria-pressed', v === 'board');
  $('#view-graph').setAttribute('aria-pressed', v === 'graph');
}
boot();
</script>
```

**Notes the implementer must act on, not skip:**
- **Every value that comes from `db` is untrusted** (the runtime contract says so — any viewer with the link can write it). The page builds markup with `innerHTML`, so **every** interpolated field — `id`, `title`, `note`, `doc`, `size` — passes through `esc()`, and any id used in a selector goes through `CSS.escape()`. Never interpolate a db value raw, never use it as a URL, and never `eval`/`Function` anything from it. The `esc()` above covers `& < > "`; keep it, and keep every attribute quoted so `"` escaping is sufficient. This is the single non-negotiable in the page.
- The `onSnapshot` callback's payload shape (`snap.docs` vs an array) is written defensively above because the `.d.ts` is authoritative — **read `db.d.ts` and match it exactly**, then delete the defensive branch.
- `render()` rebuilds the DOM, which drops focus and hover state. Acceptable for v1; note it.
- Keyboard: cards are focusable (`tabindex=0`) and chips are buttons, so the connected-subgraph highlight and jump work without a mouse. **Drag has no keyboard path** — that is a known v1 gap; note it in the page's status line for read-only views and in your report.
- Touch drag is poor with native DnD. This is a desktop tool; say so in the header's subtitle.

- [ ] **Step 1: Invoke `artifact-design`, then write `page.html` per the above.** Fill in the layout CSS the skill calls for: a fixed header bar, the Unblocked strip, a horizontally scrolling lane rail (`overflow-x: auto` on the rail, never the body), cards with the kind colour as a left border, `.dim { opacity: .35 }`, `.blocked` carrying a subtle striped edge, `.lifting` raised with `--lift`.

- [ ] **Step 2: Smoke it locally with the seed, no runtime.** Run Task 4's build (`python tools/roadmap-board/build.py`), then open `tools/roadmap-board/dist/index.html` in a browser (the game's dev server serves `game/`, not `tools/` — open the file directly, or `python -m http.server 8080` from `tools/roadmap-board/dist`). Expected: six lanes populated from the seed, the status line reads `read-only · no store in this view` (no `claude` global outside the artifact viewer), Board/Graph toggle works, hovering a card dims the unconnected ones. **Note:** outside the viewer `claude` is undefined — guard `boot()` so `typeof claude === 'undefined'` takes the read-only path rather than throwing. Add that guard.

- [ ] **Step 3: Commit**

```bash
git add tools/roadmap-board/page.html
git commit -m "tool(roadmap): the board page

Six lanes, drag between them, every card wearing what blocks it and
what it blocks, hover to light the connected subgraph, and a Mermaid
view of the whole dependency graph. Reads and writes the artifact's own
db; with no store it renders the build-time seed read-only and says so.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Build, publish, seed, verify — **Fable (orchestrator)**

**Files:**
- Create: `tools/roadmap-board/build.py`
- Create: `tools/roadmap-board/dist/index.html` (generated; commit it — it is the published artifact's source of record)

- [ ] **Step 1: Write the build**

Create `tools/roadmap-board/build.py`:

```python
"""build.py — inline the board model and the seed into page.html -> dist/index.html.

The artifact CSP allows no external modules, so the page must be one file.
Same pattern as the other tools/ generators: source in, artifact out.
Run from the repo root:  python tools/roadmap-board/build.py
"""
import json, pathlib, re, sys

here = pathlib.Path(__file__).parent
page = (here / "page.html").read_text(encoding="utf-8")
model = (here / "board-model.js").read_text(encoding="utf-8")
seed = json.loads((here / "cards.json").read_text(encoding="utf-8"))

# The model is an ES module; inlined into a classic <script> its `export`s are invalid.
model_inline = re.sub(r"^export\s+(const|function)\s", r"\1 ", model, flags=re.M)

for marker in ("/* @@BOARD_MODEL@@ */", "/* @@SEED@@ */"):
    if marker not in page:
        sys.exit(f"page.html is missing marker {marker}")

out = page.replace("/* @@BOARD_MODEL@@ */", model_inline, 1)
out = out.replace("/* @@SEED@@ */ []", json.dumps(seed, ensure_ascii=False), 1)

dist = here / "dist"; dist.mkdir(exist_ok=True)
(dist / "index.html").write_text(out, encoding="utf-8")
print(f"wrote dist/index.html ({len(out):,} bytes, {len(seed)} seed cards)")
```

- [ ] **Step 2: Build and confirm the markers are gone**

```bash
python tools/roadmap-board/build.py
grep -c "@@BOARD_MODEL@@\|@@SEED@@" tools/roadmap-board/dist/index.html
```
Expected: `wrote dist/index.html (… bytes, N seed cards)` then `0`.

- [ ] **Step 3: Publish — first time, private, with the db capability**

Fable calls the `Artifact` tool: `file_path: C:\Code\violencetown\tools\roadmap-board\dist\index.html`, `favicon: "🗂️"`, `description: "Violencetown's roadmap as a live board — lanes, blockers, and what's unblocked right now."`, `capabilities: {"db": {}}`. Record the returned URL in this plan's header and in memory.

- [ ] **Step 4: Seed the store from `cards.json` — never from hand-typed rows**

Fable calls `Artifact` with `action: "write_db"`, `db_op: "batch"`, and a `writes` array of `{op: "set", collection: "cards", doc_id: <card.id>, data: <card>}` — **at most 50 per batch**, so two or three batches for ~50 cards. Then one `set` of `meta/board` with `{lanes: LANES ids, seededFrom: "plans/roadmap-2026-09.md", seededAt: <iso>}`.

Generate the batch payloads rather than typing them:
```bash
node -e "const c=require('./tools/roadmap-board/cards.json');const b=[];for(let i=0;i<c.length;i+=50)b.push(c.slice(i,i+50).map(x=>({op:'set',collection:'cards',doc_id:x.id,data:x})));require('fs').writeFileSync('tools/roadmap-board/dist/seed-batches.json',JSON.stringify(b));console.log(b.length,'batches')"
```
`dist/seed-batches.json` is scratch — do not commit it.

- [ ] **Step 5: Verify live, in the artifact viewer — not the local file**

Open the URL in the Browser pane. Check: status line reads `live · N cards`; six lanes populated; drag a card between lanes; **reload the page — the card stays moved** (that is the db working); Graph view renders the Mermaid DAG; hover dims. Then `read_db` the moved card from this session and confirm its `lane` changed — that proves the sync-back path exists.

- [ ] **Step 6: Commit the build and dist**

```bash
git add tools/roadmap-board/build.py tools/roadmap-board/dist/index.html
git commit -m "tool(roadmap): build the board into one file and publish it

One-file output because the artifact CSP allows no external modules.
The published artifact is a build of this file; republish by rebuilding
and calling Artifact with the same path.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Design and review pass — **Opus**

Review only, then fixes by the implementer. Dispatch with the published URL and the source.

- [ ] **Step 1: Review against these questions, ranked**
  1. **Does the graph read?** Open the Graph view. Can a stranger see that A1/A4 gate the boss line and that B2 is free? If the Mermaid layout buries it, propose `flowchart TB` or subgraph clustering by lane.
  2. **Does hover-highlight replace drawn edges?** The v1 choice was chips + connected-subgraph highlight instead of SVG lines between cards. Judge whether that is enough or whether lines are needed — and if lines, say so as a follow-on, not a blocker.
  3. **Theme:** both light and dark, via the three-state rule. Any colour defined only inside a media block is a bug.
  4. **Accessibility:** cards focusable, chips are buttons, `aria-pressed` on the view toggle, contrast ≥ 4.5:1 on chip text in both themes. Drag has no keyboard path — confirm the page says so.
  5. **Empty and failure states:** no db → read-only banner; save failure → status says so and local state stays; a lane with zero cards renders its header.
  6. **Nothing allocates per frame** — `render()` on every snapshot is fine; `highlight()` calling `blockerIndex` on every mouseover across ~50 cards is not — memoise it per render.
  7. **XSS:** db data is untrusted. Grep every `${` inside an `innerHTML` template and confirm each db-sourced value is wrapped in `esc()`; every `querySelector` built from an id uses `CSS.escape()`; every attribute is double-quoted. Then write one card to the db with `title: '<img src=x onerror=alert(1)>'` via `write_db` and confirm the board renders it as literal text. Delete that card afterwards.

- [ ] **Step 2: Report** — most-severe first, confirmed vs suspected, `file:line`. The Task 3 implementer fixes and republishes (rebuild → `Artifact` with the same path).

---

### Task 6: Sync-back exporter — **Haiku** *(droppable)*

The board is the working view; the markdown is the committed record. Without this, they drift.

**Files:**
- Create: `tools/roadmap-board/export-board.mjs`

- [ ] **Step 1:** Fable runs `read_db` with `db_op: "list"`, `collection: "cards"`, `out_dir: tools/roadmap-board/dist/db` — each card lands as `dist/db/cards/<id>.json`.

- [ ] **Step 2:** Write `export-board.mjs`: read `dist/db/cards/*.json`, group with the model's `byLane` (import it), and print one markdown table per lane in the roadmap's column shapes. It does **not** overwrite `roadmap-2026-09.md` — it prints, and a human diffs and pastes. Keep the human in the loop; the roadmap has prose the board does not carry.

- [ ] **Step 3:** Commit the script. Do not commit `dist/db/` or `dist/seed-batches.json` — add both to `.gitignore` under a `# roadmap-board scratch` heading.

---

## Verification

- `npm test` — 0 failures; total up by 17 (7 extract + 10 model).
- The published page, in the artifact viewer: **a drag survives a reload.** That single check proves the whole runtime path.
- `read_db` of a moved card from this session shows the new lane — proves sync-back is possible.
- Naming guard: `git grep -iE 'violence[ _-]+town' -- ':!CLAUDE.md' ':!plans/item-hotbar-xmb-implementation.md'` returns nothing. (The page's `<title>` is `Violencetown Board`, one word.)

## Known v1 limits, stated up front

- **Drag is mouse-only.** Keyboard users get focus, chips and jump, not reorder.
- **Touch drag is poor** with native DnD. Desktop tool.
- **Adding a new card happens in the markdown**, then re-extract → re-seed. The board edits lane and order, not content. That is deliberate: content changes belong in the committed record.
- **Re-seeding overwrites lane/order.** Before re-seeding after roadmap edits, run Task 6's export and merge — or accept the reset.
