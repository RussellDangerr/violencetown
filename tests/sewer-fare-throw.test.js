// sewer-fare-throw.test.js — ruling C4: thrown sewer fare mends a dweller.
//
// Sewer fare is supposed to invert by species: poison to a human, medicine to
// the things that live down here. Every OTHER sewerFare item is a `poition`, and
// the poition shape inverts through one shared seam (poitionBuff), so the throw
// path, the hand-fed give path and an enemy eating its own kit all agreed.
//
// mystery_meat is the one carrying a flat `damage` instead, and flat damage on
// the THROW path went through Game.combatAttack — whose pipeline, and
// Entity.takeDamage's `Math.max(1, rawDamage - armor)` floor beneath it, is
// built for positive numbers. A negative damage would have clamped back to "at
// least 1 damage" rather than healing. So a hand-fed mystery meat healed a rat
// while a thrown one hurt it, for no reason the player could see.
//
// The fix does NOT push negatives through combat. The dweller case takes the
// same direct HP delta the hand-fed path has always used, and everyone else goes
// through combatAttack untouched.
//
// Note what is deliberately NOT changed: converting mystery_meat to a one-turn
// poition was the obvious-looking fix and is wrong. It would route the give path
// through the buff list too, and five existing tests pin that a hand-fed dose
// lands IMMEDIATELY at full magnitude. Fixing the broken throw path must not
// cost the working give path its immediacy.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ITEMS, resolveThrow } from '../game/items.js';

const MEAT = ITEMS.mystery_meat;
const EAST = { dx: 1, dy: 0 };

// Player at (0,0) facing east; one target two tiles east, inside meat's range 3.
function makeGame({ sewerDweller = false, hp = 20, maxHp = 50 } = {}) {
    const foe = {
        x: 2, y: 0,
        allegiance: 'hostile',        // resolveThrow's damage branch spares non-hostiles
        sewerDweller,                 // ai.js isSewerDweller reads exactly this
        entity: {
            name: sewerDweller ? '[Sewer Rat]' : '[Townsperson]',
            hp, maxHp, alive: true,
            isAlive() { return this.alive; },
            takeDamage(d) { this.hp = Math.max(0, this.hp - d); if (this.hp === 0) this.alive = false; return d; },
        },
    };
    return {
        playerX: 0, playerY: 0,
        playerHp: 50, playerMaxHp: 100,
        equipment: {}, tempEquips: [], buffs: [],
        enemies: [foe],
        combatAttacks: [],
        splats: [],
        map: { isWalkable: () => true },
        hasBuff() { return false; },
        _log() {},
        _spawnDamageNumber() {},
        _spawnHitSplat(x, y, text, type) { this.splats.push({ x, y, text, type }); },
        _entitiesInRadius(cx, cy, r) {
            return this.enemies.filter(e => e.entity.isAlive()
                && Math.abs(e.x - cx) <= r && Math.abs(e.y - cy) <= r);
        },
        combatAttack(enemyObj, dmg) {
            this.combatAttacks.push({ target: enemyObj.entity.name, dmg });
            enemyObj.entity.takeDamage(dmg);
            return `${dmg} dmg`;
        },
        _enemyRef: foe,
    };
}

describe('C4 — thrown sewer fare inverts by species', () => {

    test('sanity: mystery_meat is flat-damage sewer fare, not a poition', () => {
        assert.equal(MEAT.sewerFare, true);
        assert.equal(typeof MEAT.damage, 'number');
        assert.equal(MEAT.poition, undefined,
            'if this became a poition, the give path lost its immediacy — see the header');
    });

    test('thrown at a sewer-dweller it MENDS, and never touches combatAttack', () => {
        const g = makeGame({ sewerDweller: true, hp: 20 });
        resolveThrow(g, MEAT, EAST);
        assert.ok(g._enemyRef.entity.hp > 20, 'the rat should have gained HP');
        assert.deepEqual(g.combatAttacks, [],
            'a mend must not go through combatAttack — that is what clamped it to damage');
        assert.ok(g.splats.some(s => s.type === 'heal'), 'a mend should float a heal splat');
    });

    test('thrown at anyone else it still harms, through combat as before', () => {
        const g = makeGame({ sewerDweller: false, hp: 20 });
        resolveThrow(g, MEAT, EAST);
        assert.ok(g._enemyRef.entity.hp < 20, 'a human should have lost HP');
        assert.equal(g.combatAttacks.length, 1, 'harm still routes through combatAttack');
    });

    test('the two directions are the same magnitude, opposite signs', () => {
        const heal = makeGame({ sewerDweller: true, hp: 20 });
        resolveThrow(heal, MEAT, EAST);
        const gained = heal._enemyRef.entity.hp - 20;

        const harm = makeGame({ sewerDweller: false, hp: 20 });
        resolveThrow(harm, MEAT, EAST);
        const lost = 20 - harm._enemyRef.entity.hp;

        assert.equal(gained, lost, 'medicine and poison should be the same number either way');
    });

    test('a dweller already at full health is not "caught in the splash"', () => {
        // Mirrors the immune-foe rule the damage path already follows: no effect
        // means it was not affected, so the throw must not report a hit.
        const g = makeGame({ sewerDweller: true, hp: 50, maxHp: 50 });
        const msg = resolveThrow(g, MEAT, EAST);
        assert.equal(g._enemyRef.entity.hp, 50, 'cannot overheal past maxHp');
        assert.deepEqual(g.splats, [], 'nothing healed, so nothing should float');
        assert.match(String(msg), /no one|harmlessly|nothing/i,
            `expected a "nothing happened" message, got: ${msg}`);
    });

    test('healing never pushes a dweller past maxHp', () => {
        const g = makeGame({ sewerDweller: true, hp: 49, maxHp: 50 });
        resolveThrow(g, MEAT, EAST);
        assert.equal(g._enemyRef.entity.hp, 50);
    });
});
