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

export function byLane(cards) {
    const out = Object.fromEntries(LANES.map(l => [l.id, []]));
    for (const c of cards) (out[c.lane] ??= []).push(c);
    for (const k in out) out[k] = [...out[k]].sort((a, b) => a.order - b.order);
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
