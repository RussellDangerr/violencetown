// crit-kinds.test.js — crits from stacked weakness kinds (plans/el2-crits-from-weakness-kinds.md).
//
// Every weakness is x1.5 and the kinds multiply: element (the hit's type is a
// weakness), back (a backstab), state (feared or poisoned). Two kinds is a crit;
// three knock out a non-boss, and a boss takes the plain x3.375.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    Entity, attack, computeHit, elementalMult, isBackstab,
    WEAKNESS_MULT, WEAKNESS_STATES, weaknessKinds, critOf, knockoutDamage,
} from '../game/combat.js';
import { Enemy } from '../game/enemies.js';

// The same steps combatAttack takes (main.js), on plain data: count the kinds,
// fold each into its bucket, round once, knock out on three, then let armor soak.
function swing({ base = 20, type = null, target, attacker = { x: 0, y: 0 }, boss = false }) {
    const elemental = elementalMult(type, target);
    const backstab = isBackstab(attacker.x, attacker.y, target);
    const kinds = weaknessKinds({ elemental, backstab, target });
    const hit = critOf(kinds, { boss });
    let dmg = computeHit({
        base, elemental,
        positional: backstab ? WEAKNESS_MULT : 1,
        state: kinds.includes('state') ? WEAKNESS_MULT : 1,
    });
    if (dmg === 0) return { kinds, hit, dmg, result: null };
    if (hit.knockout) dmg = knockoutDamage(dmg, target.entity);
    const result = attack({ name: 'you' }, target.entity, dmg);
    return { kinds, hit, dmg, result };
}

// A target at (5,5) that last stepped right, so its back is (4,5).
function foe({ weak = [], buffs = [], armor = 0, hp = 100 } = {}) {
    return { x: 5, y: 5, _lastDx: 1, _lastDy: 0, weak, buffs, entity: new Entity({ name: 'foe', hp, armor }) };
}
const BEHIND = { x: 4, y: 5 };
const IN_FRONT = { x: 6, y: 5 };

describe('one weakness is x1.5', () => {
    test('the constant is the ruling', () => assert.equal(WEAKNESS_MULT, 1.5));
    test('an elemental weakness is x1.5', () => {
        assert.equal(elementalMult('energy', { weak: ['energy'] }), 1.5);
    });
    test('resist and immune are untouched', () => {
        assert.equal(elementalMult('cold', { resist: ['cold'] }), 0.5);
        assert.equal(elementalMult('fear', { immune: ['fear'] }), 0);
    });
    test('the state bucket multiplies like the others', () => {
        assert.equal(computeHit({ base: 20, state: 1.5 }), 30);
        assert.equal(computeHit({ base: 20 }), 20, 'and defaults to x1');
    });
});

describe('counting the kinds', () => {
    test('nothing met, no kinds', () => {
        assert.deepEqual(weaknessKinds({ elemental: 1, backstab: false, target: foe() }), []);
    });
    test('each kind on its own', () => {
        assert.deepEqual(weaknessKinds({ elemental: 1.5 }), ['element']);
        assert.deepEqual(weaknessKinds({ backstab: true }), ['back']);
        assert.deepEqual(weaknessKinds({ target: foe({ buffs: [{ id: 'feared', turns: 2 }] }) }), ['state']);
    });
    test('feared and poisoned are the weak states, and only they count', () => {
        assert.deepEqual([...WEAKNESS_STATES].sort(), ['feared', 'poison']);
        assert.deepEqual(weaknessKinds({ target: foe({ buffs: [{ id: 'poison', turns: 3 }] }) }), ['state']);
        for (const id of ['fire', 'sludge', 'guard', 'rattled', 'strength']) {
            assert.deepEqual(weaknessKinds({ target: foe({ buffs: [{ id, turns: 3 }] }) }), [], id);
        }
    });
    test('feared AND poisoned is still one state kind', () => {
        const t = foe({ buffs: [{ id: 'feared', turns: 2 }, { id: 'poison', turns: 3 }] });
        assert.deepEqual(weaknessKinds({ target: t }), ['state']);
    });
    test('a resisted or immune hit is not an element kind', () => {
        assert.deepEqual(weaknessKinds({ elemental: 0.5 }), []);
        assert.deepEqual(weaknessKinds({ elemental: 0 }), []);
    });
    test('a real Enemy\'s buffs are what it reads', () => {
        const e = new Enemy({ type: 'Red Fungus', x: 1, y: 1 });
        assert.deepEqual(weaknessKinds({ target: e }), []);
        e.addBuff('feared', 'Feared', 3, 'debuff');
        assert.deepEqual(weaknessKinds({ target: e }), ['state']);
        const p = new Enemy({ type: 'Red Fungus', x: 1, y: 1 });
        p.addBuff('poison', 'Poisoned', 3, 'debuff', { dmg: 2 });
        assert.deepEqual(weaknessKinds({ target: p }), ['state']);
    });
});

describe('two kinds is a crit', () => {
    test('one kind is not', () => {
        assert.deepEqual(critOf(['back']), { kinds: 1, crit: false, knockout: false });
        assert.deepEqual(critOf([]), { kinds: 0, crit: false, knockout: false });
    });
    test('two kinds are, and not a knockout', () => {
        assert.deepEqual(critOf(['element', 'back']), { kinds: 2, crit: true, knockout: false });
    });
    test('a backstab on a feared foe lands x2.25 and crits', () => {
        const t = foe({ buffs: [{ id: 'feared', turns: 2 }] });
        const r = swing({ base: 20, target: t, attacker: BEHIND });
        assert.deepEqual(r.kinds, ['back', 'state']);
        assert.equal(r.hit.crit, true);
        assert.equal(r.dmg, 45, '20 x 1.5 x 1.5');
        assert.equal(t.entity.hp, 55);
    });
    test('the same swing from in front is one kind, x1.5, no crit', () => {
        const t = foe({ buffs: [{ id: 'feared', turns: 2 }] });
        const r = swing({ base: 20, target: t, attacker: IN_FRONT });
        assert.equal(r.hit.crit, false);
        assert.equal(r.dmg, 30);
    });
    test('an element weakness from behind crits too', () => {
        const r = swing({ base: 20, type: 'energy', target: foe({ weak: ['energy'] }), attacker: BEHIND });
        assert.deepEqual(r.kinds, ['element', 'back']);
        assert.equal(r.hit.crit, true);
        assert.equal(r.dmg, 45);
    });
});

describe('three kinds knock out a non-boss', () => {
    const three = () => foe({ weak: ['energy'], buffs: [{ id: 'poison', turns: 3 }], armor: 10 });

    test('critOf calls it', () => {
        assert.deepEqual(critOf(['element', 'back', 'state']), { kinds: 3, crit: true, knockout: true });
        assert.deepEqual(critOf(['element', 'back', 'state'], { boss: true }), { kinds: 3, crit: true, knockout: false });
    });
    test('a weak hit is enough to empty it, armor and all', () => {
        const t = three();
        const r = swing({ base: 2, type: 'energy', target: t, attacker: BEHIND });
        assert.equal(r.hit.knockout, true);
        assert.equal(t.entity.hp, 0);
        assert.equal(r.result.killed, true);
    });
    test('negative armor knocks out exactly too', () => {
        const t = foe({ weak: ['energy'], buffs: [{ id: 'feared', turns: 1 }], armor: -80 });
        const r = swing({ base: 1, type: 'energy', target: t, attacker: BEHIND });
        assert.equal(r.result.killed, true);
    });
    test('a boss takes x3.375 and stays standing', () => {
        const t = three();
        const r = swing({ base: 20, type: 'energy', target: t, attacker: BEHIND, boss: true });
        assert.equal(r.hit.knockout, false);
        assert.equal(r.dmg, 68, '20 x 1.5^3 = 67.5, rounded once');
        assert.equal(t.entity.hp, 100 - (68 - 10));
    });
    test('knockoutDamage never lowers a hit that already kills', () => {
        assert.equal(knockoutDamage(500, new Entity({ hp: 100, armor: 0 })), 500);
        assert.equal(knockoutDamage(5, new Entity({ hp: 40, armor: 6 })), 46);
    });
    test('an immune hit is still no hit, even with the other two kinds', () => {
        const t = foe({ buffs: [{ id: 'feared', turns: 2 }] });
        t.immune = ['fear'];
        const r = swing({ base: 20, type: 'fear', target: t, attacker: BEHIND });
        assert.equal(r.dmg, 0);
        assert.equal(t.entity.hp, 100);
    });
});

// main.js needs a DOM to import, so (like hit-kind-splats.test.js) these pin the
// wiring in combatAttack by its source.
describe('combatAttack wires the kinds in', () => {
    const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8')
        .replace(/\r\n/g, '\n');
    const head = '    combatAttack(enemyObj, damage, opts = {}) {';
    const at = mainSrc.indexOf(head);
    const body = mainSrc.slice(at, mainSrc.indexOf('\n    }\n', at));

    test('it is found', () => assert.ok(at > 0));
    test('it counts the kinds from the element, the backstab and the target', () => {
        assert.match(body, /weaknessKinds\(\{ elemental: elementalMult\(opts\.type \|\| kind, enemyObj\), backstab, target: enemyObj \}\)/);
    });
    test('a boss is the boss flag or a _boss tag', () => {
        assert.match(body, /critOf\(kinds, \{ boss: enemyObj\.boss === true \|\| isBoss\(enemyObj\) \}\)/);
    });
    test('each kind is x1.5 in its own bucket', () => {
        assert.match(body, /positional: backstab \? WEAKNESS_MULT : 1,/);
        assert.match(body, /state: kinds\.includes\('state'\) \? WEAKNESS_MULT : 1,/);
    });
    test('the knockout comes after the immune check, before the blow lands', () => {
        const immune = body.indexOf('is immune!');
        const ko = body.indexOf('if (weakHit.knockout) finalDmg = knockoutDamage(finalDmg, enemyObj.entity);');
        const blow = body.indexOf('attack(playerEntity, enemyObj.entity, finalDmg)');
        assert.ok(immune > 0 && ko > immune && blow > ko, `${immune} < ${ko} < ${blow}`);
    });
    test('a crit sets the gold-ring splat', () => {
        assert.match(body, /crit: !!opts\.crit \|\| weakHit\.crit,/);
    });
});
