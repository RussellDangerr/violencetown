// throw-vs-use.test.js — throwing a heal item must THROW (damage path), not heal.
//
// THE BUG (documented here, EXPECTED RED on current code):
//   items.js::resolveUse dispatches purely on itemDef.useType:
//       switch (itemDef.useType) { case 'self': resolveSelfUse(...) ; case 'throw': resolveThrow(...) ; ... }
//   A heal consumable (bandage, boardwalk_burger, …) has useType:'self'. So even
//   when the caller asks to THROW it (passes a direction + stackCount), resolveUse
//   routes to resolveSelfUse and HEALS THE PLAYER instead of dealing damage along
//   the throw line. There is no "force throw regardless of useType" path, so a
//   thrown heal item can never hit an enemy.
//
//   resolveThrow itself is NOT exported from items.js (only resolveUse, equipItem,
//   tickTempEquips, ITEMS are). The task asked to exercise resolveUse/resolveThrow;
//   since resolveThrow is internal, we drive the PUBLIC resolveUse "throw" call and
//   assert the throw semantics, which is exactly the seam where the bug lives.
//
// When the dispatch bug is fixed (resolveUse honors the chosen action / a throw
// of a self-use item is forced down the damage path), these tests go GREEN.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ITEMS, resolveUse } from '../game/items.js';

// A throwable line: player at (0,0) facing east; one enemy two tiles east.
// resolveThrow walks `range` tiles from the player; range>=2 reaches the enemy.
function makeFakeGame() {
    const enemy = {
        x: 2, y: 0,
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
        _spawnDamageNumber(x, y, text, color, size) { this.damageNumbers.push({ x, y, text, color, size }); },
        combatAttack(enemyObj, dmg) {
            this.combatAttacks.push({ target: enemyObj.entity.name, dmg });
            enemyObj.entity.takeDamage(dmg);
            return `${dmg} dmg`;
        },
    };
    g._enemyRef = enemy;
    return g;
}

// A heal item that is a thrown range weapon's polar opposite: useType 'self'.
const HEAL = ITEMS.bandage;          // { useType:'self', effect:'heal', healAmount:25, range:undefined }
const EAST = { dx: 1, dy: 0 };

describe('throwing a heal item (EXPECTED RED until the dispatch bug is fixed)', () => {

    test('sanity: bandage is a self-use heal item with a heal amount', () => {
        assert.equal(HEAL.useType, 'self');
        assert.equal(HEAL.effect, 'heal');
        assert.ok(HEAL.healAmount > 0);
    });

    test('[EXPECTED RED] throwing a bandage deals damage to the enemy in line', () => {
        const g = makeFakeGame();
        // Give the heal item a throw range for this scenario; a real thrown item
        // needs a range to travel. (Doesn't change useType, which is the bug.)
        const thrown = { ...HEAL, range: 4 };

        // Caller intent: THROW. We pass a direction + stackCount, the throw-shaped
        // call signature. A correct engine treats this as a throw.
        resolveUse(g, thrown, EAST, 1);

        // DESIRED: the rat took throw damage (10 per item * stackCount).
        // FAILS today: resolveUse saw useType:'self' and healed the player, so
        // combatAttack was never called and the rat is untouched.
        assert.equal(
            g.combatAttacks.length, 1,
            'throwing a heal item should route through combatAttack (damage), not healing',
        );
        assert.equal(g.combatAttacks[0].dmg, 10, 'thrown single item should deal 10 damage');
        assert.ok(g._enemyRef.entity.hp < 50, 'enemy HP should drop from a thrown item');
    });

    test('[EXPECTED RED] throwing a heal item does NOT heal the thrower', () => {
        const g = makeFakeGame();
        const before = g.playerHp;
        const thrown = { ...HEAL, range: 4 };

        resolveUse(g, thrown, EAST, 1);

        // DESIRED: throwing your bandage at a rat gives up the heal — HP unchanged.
        // FAILS today: player was healed by HEAL.healAmount because resolveUse
        // dispatched to the self-use heal branch.
        assert.equal(
            g.playerHp, before,
            'throwing a heal item must not heal the thrower (it left their hand as a projectile)',
        );
    });
});

// Control case — proves the harness and the real damage path are wired right,
// so the failures above are about the dispatch bug, not the test scaffold.
// A 'throw'-typed item (rock) MUST already deal damage on the current code.
describe('control: a real throw item still throws (EXPECTED GREEN)', () => {
    test('throwing a rock deals damage to the enemy in line', () => {
        const g = makeFakeGame();
        resolveUse(g, ITEMS.rock, EAST, 1); // rock: useType:'throw', range:4
        assert.equal(g.combatAttacks.length, 1, 'rock should hit via combatAttack');
        assert.ok(g._enemyRef.entity.hp < 50, 'rock should damage the enemy');
        assert.equal(g.playerHp, 50, 'throwing a rock must not heal the player');
    });

    test('stacked throw scales damage by stack count (10 per item)', () => {
        const g = makeFakeGame();
        resolveUse(g, ITEMS.rock, EAST, 3); // 3 rocks → 30 damage
        assert.equal(g.combatAttacks[0].dmg, 30, 'throw damage is 10 * stackCount');
    });
});
