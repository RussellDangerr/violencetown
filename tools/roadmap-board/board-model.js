// board-model.js — the roadmap board's logic, with no DOM and no `claude`.
//
// Pure so it can be node-tested. The page inlines this file at build time
// (tools/roadmap-board/build.py) — do not import anything here, and do not
// reference window/document. The artifact runtime is wired in page.html.
//
// Inputs may be FROZEN: the artifact db delivers frozen snapshots. Every
// function here reads its input and returns new objects; nothing mutates.

export const LANES = [
    { id: 'now',     label: 'Now',            hint: 'in flight on dev' },
    { id: 'rulings', label: 'Rulings owed',   hint: 'no code — each one gates something' },
    { id: 'ready',   label: 'Ready to build', hint: 'design settled, a plan exists' },
    { id: 'design',  label: 'Needs design',   hint: 'open questions first' },
    { id: 'later',   label: 'Post-1.0',       hint: 'scoped, none started' },
    { id: 'done',    label: 'Done',           hint: 'do not re-implement' },
];

const isDone = c => c.lane === 'done';

// The store is org-writable — any viewer can write any string into `lane` or
// `blockedBy`. Two defenses run through every function below: accumulators
// are Object.create(null) so a card carrying "__proto__" can't collide with
// the prototype chain and crash a `.push()`, and a lane outside the six
// known ids falls back to the last lane instead of being dropped — a card
// you can see is better than one that silently disappears.
const LANE_IDS = new Set(LANES.map(l => l.id));
const FALLBACK_LANE = LANES.at(-1).id;

export function byLane(cards) {
    const out = Object.create(null);
    for (const l of LANES) out[l.id] = [];
    for (const c of cards) out[LANE_IDS.has(c.lane) ? c.lane : FALLBACK_LANE].push(c);
    for (const k of Object.keys(out)) out[k] = [...out[k]].sort((a, b) => a.order - b.order);
    return out;
}

// blocks   : id -> ids it blocks          (derived — the inverse of blockedBy)
// blockedBy: id -> ids that block it      (as stored)
// openBlockedBy: same, minus blockers that are already done
export function blockerIndex(cards) {
    const byId = Object.create(null);
    for (const c of cards) byId[c.id] = c;
    const blocks = Object.create(null), blockedBy = Object.create(null), openBlockedBy = Object.create(null);
    for (const c of cards) {
        blockedBy[c.id] = [...(c.blockedBy ?? [])];
        // An id with no matching card (typo, or a card since deleted) still blocks —
        // failing closed makes the typo visible instead of quietly unblocking the card.
        openBlockedBy[c.id] = blockedBy[c.id].filter(b => !byId[b] || !isDone(byId[b]));
        for (const b of blockedBy[c.id]) (blocks[b] ??= []).push(c.id);
    }
    return { blocks, blockedBy, openBlockedBy };
}

// Cards you could start right now: actually queued (now/ready — not a design with
// open questions, not a post-1.0 later), not done, and every blocker done.
export function unblocked(cards) {
    const ix = blockerIndex(cards);
    return cards.filter(c => (c.lane === 'now' || c.lane === 'ready') && !isDone(c) && ix.openBlockedBy[c.id].length === 0);
}

const mmId = id => id.replace(/[^A-Za-z0-9_]/g, '_');
// A short code (A1, DZ, B12-style ids up to 2 letters + 1 digit) IS its own label.
// Anything else is a slug or a sentence — use the title, truncated, so a node
// never carries both an id AND a long title.
const SHORT_CODE = /^[A-Z]{1,2}\d?$/;
const truncate = (s, n) => s.length > n ? `${s.slice(0, n)}…` : s;
const mmLabel = c => (SHORT_CODE.test(c.id) ? c.id : truncate(c.title, 40)).replace(/"/g, "'").replace(/[<>]/g, '');
const mmNode = c => `${mmId(c.id)}["${mmLabel(c)}"]:::${c.kind}`;

// One node per card that participates in an edge; one edge per blockedBy.
// Cards with no edges are otherwise omitted, so anything free to start but
// friendless (no ruling gates it, nothing depends on it — B2 is the case
// that matters) gets its own terminal group instead of vanishing. Reuses
// unblocked() rather than re-deriving "startable" here.
export function mermaidSource(cards) {
    const byId = Object.create(null);
    for (const c of cards) byId[c.id] = c;
    const inEdge = new Set();
    const edges = [];
    for (const c of cards) for (const b of c.blockedBy ?? []) {
        if (!byId[b]) continue;
        inEdge.add(c.id); inEdge.add(b);
        edges.push(`    ${mmId(b)} --> ${mmId(c.id)}`);
    }
    const nodes = cards.filter(c => inEdge.has(c.id)).map(mmNode);
    const free = unblocked(cards).filter(c => !inEdge.has(c.id));
    const freeGroup = free.length === 0 ? [] : [
        '    subgraph free["Free to start"]',
        ...free.map(c => `        ${mmNode(c)}`),
        '    end',
    ];
    return [
        'flowchart LR',
        '    classDef ruling fill:#f3d9a4,stroke:#8a5a2c,color:#2a1f06',
        '    classDef build  fill:#cfe8c9,stroke:#3a6b35,color:#0f2a0d',
        '    classDef design fill:#d9d4ee,stroke:#5a4a8a,color:#1f1a33',
        '    classDef later  fill:#e6e6e6,stroke:#777,color:#333',
        '    classDef done   fill:#dfe9e0,stroke:#6a8a6e,color:#243326,stroke-dasharray:4 3',
        ...nodes, ...edges, ...freeGroup,
    ].join('\n');
}

// Returns a NEW array. `before` = insert ahead of that card; omitted = append.
export function moveCard(cards, id, { lane, before }) {
    const lanes = byLane(cards);
    const target = lanes[lane] ?? [];
    let order;
    if (before) {
        const i = target.findIndex(c => c.id === before);
        if (i > 0 && target[i - 1].id === id) {
            // The card is already immediately before its drop target in this lane —
            // halving the gap to the target would land back between the same two
            // neighbours (the "prev" boundary IS the moved card's own order), a
            // silent no-op. Place it after the target instead, so the drop moves it.
            const prev = target[i].order;
            const next = target[i + 1]?.order ?? prev + 20;
            order = (prev + next) / 2;
        } else {
            const next = target[i]?.order ?? 0;
            const prev = i > 0 ? target[i - 1].order : 0;
            order = (prev + next) / 2;
        }
    } else {
        order = (target.at(-1)?.order ?? 0) + 10;
    }
    return cards.map(c => c.id === id ? { ...c, lane, order } : c);
}
