// elements.test.js — the weakness chart (plans/el1-weakness-chart-data.md).
//
// The chart is only worth having if it is complete and sourced. These fail when
// a damage type the game deals has no row, when an edge or a placed row names
// no source, when a row bends the source without saying so, or when the edges
// stop being the five-phase overcoming cycle.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { SOURCES, PHASES, EDGES, DAMAGE_TYPES, phaseOf, matchup, weaknessesOf, resistancesOf } from '../game/elements.js';
import { ITEMS } from '../game/items.js';
import { WEAPONS, WEAPON_TIERS, ATTACK_KINDS } from '../game/weapons.js';
import { SPELLS } from '../game/spells.js';
import { TRICKS } from '../game/tricks.js';

const gameDir = fileURLToPath(new URL('../game/', import.meta.url));
const jsFiles = readdirSync(gameDir).filter(f => f.endsWith('.js'));
const mapFiles = readdirSync(gameDir).filter(f => f.endsWith('-map.json'));
const src = f => readFileSync(join(gameDir, f), 'utf8');

// A damage-over-time cause that heals rather than hurts. It rides applyDot but
// is not a damage type.
const HEAL_CAUSES = new Set(['health_poition']);

// Every damage type the game can deal, gathered from where it is authored.
function typesInTheGame() {
    const found = new Map();   // type -> where it was seen
    const add = (t, where) => { if (t && !found.has(t)) found.set(t, where); };

    for (const [id, d] of Object.entries(ITEMS))        add(d.damageType, `ITEMS.${id}`);
    for (const [id, d] of Object.entries(WEAPONS))      add(d.damageType, `WEAPONS.${id}`);
    for (const [id, d] of Object.entries(WEAPON_TIERS)) add(d.damageType, `WEAPON_TIERS.${id}`);
    for (const [id, d] of Object.entries(SPELLS))       add(d.damageType, `SPELLS.${id}`);
    for (const [id, d] of Object.entries(TRICKS))       add(d.damageType, `TRICKS.${id}`);
    for (const k of ATTACK_KINDS)                       add(k, 'ATTACK_KINDS');

    for (const f of jsFiles) {
        const text = src(f);
        // A typed blow: combatAttack(target, dmg, { type: 'clean' }).
        for (const m of text.matchAll(/combatAttack\([^;]*?\btype:\s*'([a-z_]+)'/g)) add(m[1], `${f} combatAttack`);
        // A damage-over-time cause: applyDot(owner, game, buff, 'Label', 'cause').
        for (const m of text.matchAll(/applyDot\([^)]*'([a-z_]+)'\s*\)/g)) {
            if (!HEAL_CAUSES.has(m[1])) add(m[1], `${f} applyDot`);
        }
        // Any matchup list authored in code: weak: ['fire'] and the like.
        for (const m of text.matchAll(/\b(?:weak|resist|immune)\s*:\s*\[([^\]]*)\]/g)) {
            for (const t of m[1].matchAll(/'([a-z_]+)'/g)) add(t[1], `${f} matchup list`);
        }
    }

    for (const f of mapFiles) {
        const map = JSON.parse(src(f));
        for (const e of map.enemies ?? []) {
            for (const key of ['weak', 'resist', 'immune']) {
                for (const t of e[key] ?? []) add(t, `${f} ${e.id ?? e.type}.${key}`);
            }
        }
    }
    return found;
}

describe('every damage type the game deals has a row', () => {
    const found = typesInTheGame();

    test('the scan finds the types the game is known to deal', () => {
        // A scan that finds nothing would pass the next test trivially.
        for (const t of ['physical', 'fire', 'cold', 'energy', 'sludge', 'poison', 'fear', 'clean',
            'slash', 'stab', 'crush']) {
            assert.ok(found.has(t), `the scan missed ${t}`);
        }
    });

    for (const [type, where] of found) {
        test(`${type} (seen in ${where})`, () => {
            assert.ok(Object.hasOwn(DAMAGE_TYPES, type), `${type} has no row in game/elements.js`);
        });
    }
});

describe('everything in the chart names its source', () => {
    const isSource = id => Object.hasOwn(SOURCES, id);

    test('every source names its work, chapter and the lines used', () => {
        for (const [id, s] of Object.entries(SOURCES)) {
            assert.ok(s.work && s.chapter, `${id} is missing its work or chapter`);
            assert.ok(s.lines.length > 0, `${id} quotes nothing`);
        }
    });

    test('every phase names a source and a climate', () => {
        for (const [p, d] of Object.entries(PHASES)) {
            assert.ok(isSource(d.source), `${p} names no real source`);
            assert.ok(d.climate, `${p} has no climate`);
        }
    });

    test('every edge names a source and what it says', () => {
        assert.ok(EDGES.length > 0);
        for (const e of EDGES) {
            assert.ok(isSource(e.source), `${e.from} -> ${e.to} names no real source`);
            assert.ok(e.says, `${e.from} -> ${e.to} does not say what the source says`);
        }
    });

    test('every placed row names a source; every row that bends it says how', () => {
        for (const [t, r] of Object.entries(DAMAGE_TYPES)) {
            if (r.phase !== null) {
                assert.ok(Object.hasOwn(PHASES, r.phase), `${t} sits on an unknown phase ${r.phase}`);
                assert.ok(r.sources.length > 0, `${t} is placed with no source`);
            } else {
                assert.ok(r.departs, `${t} is outside the chart with no note saying why`);
            }
            for (const s of r.sources) assert.ok(isSource(s), `${t} cites unknown source ${s}`);
            assert.ok(r.departs === null || (typeof r.departs === 'string' && r.departs.length > 0),
                `${t} has an empty departure note`);
        }
    });

    test('the rows that sit on the source exactly are the three climates the game shares with it', () => {
        const exact = Object.keys(DAMAGE_TYPES).filter(t => DAMAGE_TYPES[t].departs === null).sort();
        assert.deepEqual(exact, ['cold', 'fire', 'sludge']);
    });
});

describe('the edges are the overcoming cycle', () => {
    const phases = Object.keys(PHASES);

    test('five phases, five edges', () => {
        assert.equal(phases.length, 5);
        assert.equal(EDGES.length, 5);
    });

    test('each phase overcomes exactly one other and is overcome by exactly one', () => {
        for (const p of phases) {
            assert.equal(EDGES.filter(e => e.from === p).length, 1, `${p} overcomes ${EDGES.filter(e => e.from === p).length}`);
            assert.equal(EDGES.filter(e => e.to === p).length, 1, `${p} is overcome ${EDGES.filter(e => e.to === p).length} times`);
            assert.ok(!EDGES.some(e => e.from === p && e.to === p), `${p} overcomes itself`);
        }
    });

    test('following the edges from wood visits every phase once and returns', () => {
        const next = Object.fromEntries(EDGES.map(e => [e.from, e.to]));
        const seen = [];
        let p = 'wood';
        do { seen.push(p); p = next[p]; } while (p !== 'wood' && seen.length <= 5);
        assert.deepEqual([...seen].sort(), [...phases].sort());
    });
});

describe('what the chart says about the game\'s types', () => {
    test('energy and soap open sludge', () => {
        assert.equal(matchup('energy', 'sludge'), 'weak');
        assert.equal(matchup('clean', 'sludge'), 'weak');
        assert.deepEqual(weaknessesOf('sludge').sort(), ['clean', 'energy']);
    });

    test('fire does not open sludge: fire feeds earth, it does not overcome it', () => {
        assert.equal(matchup('fire', 'sludge'), null);
    });

    test('fire beats the physical kinds, cold beats fire, sludge beats cold', () => {
        for (const t of ['physical', 'slash', 'stab', 'crush']) assert.equal(matchup('fire', t), 'weak');
        assert.equal(matchup('cold', 'fire'), 'weak');
        assert.equal(matchup('sludge', 'cold'), 'weak');
        assert.equal(matchup('physical', 'energy'), 'weak');
    });

    test('the reverse of a weakness is a resistance', () => {
        for (const e of EDGES) {
            const a = Object.keys(DAMAGE_TYPES).find(t => phaseOf(t) === e.from);
            const b = Object.keys(DAMAGE_TYPES).find(t => phaseOf(t) === e.to);
            assert.equal(matchup(a, b), 'weak');
            assert.equal(matchup(b, a), 'resist');
        }
        assert.ok(resistancesOf('physical').includes('energy'));
    });

    test('same phase, unplaced and unknown types are neutral', () => {
        assert.equal(matchup('fire', 'fire'), null);
        assert.equal(matchup('energy', 'clean'), null);
        assert.equal(matchup('poison', 'sludge'), null);
        assert.equal(matchup('fire', 'poison'), null);
        assert.equal(matchup('nonsense', 'fire'), null);
        assert.equal(phaseOf('nonsense'), null);
    });
});

