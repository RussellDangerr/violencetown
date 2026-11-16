// spirits.js — heroic spirits (plans/heroic-spirits.md). Every autoplay run
// becomes a read-only record of what one hero did and how it ended. Spirits
// never touch the world: everything here only reads the game, and nothing here
// draws on game.rng, so recording a run cannot change it (rule 1).
//
// A track is STATE, not key presses: one row per action the hero took (map,
// tile, facing, HP, what it did), plus a row where it fell and a row for each
// foe that fell while it acted. A track is drawn, never re-simulated.

import { isBoss } from './defeat-scenarios.js';

export const SPIRIT_VERSION = 1;

// HS-R1 names the heroes; which script each one plays is HS-Q1's lean. A
// script with no hero here makes no spirit. Mary Shelley plays the caster,
// which only the harvest plays (slice 2).
export const HEROES = Object.freeze({
    quest: 'Paul Bunyan',
    sneak: 'Johnny Appleseed',
    loops: 'Amelia Earhart',
    caster: 'Mary Shelley',
});

const ANCHOR_CAP = 5;
const zone = (url) => (typeof url === 'string' ? url.replace(/-map\.json$/, '') : null);
const foeName = (e) => e.type || e.tag || e.id || 'something';
const alive = (e) => !!e && !!e.entity && e.entity.isAlive();

// The row for one action, read before the action is taken. `stage` is the
// quest stage the hero was working on, when it has one.
export function trackRow(g, a, stage = null) {
    const row = { t: g.turn, map: zone(g._mapUrl), x: g.playerX, y: g.playerY, facing: g.facing ?? null, hp: g.playerHp, act: a.kind };
    if (a.dir) row.dir = a.dir;
    if (a.at) {
        row.at = { x: a.at.x, y: a.at.y };
        const foe = (g.enemies || []).find((e) => alive(e) && e.x === a.at.x && e.y === a.at.y);
        if (foe) row.target = foeName(foe);
    }
    if (stage) row.stage = stage;
    return row;
}

// The row where the hero fell: where it stood, and to whom.
export function fellRow(g, by, boss = false) {
    return { t: g.turn, map: zone(g._mapUrl), x: g.playerX, y: g.playerY, facing: g.facing ?? null, hp: 0, act: 'fell', by: by || 'something', boss: !!boss };
}

// The foes standing before an action, so felled() can say who went down in it.
export function foesNow(g) {
    return { map: g._mapUrl, foes: (g.enemies || []).filter(alive) };
}

// A row for each foe that stood before the action and does not now, on the
// same map (a zone change is not a kill).
export function felled(g, before) {
    if (!before || before.map !== g._mapUrl) return [];
    const now = g.enemies || [];
    return before.foes.filter((e) => !now.includes(e) || !alive(e))
        .map((e) => ({ t: g.turn, map: zone(g._mapUrl), x: e.x, y: e.y, act: 'felled', who: foeName(e), boss: isBoss(e) }));
}

// Three to five facts the spirit remembers, oldest first: its first fall, the
// first boss that fell to it, its last fall, and how the run ended. Data only:
// the words are written where a spirit is shown.
export function anchorsOf(track, outcome) {
    const falls = track.filter((r) => r.act === 'fell');
    const boss = track.find((r) => r.act === 'felled' && r.boss);
    const picks = [];
    const add = (r, kind, who) => { if (r && !picks.some((p) => p.turn === r.t && p.kind === kind)) picks.push({ kind, turn: r.t, map: r.map, who }); };
    add(falls[0], 'fell', falls[0]?.by);
    add(boss, 'felled', boss?.who);
    add(falls[falls.length - 1], 'fell', falls[falls.length - 1]?.by);
    picks.sort((a, b) => a.turn - b.turn);
    const last = track[track.length - 1];
    const end = outcome.cleared
        ? { kind: 'cleared', turn: outcome.turn, map: last?.map ?? null, who: outcome.quest }
        : { kind: 'stopped', turn: outcome.turn, map: last?.map ?? null, who: outcome.quest };
    return [...picks.slice(0, ANCHOR_CAP - 1), end];
}

// 0-3 per foe, zone and quest, counted from the track.
//   foe:   one star per one of its kind felled, up to 3
//   zone:  1 walked, 2 felled something there, 3 finished a stage there
//   quest: 3 cleared, 2 reached two thirds of its stages, 1 begun
export function knowledgeOf(track, outcome, stageCount = 0) {
    const foes = {};
    for (const r of track) if (r.act === 'felled') foes[r.who] = Math.min(3, (foes[r.who] || 0) + 1);
    const zones = {};
    const raise = (map, n) => { if (map) zones[map] = Math.max(zones[map] || 0, n); };
    const staged = track.filter((r) => r.stage);
    for (const r of track) raise(r.map, r.act === 'felled' ? 2 : 1);
    for (let i = 0; i + 1 < staged.length; i++) if (staged[i].stage !== staged[i + 1].stage) raise(staged[i].map, 3);
    if (outcome.cleared && staged.length) raise(staged[staged.length - 1].map, 3);
    const reached = new Set(staged.map((r) => r.stage)).size;
    const quest = outcome.cleared ? 3 : stageCount > 0 && reached * 3 >= stageCount * 2 ? 2 : track.length ? 1 : 0;
    return { foes, zones, quests: outcome.quest ? { [outcome.quest]: quest } : {} };
}

// ── What changed between two spirits of the same run ───────────────────────
//
// The autoplay gate's evidence (plans/heroic-spirits.md, slice 1b): when a
// golden drifts, this says what the hero did differently, not only which
// number moved. Same seed, same game: the same spirit, so any difference is
// real. The diff is evidence; pass or fail stays the golden's.

const sameRow = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const anchorKey = (a) => `${a.kind}|${a.who}|${a.map}`;

// The first row where the tracks part, what changed in the outcome, and the
// anchors gained, lost or moved to another turn.
export function diffSpirits(before, after) {
    if (!before || !after) return { same: !before && !after, missing: !before && !after ? null : !before ? 'before' : 'after' };
    const a = before.track || [], b = after.track || [];
    let i = 0;
    while (i < a.length && i < b.length && sameRow(a[i], b[i])) i++;
    const first = i < a.length || i < b.length ? { index: i, before: a[i] ?? null, after: b[i] ?? null } : null;

    const outcome = [];
    for (const k of new Set([...Object.keys(before.outcome || {}), ...Object.keys(after.outcome || {})])) {
        const was = before.outcome?.[k], now = after.outcome?.[k];
        if (JSON.stringify(was) !== JSON.stringify(now)) outcome.push({ key: k, was: was ?? null, now: now ?? null });
    }

    const was = new Map((before.anchors || []).map((x) => [anchorKey(x), x]));
    const now = new Map((after.anchors || []).map((x) => [anchorKey(x), x]));
    const lost = [...was].filter(([k]) => !now.has(k)).map(([, x]) => x);
    const gained = [...now].filter(([k]) => !was.has(k)).map(([, x]) => x);
    const moved = [...now].filter(([k, x]) => was.has(k) && was.get(k).turn !== x.turn)
        .map(([k, x]) => ({ ...x, from: was.get(k).turn, to: x.turn }));

    const same = !first && !outcome.length && !lost.length && !gained.length && !moved.length;
    return { same, rows: { before: a.length, after: b.length }, first, outcome, lost, gained, moved };
}

// One track row in a few words, for a person reading the gate's output.
export function describeRow(r) {
    if (!r) return '(the track ends)';
    const where = `${r.map} ${r.x},${r.y}`;
    if (r.act === 'fell') return `t${r.t} ${where}: fell to ${r.by}`;
    if (r.act === 'felled') return `t${r.t} ${where}: ${r.who} fell`;
    return `t${r.t} ${where} hp${r.hp}: ${r.act}${r.dir ? ` ${r.dir}` : ''}${r.at ? ` @${r.at.x},${r.at.y}` : ''}${r.target ? ` on ${r.target}` : ''}`;
}

const describeAnchor = (x) => `${x.kind}${x.who ? ` ${x.who}` : ''}${x.map ? ` (${x.map})` : ''} t${x.turn}`;

// The diff as lines to print under a run's name.
export function describeDiff(d) {
    if (d.same) return ['spirit matches'];
    if (d.missing) return [`no ${d.missing} spirit to compare`];
    const out = [];
    if (d.first) {
        out.push(`first differs at row ${d.first.index} of ${d.rows.before} -> ${d.rows.after}:`);
        out.push(`  was  ${describeRow(d.first.before)}`);
        out.push(`  now  ${describeRow(d.first.after)}`);
    }
    for (const o of d.outcome) out.push(`outcome.${o.key}: ${JSON.stringify(o.was)} -> ${JSON.stringify(o.now)}`);
    for (const x of d.lost) out.push(`lost:   ${describeAnchor(x)}`);
    for (const x of d.gained) out.push(`gained: ${describeAnchor(x)}`);
    for (const x of d.moved) out.push(`moved:  ${x.kind}${x.who ? ` ${x.who}` : ''} t${x.from} -> t${x.to}`);
    return out;
}

// The spirit of one finished run, or null when the script has no hero or the
// run left no track.
export function spiritRecord({ script, seed, version = null, finished, failure = null, turn, quest = null, stageCount = 0, track }) {
    const hero = HEROES[script];
    if (!hero || !track || !track.length) return null;
    const outcome = {
        cleared: !!finished && !failure,
        turn,
        quest: quest?.id ?? null,
        stage: quest?.stage ?? null,
        falls: track.filter((r) => r.act === 'fell').length,
    };
    if (failure) outcome.gaveUp = failure;
    return {
        v: SPIRIT_VERSION,
        id: `${script}:${seed}`,
        hero,
        attempt: seed,
        provenance: { seed, script, version },
        track,
        outcome,
        anchors: anchorsOf(track, outcome),
        knowledge: knowledgeOf(track, outcome, stageCount),
    };
}

// ── The harvest (slice 2) ─────────────────────────────────────────────────

// A short hash of a parsed JSON value (FNV-1a, 32 bits): the same in node and
// the browser, and blind to how the file was laid out or its line endings.
export function hashJson(value) {
    const s = JSON.stringify(value);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
}

// Each zone a track walked, once, in the order it got there.
export const zonesOf = (track) => [...new Set((track || []).map((r) => r.map).filter(Boolean))];

// Rule 4: a spirit whose zone map no longer hashes the same stops showing its
// track; its outcome and anchors stay, as history. `hashes` is zone -> hash now.
export function retire(spirit, hashes) {
    const maps = spirit?.provenance?.maps;
    if (!spirit || !spirit.track || !maps) return spirit;
    const moved = Object.keys(maps).filter((z) => hashes[z] !== maps[z]).sort();
    return moved.length ? { ...spirit, track: null, retired: moved } : spirit;
}

// The rows where the hero stood somewhere `passable(zone, x, y)` says nobody
// can. A felled row is where the foe stood, not the hero, so it is skipped.
export function strandedRows(spirit, passable) {
    return (spirit?.track || []).filter((r) => r.act !== 'felled' && r.map && Number.isInteger(r.x) && !passable(r.map, r.x, r.y));
}

// How a run ended, as one line the stats can count and curation can group by.
export function endingOf(spirit) {
    const o = spirit.outcome;
    const first = (spirit.track || []).find((r) => r.act === 'fell');
    const fall = first ? ` after falling to ${first.by}` : '';
    if (o.cleared) return first ? `cleared${fall}` : 'cleared clean';
    return `stopped${o.stage ? ` at ${o.stage}` : ''}${fall}`;
}

// One attempt, without its track: for the montage and the per-seed stats.
export function attemptOf(spirit) {
    const o = spirit.outcome;
    const a = { seed: spirit.attempt, cleared: o.cleared, turn: o.turn, stage: o.stage, falls: o.falls, ending: endingOf(spirit) };
    if (o.gaveUp) a.gaveUp = o.gaveUp;
    return a;
}

// Rule 5: the spirits worth keeping. For each hero, one spirit per way a run
// ended (the lowest seed), failures first, then clears that fell on the way
// (most falls first), a clean clear last; `perHero` at most.
export function curate(spirits, perHero = 3) {
    const rank = (s) => (s.outcome.cleared ? (s.outcome.falls ? 1 : 2) : 0);
    const byHero = new Map();
    for (const s of spirits.filter(Boolean)) {
        if (!byHero.has(s.hero)) byHero.set(s.hero, []);
        byHero.get(s.hero).push(s);
    }
    const kept = [];
    for (const list of byHero.values()) {
        const firsts = new Map();
        for (const s of [...list].sort((a, b) => a.attempt - b.attempt)) {
            const k = endingOf(s);
            if (!firsts.has(k)) firsts.set(k, s);
        }
        kept.push(...[...firsts.values()]
            .sort((a, b) => rank(a) - rank(b) || b.outcome.falls - a.outcome.falls || a.attempt - b.attempt)
            .slice(0, perHero));
    }
    return kept;
}
