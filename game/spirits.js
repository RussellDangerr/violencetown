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
// which arrives with the harvest (slice 2).
export const HEROES = Object.freeze({
    quest: 'Paul Bunyan',
    sneak: 'Johnny Appleseed',
    loops: 'Amelia Earhart',
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
