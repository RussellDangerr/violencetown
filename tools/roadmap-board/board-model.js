// board-model.js — the ticket board's logic, with no DOM and no `claude`.
//
// Pure so it can be node-tested. The page inlines this file at build time
// (tools/roadmap-board/build.py) — do not import anything here, and do not
// reference window/document. The artifact runtime is wired in page.html.
//
// Inputs may be FROZEN: the artifact db delivers frozen snapshots. Every
// function here reads its input and returns new objects; nothing mutates.
//
// The model (plans/ticket-board.md §2): three kinds — idea, ruling, slice —
// moving through seven lanes. nextSlice() is the one place that decides what
// the loop builds next.

export const LANES = [
    { id: 'idea',    label: 'Ideas',        hint: 'his words — not tweaked yet' },
    { id: 'ruling',  label: 'Needs ruling', hint: 'your call — pick an option' },
    { id: 'ready',   label: 'Ready',        hint: 'tweaked slices the loop can take' },
    { id: 'doing',   label: 'In progress',  hint: 'claimed by a loop run' },
    { id: 'review',  label: 'Review',       hint: 'branch pushed — your merge call' },
    { id: 'done',    label: 'Done',         hint: 'do not re-implement' },
    { id: 'someday', label: 'Someday',      hint: 'parked on purpose' },
];

export const KINDS = ['idea', 'ruling', 'slice'];
export const WIP_CAP = 10;
export const PICKS_PER_PASS = 10;

const isDone = c => c.lane === 'done';

// The store is org-writable — any viewer can write any string into `lane`,
// `kind` or `blockedBy`. Two defenses run through every function below:
// accumulators are Object.create(null) so a card carrying "__proto__" can't
// collide with the prototype chain and crash a `.push()`, and a lane outside
// the known ids falls back to Ideas instead of being dropped — a card you can
// see is better than one that silently disappears, and an unknown card most
// likely needs tweaking.
const LANE_IDS = new Set(LANES.map(l => l.id));
const KIND_IDS = new Set(KINDS);
const FALLBACK_LANE = 'idea';
export const laneOf = c => LANE_IDS.has(c.lane) ? c.lane : FALLBACK_LANE;
export const kindOf = c => KIND_IDS.has(c.kind) ? c.kind : 'idea';

export function byLane(cards) {
    const out = Object.create(null);
    for (const l of LANES) out[l.id] = [];
    for (const c of cards) out[laneOf(c)].push(c);
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

// Slices waiting in Ready with every blocker done. (Claims and file overlap
// are nextSlice's business; this is the board's "could start" view.)
export function unblocked(cards) {
    const ix = blockerIndex(cards);
    return cards.filter(c => kindOf(c) === 'slice' && laneOf(c) === 'ready' && ix.openBlockedBy[c.id].length === 0);
}

// A path as a run would compare it: forward slashes, no leading ./, trimmed.
const normPath = p => String(p ?? '').trim().replace(/\\/g, '/').replace(/^\.\//, '');

// What the loop builds next (plans/ticket-board.md §2). Returns
//   { picks, reason, wip, skipped }
// reason: 'ok' | 'wip-cap' | 'nothing-pickable'. `picks` holds up to `max`
// slices, never more than the cap leaves room for, and no two share a file —
// each one's touches join the busy set, so the next pick can't clash with it
// (plans/loop-limits-ten.md). `skipped` lists every Ready slice that was passed
// over, with why, so a run can report it.
export function nextSlices(cards, { wipCap = WIP_CAP, max = PICKS_PER_PASS } = {}) {
    const lanes = byLane(cards);
    const inFlight = [...lanes.doing, ...lanes.review].filter(c => kindOf(c) === 'slice');
    const wip = inFlight.length;
    if (wip >= wipCap) return { picks: [], reason: 'wip-cap', wip, skipped: [] };
    const room = Math.min(max, wipCap - wip);

    const busy = new Set(inFlight.flatMap(c => (c.touches ?? []).map(normPath)));
    const ix = blockerIndex(cards);
    const picks = [], skipped = [];
    for (const c of lanes.ready) {
        if (picks.length >= room) break;
        if (kindOf(c) !== 'slice') { skipped.push({ id: c.id, why: 'not a slice' }); continue; }
        if (c.claim) { skipped.push({ id: c.id, why: 'already claimed' }); continue; }
        // A slice with no acceptance checks has not been tweaked — the roadmap's old
        // rows arrive like this. A run must never guess what "done" means.
        if (!Array.isArray(c.acceptance) || !c.acceptance.length) { skipped.push({ id: c.id, why: 'not tweaked (no acceptance)' }); continue; }
        if (!c.approved) { skipped.push({ id: c.id, why: 'waiting for your approval' }); continue; }
        const open = ix.openBlockedBy[c.id];
        if (open.length) { skipped.push({ id: c.id, why: `blocked by ${open.join(', ')}` }); continue; }
        const clash = (c.touches ?? []).map(normPath).filter(p => busy.has(p));
        if (clash.length) { skipped.push({ id: c.id, why: `touches unmerged ${clash.join(', ')}` }); continue; }
        picks.push(c);
        for (const p of c.touches ?? []) busy.add(normPath(p));
    }
    return { picks, reason: picks.length ? 'ok' : 'nothing-pickable', wip, skipped };
}

// The first of nextSlices(): { pick, reason, wip, skipped }.
export function nextSlice(cards, { wipCap = WIP_CAP } = {}) {
    const { picks, ...r } = nextSlices(cards, { wipCap, max: 1 });
    return { pick: picks[0] ?? null, ...r };
}

// His answer to a ruling: the pick is stored on the card and the card moves to
// Done, which unblocks whatever it gated. An option the card does not offer is
// refused (returns the input unchanged) rather than stored.
// `option: 'other'` is his own answer in his own words; it needs the words.
export function answerRuling(cards, id, { option, note = '', at }) {
    const card = cards.find(c => c.id === id);
    if (!card || kindOf(card) !== 'ruling') return cards;
    if (option === 'other' ? !String(note).trim() : !(card.options ?? []).some(o => o.id === option)) return cards;
    const doneOrder = (byLane(cards).done.at(-1)?.order ?? 0) + 10;
    return cards.map(c => c.id === id
        ? { ...c, lane: 'done', order: doneOrder, pick: { option, note: String(note), at } }
        : c);
}

// ── His gestures (plans/ticket-board.md §8) ──────────────────────────────────
// Each returns a NEW array with only that card changed, or the input unchanged
// when the gesture does not apply to that card — a stale click is a no-op.
const isTweaked = c => Array.isArray(c.acceptance) && c.acceptance.length > 0;
const swap = (cards, id, fn) => cards.map(c => c.id === id ? fn(c) : c);
const findCard = (cards, id) => cards.find(c => c.id === id);

// Idea triage: 'tweak' asks Claude to tweak it; 'someday' parks it.
export function triageIdea(cards, id, choice, at) {
    const c = findCard(cards, id);
    if (!c || kindOf(c) !== 'idea' || !['tweak', 'someday'].includes(choice)) return cards;
    const someday = choice === 'someday';
    const order = someday ? (byLane(cards).someday.at(-1)?.order ?? 0) + 10 : c.order;
    return swap(cards, id, x => ({ ...x, triage: { choice, at }, ...(someday ? { lane: 'someday', order } : {}) }));
}

// A tweaked Ready slice may be built once he approves it.
export function approveSlice(cards, id, at) {
    const c = findCard(cards, id);
    if (!c || kindOf(c) !== 'slice' || laneOf(c) !== 'ready' || !isTweaked(c)) return cards;
    return swap(cards, id, x => ({ ...x, approved: { at } }));
}

// His call on a pushed branch: 'merge' or 'changes' (a note says which).
export function reviewVerdict(cards, id, verdict, note, at) {
    const c = findCard(cards, id);
    if (!c || laneOf(c) !== 'review' || !['merge', 'changes'].includes(verdict)) return cards;
    return swap(cards, id, x => ({ ...x, verdict: { verdict, note: String(note ?? ''), at } }));
}

// The thread on a card. `from` is 'you' (the page) or 'claude' (a run).
export function addFeedback(cards, id, text, at, from = 'you') {
    const t = String(text ?? '').trim();
    if (!t || !findCard(cards, id)) return cards;
    return swap(cards, id, x => ({ ...x, feedback: [...(Array.isArray(x.feedback) ? x.feedback : []), { from, text: t, at }] }));
}
// The one box on every card (plans/ticket-board.md §8): whatever he types goes to
// Claude. On an open ruling it is also his answer — "Other", in his own words —
// so the card moves to Done; anywhere else it is feedback on the card.
export const isOpenRuling = c => kindOf(c) === 'ruling' && laneOf(c) === 'ruling'
    && Array.isArray(c.options) && c.options.length > 0 && !c.pick;
export function sendWords(cards, id, text, at) {
    const t = String(text ?? '').trim();
    const c = findCard(cards, id);
    if (!t || !c) return cards;
    const answered = isOpenRuling(c) ? answerRuling(cards, id, { option: 'other', note: t, at }) : cards;
    return addFeedback(answered, id, t, at);
}
const lastFrom = c => (Array.isArray(c.feedback) && c.feedback.length ? c.feedback.at(-1).from : null);

// What waits on him, and what waits on Claude. Each item: { id, why }.
export function yourTurn(cards) {
    const out = [];
    for (const c of cards) {
        const k = kindOf(c), l = laneOf(c);
        if (k === 'ruling' && l === 'ruling' && Array.isArray(c.options) && c.options.length && !c.pick) out.push({ id: c.id, why: 'pick an option' });
        else if (k === 'idea' && l === 'idea' && !c.triage) out.push({ id: c.id, why: 'tweak it or park it' });
        else if (k === 'slice' && l === 'ready' && isTweaked(c) && !c.approved) out.push({ id: c.id, why: 'approve it' });
        else if (l === 'review' && !c.verdict) out.push({ id: c.id, why: 'merge it or ask for changes' });
        else if (lastFrom(c) === 'claude' && c.feedback.at(-1).ask) out.push({ id: c.id, why: 'Claude asked you something' });
    }
    return out;
}
export function claudesTurn(cards) {
    const out = [];
    for (const c of cards) {
        if (lastFrom(c) === 'you') out.push({ id: c.id, why: 'reply to your feedback' });
        else if (kindOf(c) === 'idea' && c.triage?.choice === 'tweak' && laneOf(c) === 'idea') out.push({ id: c.id, why: 'tweak it' });
        else if (laneOf(c) === 'review' && c.verdict) out.push({ id: c.id, why: c.verdict.verdict === 'merge' ? 'merge it' : 'make the changes' });
        else if (kindOf(c) === 'ruling' && laneOf(c) === 'ruling' && !(Array.isArray(c.options) && c.options.length)) out.push({ id: c.id, why: 'write its options' });
        else if (kindOf(c) === 'slice' && laneOf(c) === 'ready' && !isTweaked(c)) out.push({ id: c.id, why: 'tweak it (no acceptance checks yet)' });
    }
    return out;
}

// What a card is really waiting on (plans/ticket-board.md §9): its open blockers
// walked all the way down, sorted by who has to act.
//   rulings   — open rulings he can answer now
//   approvals — tweaked Ready slices he has not approved
//   merges    — branches in Review waiting on his merge call
//   claude    — rulings with no options yet, ideas, untweaked slices
//   build     — approved work the loop has yet to build (nothing for him to do)
//   unknown   — blocker ids with no card (fail closed, as blockerIndex does)
// A blocker that is itself blocked is walked through, so a slice behind a slice
// behind a ruling lists that ruling.
export function waitingOn(cards, id, ix = blockerIndex(cards)) {
    const byId = Object.create(null);
    for (const c of cards) byId[c.id] = c;
    const out = { rulings: [], approvals: [], merges: [], claude: [], build: [], unknown: [] };
    const seen = new Set([id]);
    const walk = cid => {
        for (const b of ix.openBlockedBy[cid] ?? []) {
            if (seen.has(b)) continue;
            seen.add(b);
            const c = byId[b];
            if (!c) { out.unknown.push(b); continue; }
            const k = kindOf(c), l = laneOf(c);
            if (isOpenRuling(c)) out.rulings.push(b);
            else if (k === 'slice' && l === 'ready' && isTweaked(c) && !c.approved) out.approvals.push(b);
            else if (l === 'review') out.merges.push(b);
            else if (k === 'ruling' || k === 'idea' || (k === 'slice' && !isTweaked(c))) out.claude.push(b);
            else if ((ix.openBlockedBy[b] ?? []).length === 0) out.build.push(b);
            walk(b);
        }
    };
    walk(id);
    return out;
}

// For every open ruling, the approved Ready slices its answer helps free —
// directly or down the chain. Sorted by board order.
export function freesIndex(cards) {
    const ix = blockerIndex(cards);
    const out = Object.create(null);
    for (const s of byLane(cards).ready) {
        if (kindOf(s) !== 'slice' || !s.approved) continue;
        for (const r of waitingOn(cards, s.id, ix).rulings) (out[r] ??= []).push(s.id);
    }
    return out;
}

// A thought dropped in the idea box. `now` is a millisecond timestamp, passed in
// so this stays pure. The title is the first line, cut short; his full words
// are the note.
export function newIdea(words, now, cards = []) {
    const text = String(words ?? '').trim();
    if (!text) return null;
    const first = text.split(/\r?\n/)[0];
    const title = first.length > 90 ? `${first.slice(0, 90)}…` : first;
    const order = (byLane(cards).idea.at(-1)?.order ?? 0) + 10;
    return { id: `idea-${now.toString(36)}`, title, kind: 'idea', lane: 'idea', order, blockedBy: [], note: text, doc: '', size: '' };
}

// A scout proposal as an idea card (plans/board-scout.md). `key` names the
// problem; a key any card already carries, in any lane, returns null, so a
// proposal he parked in Someday stays parked. The id is built from the key so a
// second write of the same proposal can't make a twin.
const SCOUT_KINDS = ['defect', 'tweak', 'idea'];
export function newScoutIdea(p, now, cards = []) {
    const key = String(p?.key ?? '').trim(), title = String(p?.title ?? '').trim();
    if (!key || !title) return null;
    if (cards.some(c => c.scoutKey === key)) return null;
    const scoutKind = SCOUT_KINDS.includes(p.kind) ? p.kind : 'idea';
    const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const id = `scout-${slug}`;
    if (cards.some(c => c.id === id)) return null;
    const order = (byLane(cards).idea.at(-1)?.order ?? 0) + 10;
    return {
        id, title: title.length > 90 ? `${title.slice(0, 90)}…` : title,
        kind: 'idea', lane: 'idea', order, blockedBy: [], doc: '', size: '',
        note: String(p.note ?? '').trim(), source: 'scout', scoutKey: key, scoutKind, at: now,
    };
}

// The one-time move from the roadmap-seeded board (plans/ticket-board.md §3).
// Idempotent: a card already in the new model passes through unchanged.
const LANE_MAP = { now: 'ready', rulings: 'ruling', ready: 'ready', design: 'idea', later: 'someday', done: 'done' };
const KIND_MAP = { build: 'slice', ruling: 'ruling', design: 'idea', later: 'idea' };
export function migrateCard(c) {
    const lane = Object.hasOwn(LANE_MAP, c.lane) ? LANE_MAP[c.lane] : laneOf(c);
    // Old done cards carried kind 'done'; keep what they were if it is known,
    // else call them slices — they were builds that shipped.
    const kind = Object.hasOwn(KIND_MAP, c.kind) ? KIND_MAP[c.kind] : KIND_IDS.has(c.kind) ? c.kind : 'slice';
    return { ...c, lane, kind };
}

const mmId = id => id.replace(/[^A-Za-z0-9_]/g, '_');
// A short code (A1, DZ, ENT, F2b: up to 3 letters, a digit, a lower-case suffix)
// IS its own label. Anything else is a slug or a sentence — use the title,
// truncated, so a node never carries both an id AND a long title.
const SHORT_CODE = /^[A-Z]{1,3}\d?[a-z]?$/;
const truncate = (s, n) => s.length > n ? `${s.slice(0, n)}…` : s;
const mmLabel = c => (SHORT_CODE.test(c.id) ? c.id : truncate(c.title, 40)).replace(/"/g, "'").replace(/[<>]/g, '');
const mmClass = c => isDone(c) ? 'done' : laneOf(c) === 'someday' ? 'someday' : kindOf(c);
const mmNode = c => `${mmId(c.id)}["${mmLabel(c)}"]:::${mmClass(c)}`;

// One node per card that participates in an edge; one edge per blockedBy.
// Cards with no edges are otherwise omitted, so anything free to start but
// friendless gets its own terminal group instead of vanishing.
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
        '    classDef idea    fill:#d9d4ee,stroke:#5a4a8a,color:#1f1a33',
        '    classDef ruling  fill:#f3d9a4,stroke:#8a5a2c,color:#2a1f06',
        '    classDef slice   fill:#cfe8c9,stroke:#3a6b35,color:#0f2a0d',
        '    classDef someday fill:#e6e6e6,stroke:#777,color:#333',
        '    classDef done    fill:#dfe9e0,stroke:#6a8a6e,color:#243326,stroke-dasharray:4 3',
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
