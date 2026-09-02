// enemy-kits.test.js — enemies eating their own kits.
//
// Law 6f authored the kits and made their value visible on the nameplate, but
// nothing ever CONSUMED them: the systems audit lists "enemy kits" among the
// systems that never execute because "the enemy is dead before its second turn".
// With fight length re-roled to TTK 5-8 there is finally a middle to a fight, so
// the kit can be spent in it.
//
// Two pure pieces, tested here:
//   kitHealValue (items.js) — what one def would restore to THIS drinker, with
//     the sewerFare sign-flip riding the existing poitionBuff helper so there is
//     exactly one implementation of "medicine to a dweller, poison to everyone".
//   kitChoice (ai.js) — the pure ranking. ai.js is a LEAF and must stay one, so
//     the valuation is injected rather than imported.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, kitHealValue, applyKitItem } from '../game/items.js';
import { kitChoice, KIT_HP_FLOOR } from '../game/ai.js';
import { Enemy } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';

const val = (id, dweller) => kitHealValue(ITEMS[id], dweller);

describe('kitHealValue — what a kit item does to its own carrier', () => {
    test('plain food heals whoever eats it', () => {
        assert.equal(val('hot_dog', false), 10);
        assert.equal(val('bandage', false), 25);
        assert.equal(val('boardwalk_burger', false), 15);
        assert.equal(val('hot_dog', true), 10, 'being a dweller does not change ordinary food');
    });

    test('sewer fare is medicine to a dweller', () => {
        // tunnel_mushroom: {health, -5, turns 2} flipped -> +5 a turn for 2 turns
        assert.equal(val('tunnel_mushroom', true), 10);
        // sludge_sack: {health, -3, turns 5} flipped -> +3 a turn for 5 turns
        assert.equal(val('sludge_sack', true), 15);
        // mystery_meat carries a flat `damage`, not a poition
        assert.equal(val('mystery_meat', true), 3);
    });

    test('and poison to everyone else — a clown must not eat its own mystery meat', () => {
        assert.equal(val('tunnel_mushroom', false), 0);
        assert.equal(val('sludge_sack', false), 0);
        assert.equal(val('mystery_meat', false), 0);
    });

    test('a weapon or a rock heals nobody', () => {
        assert.equal(val('rock', false), 0);
        assert.equal(val('rock', true), 0, 'a rock is not sewer fare');
        assert.equal(val('pipe', false), 0);
    });

    test('degenerate defs value at 0 rather than NaN', () => {
        assert.equal(kitHealValue(null, false), 0);
        assert.equal(kitHealValue({}, true), 0);
        assert.equal(kitHealValue({ effect: 'heal' }, false), 0);
    });
});

describe('kitChoice — when and what to drink', () => {
    const heal = (n) => ({ id: 'x' + n, effect: 'heal', healAmount: n });
    const valueOf = (def) => kitHealValue(def, false);

    test('a healthy enemy drinks nothing', () => {
        assert.equal(kitChoice(100, 100, [heal(25)], valueOf), null);
    });

    test('nor does one only lightly scratched', () => {
        assert.equal(kitChoice(KIT_HP_FLOOR + 1, 100, [heal(25)], valueOf), null);
    });

    test('at the floor it reaches for the kit', () => {
        const c = kitChoice(KIT_HP_FLOOR, 100, [heal(25)], valueOf);
        assert.ok(c);
        assert.equal(c.index, 0);
        assert.equal(c.heal, 25);
    });

    test('it takes the biggest heal available', () => {
        const c = kitChoice(50, 100, [heal(10), heal(25), heal(15)], valueOf);
        assert.equal(c.index, 1);
        assert.equal(c.heal, 25);
    });

    test('ties break by authored order, so it is deterministic', () => {
        assert.equal(kitChoice(50, 100, [heal(10), heal(10)], valueOf).index, 0);
    });

    test('an inedible kit yields nothing — it does not eat a rock', () => {
        assert.equal(kitChoice(50, 100, [ITEMS.rock, ITEMS.pipe], valueOf), null);
    });

    test('an empty or missing kit is null-safe', () => {
        assert.equal(kitChoice(50, 100, [], valueOf), null);
        assert.equal(kitChoice(50, 100, null, valueOf), null);
    });

    test('a non-dweller will not poison itself with sewer fare', () => {
        const asHuman = (def) => kitHealValue(def, false);
        assert.equal(kitChoice(50, 100, [ITEMS.mystery_meat], asHuman), null);
    });

    test('but a dweller eats the same item happily', () => {
        const asDweller = (def) => kitHealValue(def, true);
        const c = kitChoice(50, 100, [ITEMS.mystery_meat], asDweller);
        assert.ok(c, 'a Red Fungus should eat its own mystery meat');
        assert.equal(c.heal, 3);
    });
});

describe('the authored roster actually exercises this', () => {
    // If no shipped enemy can use its own kit, the feature is inert no matter how
    // well the pure functions behave. These pin that the content supports it.
    test('the Fungus King can heal from its own kit', () => {
        const kit = ['tunnel_mushroom', 'sludge_sack', 'boardwalk_burger'].map(id => ITEMS[id]);
        const c = kitChoice(50, 100, kit, (d) => kitHealValue(d, true));
        assert.ok(c);
        // mushroom 10, sludge_sack 15, burger 15 -> the sack wins on the
        // authored-order tie-break. A Fungus King healing by drinking sludge is
        // exactly the sewerFare design showing its face from the enemy side.
        assert.equal(c.def.id, 'sludge_sack');
        assert.equal(c.heal, 15);
    });

    test('the Were-Rat reaches for the bandage before the hot dog', () => {
        const kit = ['bandage', 'hot_dog'].map(id => ITEMS[id]);
        const c = kitChoice(50, 100, kit, (d) => kitHealValue(d, true));
        assert.equal(c.def.id, 'bandage');
        assert.equal(c.heal, 25);
    });

    test("the Carnival Clown's mystery meat is useless to it — it is not a dweller", () => {
        const c = kitChoice(50, 100, [ITEMS.mystery_meat], (d) => kitHealValue(d, false));
        assert.equal(c, null);
    });
});

describe('applyKitItem — the effect actually lands', () => {
    const drinker = (hp, over = {}) => ({
        entity: { hp, maxHp: 100 },
        buffs: [],
        addBuff(id, name, turns, type, extra) { this.buffs.push({ id, name, turns, type, ...extra }); },
        ...over,
    });

    test('flat food is an immediate HP gain', () => {
        const d = drinker(50);
        applyKitItem(ITEMS.bandage, d, false);
        assert.equal(d.entity.hp, 75);
    });

    test('and never overheals past the Hundred', () => {
        const d = drinker(90);
        applyKitItem(ITEMS.bandage, d, false);
        assert.equal(d.entity.hp, 100);
    });

    test('a poition rides the buff list, healing over its authored turns', () => {
        const d = drinker(50);
        applyKitItem(ITEMS.tunnel_mushroom, d, true);
        assert.equal(d.entity.hp, 50, 'not instant — it ticks');
        assert.equal(d.buffs.length, 1);
        assert.equal(d.buffs[0].turns, 2);
        assert.ok(d.buffs[0].dmg < 0, 'negative dmg is healing');
        assert.equal(d.buffs[0].type, 'buff');
    });

    test('flat-damage sewer fare heals a dweller immediately', () => {
        const d = drinker(50);
        applyKitItem(ITEMS.mystery_meat, d, true);
        assert.equal(d.entity.hp, 53);
    });

    test('and hurts a non-dweller — the sign flip is real in both directions', () => {
        const d = drinker(50);
        applyKitItem(ITEMS.mystery_meat, d, false);
        assert.equal(d.entity.hp, 47);
    });

    test('an inedible item does nothing and reports so', () => {
        const d = drinker(50);
        assert.equal(applyKitItem(ITEMS.rock, d, false), null);
        assert.equal(d.entity.hp, 50);
    });

    test('null-safe', () => {
        assert.equal(applyKitItem(null, drinker(50), false), null);
        assert.equal(applyKitItem(ITEMS.bandage, null, false), null);
        assert.equal(applyKitItem(ITEMS.bandage, { }, false), null);
    });
});

describe('a real enemy eats in a real turn', () => {
    // The pure pieces passing does not prove the wiring fires. This drives
    // tickNpcState the way enemies.js does.
    const openRoom = ['...........', '...........', '...........', '...........', '...........'];
    function makeGame(px, py) {
        const H = openRoom.length, W = openRoom[0].length;
        return {
            playerX: px, playerY: py, enemies: [], containers: [], turn: 0, _MOVE_MS: 150,
            map: { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && openRoom[y][x] !== '#' },
            rng: { pick: (a) => a[0], float: () => 0.5 },
            damageTaken: 0,
            applyDamageToPlayer(d) { this.damageTaken += d; },
        };
    }
    const hurt = (g, hp, over = {}) => {
        const e = new Enemy({ id: 'k1', type: 'Fungus', x: 5, y: 2, sightRange: 8, facing: 'S', ...over });
        e.entity.hp = hp;
        g.enemies.push(e);
        return e;
    };

    test('a hurt enemy spends its turn eating instead of attacking', () => {
        const g = makeGame(5, 3);                      // player ADJACENT and in its cone
        const e = hurt(g, 50, { loadout: ['bandage'], damage: 9 });
        const b1 = tickNpcState(g, e, 1);              // spots AND eats, same beat
        assert.equal(e.entity.hp, 75, 'the bandage landed');
        assert.deepEqual(e.loadout, [], 'and left the kit');
        assert.equal(g.damageTaken, 0, 'eating IS the turn — it did not also swing');
        assert.match(b1.map(m => m.text || m).join(' '), /digs out .* and uses it/);

        // And the very next beat it is back above the kit floor, so it fights again
        // rather than standing there eating nothing.
        tickNpcState(g, e, 2);
        assert.ok(g.damageTaken > 0, 'healed up, it returns to swinging');
    });

    test('a healthy enemy attacks instead of eating', () => {
        const g = makeGame(5, 3);
        const e = hurt(g, 100, { loadout: ['bandage'], damage: 9 });
        tickNpcState(g, e, 1);
        tickNpcState(g, e, 2);
        assert.ok(g.damageTaken > 0, 'it should be hitting you');
        assert.deepEqual(e.loadout, ['bandage'], 'and still be carrying its kit');
    });

    test('carried supplies are spent BEFORE gold', () => {
        const g = makeGame(5, 3);
        const e = hurt(g, 30, { loadout: ['bandage'], gold: 100, damage: 9 });
        tickNpcState(g, e, 1);
        tickNpcState(g, e, 2);
        assert.equal(e.gold, 100, 'it must not buy while it still has a kit');
        assert.deepEqual(e.loadout, []);
    });

    test('once the kit is gone it falls back to buying', () => {
        const g = makeGame(5, 3);
        const e = hurt(g, 30, { loadout: [], gold: 100, damage: 9 });
        tickNpcState(g, e, 1);
        tickNpcState(g, e, 2);
        assert.ok(e.gold < 100, 'with no kit left, Law 6a takes over');
    });

    test('a non-dweller does not poison itself with its own mystery meat', () => {
        const g = makeGame(5, 3);
        const e = hurt(g, 50, { loadout: ['mystery_meat'], damage: 9, sewerDweller: false });
        tickNpcState(g, e, 1);
        tickNpcState(g, e, 2);
        assert.equal(e.entity.hp, 50, 'it must not eat something that hurts it');
        assert.deepEqual(e.loadout, ['mystery_meat'], 'and keeps it to throw at you later');
    });

    test('a dweller does eat it', () => {
        const g = makeGame(5, 3);
        const e = hurt(g, 50, { loadout: ['mystery_meat'], damage: 9, sewerDweller: true });
        tickNpcState(g, e, 1);
        tickNpcState(g, e, 2);
        assert.equal(e.entity.hp, 53);
        assert.deepEqual(e.loadout, []);
    });
});

describe('it does not double-dose', () => {
    // Found in live play: a kitted enemy ate three items on three consecutive
    // turns, burning a mushroom while the sludge sack it drank was still
    // regenerating it. Wasteful, looks stupid, and it dumps the whole kit — which
    // also robs the player of the Law 6f reward for rushing it down.
    const heal = (n) => ({ id: 'x' + n, effect: 'heal', healAmount: n });
    const valueOf = (d) => kitHealValue(d, false);

    test('an enemy already regenerating reaches for nothing', () => {
        assert.equal(kitChoice(50, 100, [heal(25)], valueOf, true), null);
    });

    test('but one that is merely poisoned still eats', () => {
        // A POSITIVE-dmg buff is a debuff eating them alive; that is a reason to
        // heal, not a reason to wait.
        assert.ok(kitChoice(50, 100, [heal(25)], valueOf, false));
    });

    test('the flag defaults to false, so existing callers are unchanged', () => {
        assert.ok(kitChoice(50, 100, [heal(25)], valueOf));
    });
});
