// throw-vs-use.test.js — throwing a heal item must THROW (damage path), not heal.
//
// THE FIX (fix/critical-path): _doThrow in main.js now calls the now-EXPORTED
// resolveThrow directly, instead of routing through resolveUse — which dispatches
// on itemDef.useType and would HEAL a 'self' consumable while discarding the throw
// direction. So the unit under test here is resolveThrow: the function the throw
// action actually uses. These are GREEN regression guards.
//
// By design, resolveUse on a 'self' item STILL heals — "use" and "throw" are now
// separate seams; throwing no longer passes through resolveUse at all. The last
// suite pins that intentional split.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ITEMS, resolveThrow, resolveUse, ownedItemDefs, hasItemDef } from '../game/items.js';
import { tickBuffList } from '../game/buffs.js';

// A throwable line: player at (0,0) facing east; one enemy two tiles east.
// resolveThrow walks `range` tiles from the player; range>=2 reaches the enemy.
function makeFakeGame() {
    const enemy = {
        x: 2, y: 0,
        // resolveThrow's damage branch spares non-hostiles (isHostile reads
        // allegiance — ai.js), so a stub target must declare it.
        allegiance: 'hostile',
        entity: {
            name: '[Sewer Rat]',
            hp: 50, maxHp: 50, alive: true,
            isAlive() { return this.alive; },
            takeDamage(d) { this.hp = Math.max(0, this.hp - d); if (this.hp === 0) this.alive = false; return d; },
        },
    };
    const g = {
        playerX: 0, playerY: 0,
        playerHp: 50, playerMaxHp: 100,   // wounded, so a heal would be visible
        equipment: {}, tempEquips: [], buffs: [],
        enemies: [enemy],
        combatAttacks: [],                // record of damage dealt via throw
        damageNumbers: [],
        map: { isWalkable: () => true },  // open corridor along the throw line
        hasBuff() { return false; },
        _log() {}, // real Game logs to a scrollback; tests don't need to see it
        _spawnDamageNumber(x, y, text, color, size) { this.damageNumbers.push({ x, y, text, color, size }); },
        // Mirrors Game._entitiesInRadius (main.js) — the shared AoE primitive
        // resolveThrow's 3x3 burst walks. Absent here until now, which is why the
        // rock throw died with "not a function" in the mock but works in play.
        _entitiesInRadius(cx, cy, r) {
            return this.enemies.filter(e => e.entity.isAlive()
                && Math.abs(e.x - cx) <= r && Math.abs(e.y - cy) <= r);
        },
        combatAttack(enemyObj, dmg) {
            this.combatAttacks.push({ target: enemyObj.entity.name, dmg });
            enemyObj.entity.takeDamage(dmg);
            return `${dmg} dmg`;
        },
    };
    g._enemyRef = enemy;
    return g;
}

const HEAL = ITEMS.bandage;          // { useType:'self', effect:'heal', healAmount:25 }
const EAST = { dx: 1, dy: 0 };

describe('throwing a heal item via resolveThrow (regression guard — expected GREEN)', () => {

    test('sanity: bandage is a self-use heal item with a heal amount', () => {
        assert.equal(HEAL.useType, 'self');
        assert.equal(HEAL.effect, 'heal');
        assert.ok(HEAL.healAmount > 0);
    });

    test('resolveThrow is exported (the seam _doThrow now uses)', () => {
        assert.equal(typeof resolveThrow, 'function');
    });

    test('throwing a heal item deals NO damage — it has no damage field', () => {
        const g = makeFakeGame();
        const thrown = { ...HEAL, range: 4 };

        resolveThrow(g, thrown, EAST, 1);

        assert.equal(g.combatAttacks.length, 0,
            'a heal item has no `damage` field, so the burst takes the heal branch, never combatAttack');
        assert.equal(g._enemyRef.entity.hp, 50, 'a thrown heal leaves enemies untouched');
    });

    // The original regression this block guards — "Throw always throws" — still
    // holds: a thrown heal must never behave like DRINKING it. What changed is
    // that a burst landing ON you now mends you at half effect (see below).
    test('throwing a heal item does NOT heal the thrower when it lands out of burst range', () => {
        const g = makeFakeGame();
        const before = g.playerHp;
        const thrown = { ...HEAL, range: 4 };

        resolveThrow(g, thrown, EAST, 1);   // impact is the enemy tile, 2 away

        assert.equal(g.playerHp, before,
            'it left their hand as a projectile — a distant burst mends no one');
    });

    test('a heal burst landing beside the thrower mends them at HALF effect', () => {
        const g = makeFakeGame();
        const before = g.playerHp;
        const thrown = { ...HEAL, range: 4 };

        // Real-placement (wheel reticle) onto the tile beside the player — inside the 3x3.
        resolveThrow(g, thrown, null, 1, { x: g.playerX + 1, y: g.playerY });

        assert.equal(g.playerHp, before + Math.round(HEAL.healAmount / 2),
            'the burst mends friendlies inside its 3x3 at half effect');
        assert.equal(g.combatAttacks.length, 0, 'still no damage — heal branch only');
    });

    test('stack count does NOT scale the burst (flat half effect)', () => {
        const one = makeFakeGame(), three = makeFakeGame();
        const thrown = { ...HEAL, range: 4 };
        const beside = (g) => ({ x: g.playerX + 1, y: g.playerY });

        resolveThrow(one, thrown, null, 1, beside(one));
        resolveThrow(three, thrown, null, 3, beside(three));

        assert.equal(three.playerHp, one.playerHp,
            'the 3x3 burst applies a flat half effect — resolveThrow ignores stackCount (_stackCount)');
    });
});

// By design: the "use" seam still heals a self-use item. Pins the intentional
// throw/use split so a future change that re-merges them trips this guard.
describe('resolveUse on a self-use item still heals (by design — expected GREEN)', () => {
    test('using (not throwing) a bandage heals the player and deals no damage', () => {
        const g = makeFakeGame();
        const before = g.playerHp;
        resolveUse(g, HEAL, null, 1); // "use" — no throw direction
        assert.ok(g.playerHp > before, 'using a heal item should heal');
        assert.equal(g.combatAttacks.length, 0, 'using a heal item deals no damage');
    });
});

// Control — a real throw-type item (rock) also throws via resolveThrow.
describe('control: a throw-type item throws via resolveThrow (expected GREEN)', () => {
    test('throwing a rock deals damage to the enemy in line', () => {
        const g = makeFakeGame();
        resolveThrow(g, ITEMS.rock, EAST, 1); // rock: range 4
        assert.equal(g.combatAttacks.length, 1, 'rock should hit via combatAttack');
        assert.ok(g._enemyRef.entity.hp < 50, 'rock should damage the enemy');
        assert.equal(g.playerHp, 50, 'throwing a rock must not heal the player');
    });
});

// ── PD-2: the ownership lens counts equipped + temp-equipped items, not just the
// bag — so a throwable stowed in an equip slot no longer hides its own Throw verb.
describe('ownership lens walks inventory + equipment + tempEquips (PD-2)', () => {
    const isThrow = d => d && d.useType && String(d.useType).includes('throw');

    test('a throwable equipped in a slot (empty bag) is still "owned" — the Throw-verb bug', () => {
        const g = { inventory: [null, null], equipment: { sides: ITEMS.rock, weapon: null }, tempEquips: [] };
        assert.equal(hasItemDef(g, isThrow), true);
    });

    test('a throwable in the bag is owned; a non-throwable is not', () => {
        const inBag = { inventory: [{ itemDef: ITEMS.rock, count: 1 }], equipment: {}, tempEquips: [] };
        assert.equal(hasItemDef(inBag, isThrow), true);
        const none = { inventory: [null], equipment: { sides: ITEMS.bandage }, tempEquips: [] };
        assert.equal(hasItemDef(none, isThrow), false, 'bandage is self-use, not throwable');
    });

    test('ownedItemDefs yields defs from all three stores', () => {
        const g = {
            inventory: [{ itemDef: ITEMS.bandage, count: 1 }, null],
            equipment: { sides: ITEMS.rock, weapon: null },
            tempEquips: [{ itemDef: ITEMS.sludge_sack }],
        };
        const ids = [...ownedItemDefs(g)].map(d => d.id).sort();
        assert.deepEqual(ids, ['bandage', 'rock', 'sludge_sack']);
    });

    test('tolerates missing stores (partial game / test stubs)', () => {
        assert.equal(hasItemDef({}, isThrow), false);
        assert.deepEqual([...ownedItemDefs({})], []);
    });
});

describe('thrown DoT items apply their buff (Law 7)', () => {
    test('a sludge sack lands a 3x5 sludge DoT on the centre target', () => {
        const g = makeFakeGame();
        const target = g.enemies[0];
        resolveThrow(g, ITEMS.sludge_sack, null, 1, { x: target.x, y: target.y });
        const dot = target.buffs?.find(b => b.id === 'sludge');
        assert.ok(dot, 'expected a sludge DoT on the target');
        assert.equal(dot.dmg, 3);
        assert.equal(dot.turns, 5);
    });
    test('a DoT throw no longer shatters harmlessly', () => {
        const g = makeFakeGame();
        const target = g.enemies[0];
        const msg = resolveThrow(g, ITEMS.sludge_sack, null, 1, { x: target.x, y: target.y });
        assert.ok(!/shatters harmlessly/.test(msg), `got: ${msg}`);
    });
    test('re-throwing refreshes rather than stacking a second buff', () => {
        const g = makeFakeGame();
        const target = g.enemies[0];
        resolveThrow(g, ITEMS.sludge_sack, null, 1, { x: target.x, y: target.y });
        resolveThrow(g, ITEMS.sludge_sack, null, 1, { x: target.x, y: target.y });
        assert.equal(target.buffs.filter(b => b.id === 'sludge').length, 1);
    });
});

// Task 16 — sewer fare flips sign (not magnitude) on a sewer-dweller. Same
// mock as above; the only difference between the two cases is the target's
// `sewerDweller` flag, proving the eater — not the item — decides.
describe('sewer fare — the eater decides (Task 16)', () => {
    test('a tunnel mushroom thrown at a sewer-dweller leaves a NEGATIVE dmg (it heals)', () => {
        const g = makeFakeGame();
        const target = g.enemies[0];
        target.sewerDweller = true;
        resolveThrow(g, ITEMS.tunnel_mushroom, null, 1, { x: target.x, y: target.y });
        const dot = target.buffs?.find(b => b.id === 'poison');
        assert.ok(dot, 'expected a poison buff entry on the target');
        assert.equal(dot.dmg, -5, 'same magnitude as the human dose, sign flipped to heal');
        assert.equal(dot.turns, 2);
    });
    test('the same throw at an ordinary enemy leaves a POSITIVE dmg (it poisons)', () => {
        const g = makeFakeGame();
        const target = g.enemies[0];
        resolveThrow(g, ITEMS.tunnel_mushroom, null, 1, { x: target.x, y: target.y });
        const dot = target.buffs?.find(b => b.id === 'poison');
        assert.ok(dot, 'expected a poison buff entry on the target');
        assert.equal(dot.dmg, 5);
    });
    test('the negative dmg actually HEALS when the buff ticks (applyDot, buffs.js)', () => {
        const g = makeFakeGame();
        const target = g.enemies[0];
        target.sewerDweller = true;
        target.entity.hp = 40; // wounded, so a heal is visible and does not clip at maxHp
        resolveThrow(g, ITEMS.tunnel_mushroom, null, 1, { x: target.x, y: target.y });
        tickBuffList(target.buffs, target, g, null);
        assert.equal(target.entity.hp, 45, 'a -5 dmg tick is a +5 heal via the shared DoT machinery');
    });
    test('the positive dmg actually HARMS a human when the buff ticks', () => {
        const g = makeFakeGame();
        const target = g.enemies[0];
        resolveThrow(g, ITEMS.tunnel_mushroom, null, 1, { x: target.x, y: target.y });
        tickBuffList(target.buffs, target, g, null);
        assert.equal(target.entity.hp, 45, 'a +5 dmg tick harms a human the same as any other poison');
    });
});
