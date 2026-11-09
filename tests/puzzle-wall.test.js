// puzzle-wall.test.js — the first lock in the game.
//
// `puzzleWall: true` has been spec'd in the balancing bible and enforced by the
// lint since the gold standard, and never once placed. The systems audit calls
// it "the cheapest new content in the repo" and notes the map is "fully open
// with one gate", so the beat every player recognises — *I couldn't beat that
// before and now I can* — does not exist anywhere in Violencetown.
//
// The Sludge Bloom is that beat. It is a lock with keys, not a wall: armor 15
// floors every melee weapon in the game to 1 damage a turn, which reads
// correctly as impossible, while its keys open it. Since EL2 the keys follow the
// weakness chart (game/elements.js): sludge is earth and wood opens earth, so
// energy and soap (clean) are weak x1.5, and fire is not. Its health is 60 so
// the Ray Gun still opens it in a handful of turns.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Entity, computeHit, elementalMult } from '../game/combat.js';
import { WEAPONS } from '../game/weapons.js';
import { SPELLS } from '../game/spells.js';
import { TRICKS } from '../game/tricks.js';
import { weaknessesOf } from '../game/elements.js';
import { Enemy } from '../game/enemies.js';
import { GameMap } from '../game/map.js';

const sewer = JSON.parse(fs.readFileSync(new URL('../game/sewer-map.json', import.meta.url), 'utf8'));
const bloom = sewer.enemies.find(e => e && e.id === 'sludge-bloom');

// How many turns `dmg` of `type` needs to break the Bloom, through the real
// elemental + armor pipeline.
function turnsToBreak(dmg, type) {
    const mult = elementalMult(type, bloom);
    const perTurn = Math.max(1, computeHit({ base: dmg, elemental: mult }) - bloom.armor);
    return { perTurn, turns: Math.ceil(bloom.hp / perTurn) };
}

describe('it is authored as a wall, not a fight', () => {
    test('it exists in the sewer', () => {
        assert.ok(bloom, 'sludge-bloom must be authored in sewer-map.json');
    });

    test('it declares puzzleWall, which is what exempts it from the Law 3 band', () => {
        assert.equal(bloom.puzzleWall, true);
        assert.ok(bloom.armor > 10, 'and it sits above the difficulty cap on purpose');
    });

    test('it deals no damage — a rock does not fight back', () => {
        assert.equal(bloom.damage, 0);
        assert.equal(bloom.sightRange, 0, 'and it does not watch you');
    });

    test('it is the one combatant under the Hundred: 60, by ruling, so its keys still open it at x1.5', () => {
        assert.equal(bloom.hp, 60);
    });

    test('it is HEAVY, or it would not be a wall at all', () => {
        // The shove displaces any blocking character. An unshoveable flag is the
        // difference between a lock and a revolving door.
        assert.equal(bloom.heavy, true);
        assert.equal(new Enemy(bloom).heavy, true, 'and the ctor must keep it');
    });
});

describe('steel does not open it', () => {
    for (const w of Object.values(WEAPONS)) {
        test(`${w.name} reads as impossible`, () => {
            const r = turnsToBreak(w.damage, w.damageType || 'physical');
            if ((w.damageType || 'physical') === 'physical') {
                assert.equal(r.perTurn, 1, 'floored to the minimum');
                assert.ok(r.turns >= bloom.hp, `${r.turns} turns is a wall`);
            }
        });
    }
});

describe('energy and soap open it (EL2: fire no longer does)', () => {
    test('the Ray Gun breaks it in a handful of turns', () => {
        const r = turnsToBreak(WEAPONS.ray_gun.damage, 'energy');
        assert.ok(r.turns <= 5, `expected a real key, got ${r.turns} turns`);
    });

    test('because it is authored weak to energy and clean, as the chart gives sludge', () => {
        assert.deepEqual(bloom.weak, ['energy', 'clean']);
        assert.equal(elementalMult('energy', bloom), 1.5);
        assert.equal(elementalMult('clean', bloom), 1.5);
        assert.deepEqual([...bloom.weak].sort(), weaknessesOf('sludge').sort());
    });

    test('and fire is no key: a fireball only chips it', () => {
        assert.equal(elementalMult('fire', bloom), 1);
        const r = turnsToBreak(SPELLS.fireball.damage, 'fire');
        assert.ok(r.turns > 5, `fire should not be a key, got ${r.turns} turns`);
    });

    test('and energy is reachable by more than one route', () => {
        // A lock with one key is a timeline; a lock with several is a web node.
        // The Ray Gun is the weapon, Ray Blast the trick that rides it, and soap
        // the scrub (game/item-uses.js). All three already shipped.
        assert.equal(WEAPONS.ray_gun.damageType, 'energy');
        assert.equal(TRICKS.ray_blast.damageType, 'energy');
        assert.ok(turnsToBreak(TRICKS.ray_blast.damage, 'energy').turns <= 5);
    });

    test('a bar of soap still opens it in one scrub', () => {
        // item-uses.js scrubs for hp + armor + 1, typed clean.
        const enough = bloom.hp + bloom.armor + 1;
        assert.equal(turnsToBreak(enough, 'clean').turns, 1);
    });
});

describe('the pocket it seals', () => {
    const map = new GameMap(sewer);
    const NB = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    const GRATE = 4;

    function reach(rat) {
        const walk = (x, y) => map.isWalkable(x, y) || (rat && map.isInBounds(x, y) && map.getTile(x, y) === GRATE);
        const blocked = new Set([
            ...(sewer.containers || []).map(c => `${c.x},${c.y}`),
            ...sewer.enemies.filter(e => e && typeof e === 'object').map(e => `${e.x},${e.y}`),
        ]);
        const seen = new Set([`${sewer.spawn.x},${sewer.spawn.y}`]);
        const q = [[sewer.spawn.x, sewer.spawn.y]];
        while (q.length) {
            const [x, y] = q.shift();
            for (const [dx, dy] of NB) {
                const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
                if (seen.has(k) || !walk(nx, ny) || blocked.has(k)) continue;
                if (dx && dy && (!walk(x + dx, y) || !walk(x, y + dy))) continue;
                seen.add(k); q.push([nx, ny]);
            }
        }
        return seen;
    }

    test('the cache behind it is NOT reachable on foot', () => {
        const on = reach(false);
        const cache = sewer.containers.find(c => c.id === 'bloom-cache');
        assert.ok(cache, 'the reward must exist');
        const anyNeighbour = NB.some(([dx, dy]) => on.has(`${cache.x + dx},${cache.y + dy}`));
        assert.equal(anyNeighbour, false, 'if you can already tap it, the wall gates nothing');
    });

    test('and the critical path is NOT gated — the boss stays reachable', () => {
        const on = reach(false);
        const boss = sewer.enemies.find(e => e && e.id === 'wererat');
        const reachableBoss = NB.some(([dx, dy]) => on.has(`${boss.x + dx},${boss.y + dy}`));
        assert.ok(reachableBoss, 'gating the converter run would soft-lock Chapter One');
        assert.ok(on.has(`${sewer.transitions[0].x},${sewer.transitions[0].y}`), 'and the way out stays open');
    });

    test('RAT FORM is a second key — the grate opens what feet cannot', () => {
        // rat_form has been granted by the Rat Ring, with a dedicated _canEnter
        // special case in main.js, and opened NOTHING: one grate tile existed in
        // the whole game and it sealed zero space. This is its first lock.
        const onFoot = reach(false);
        const asRat = reach(true);
        const opened = [...asRat].filter(k => !onFoot.has(k));
        assert.ok(opened.length >= 5, `rat form should open the pocket, opened ${opened.length}`);
    });
});
