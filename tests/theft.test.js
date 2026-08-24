// theft.test.js — what actually comes off a victim.
//
// theft.js NEVER touches gold: it reports the amount and main.js moves it through
// trade.js's transferGold, so the single-choke-point invariant survives and a
// theft stays auditable beside every buy, sell and bribe. These tests pin that.
//
// It also never imports ITEMS or WEAPONS. Callers pass a `resolve` function —
// which in the game is Game._resolveItemDef, the one lookup that finds weapons
// too. A bare ITEMS[id] silently drops every weapon, and stolen Gear is
// overwhelmingly weapons.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { coinTake, kitTake, gearTake, gearWeight } from '../game/theft.js';

// A stand-in for Game._resolveItemDef over a small table.
function resolverFor(table) {
    return (id) => table[id] ?? null;
}

describe('coin', () => {
    test('capped by the limit and by their actual wallet', () => {
        assert.equal(coinTake({ gold: 500 }, 50), 50);
        assert.equal(coinTake({ gold: 20 }, 50), 20);
        assert.equal(coinTake({ gold: 0 }, 50), 0);
    });

    test('a victim with no gold field takes nothing rather than NaN', () => {
        assert.equal(coinTake({}, 50), 0);
        assert.equal(coinTake(null, 50), 0);
    });

    test('coinTake does NOT move the gold — that is transferGold\'s job', () => {
        const victim = { gold: 500 };
        coinTake(victim, 50);
        assert.equal(victim.gold, 500, 'theft.js must never mutate a wallet');
    });
});

describe('kit', () => {
    const table = {
        rock: { id: 'rock', baseValue: 3 },
        crowbar: { id: 'crowbar', baseValue: 40 },
        bandage: { id: 'bandage', baseValue: 8 },
    };

    test('removes the highest-value item and returns it', () => {
        const victim = { loadout: ['rock', 'crowbar', 'bandage'] };
        const got = kitTake(victim, resolverFor(table));
        assert.equal(got.id, 'crowbar');
        assert.deepEqual(victim.loadout, ['rock', 'bandage'], 'the stolen item must be gone');
    });

    test('ties break by authored order, so it is deterministic', () => {
        const t = { a: { id: 'a', baseValue: 10 }, b: { id: 'b', baseValue: 10 } };
        assert.equal(kitTake({ loadout: ['a', 'b'] }, resolverFor(t)).id, 'a');
        assert.equal(kitTake({ loadout: ['b', 'a'] }, resolverFor(t)).id, 'b');
    });

    test('skips entries that resolve to nothing rather than stealing a ghost', () => {
        const victim = { loadout: ['ghost', 'rock'] };
        const got = kitTake(victim, resolverFor(table));
        assert.equal(got.id, 'rock');
        assert.deepEqual(victim.loadout, ['ghost']);
    });

    test('an all-unresolvable loadout returns null and removes nothing', () => {
        const victim = { loadout: ['ghost', 'phantom'] };
        assert.equal(kitTake(victim, resolverFor(table)), null);
        assert.deepEqual(victim.loadout, ['ghost', 'phantom']);
    });

    test('an empty or missing loadout returns null', () => {
        assert.equal(kitTake({ loadout: [] }, resolverFor(table)), null);
        assert.equal(kitTake({}, resolverFor(table)), null);
    });

    test('the resolver may return a WEAPON — kit is not ITEMS-only', () => {
        // resolveLoadout resolves through the registry, so a weapon can legally
        // sit in a loadout. kitTake must not care which table it came from.
        const t = { crowbar: { id: 'crowbar', baseValue: 40, damage: 12, category: 'weapon' } };
        assert.equal(kitTake({ loadout: ['crowbar'] }, resolverFor(t)).id, 'crowbar');
    });
});

describe('gear', () => {
    const cone = { id: 'cone', armor: 4 };
    const crowbar = { id: 'crowbar', damage: 12 };

    test('removes the piece AND its stats', () => {
        const victim = { equipped: ['cone'], entity: { armor: 6 }, damage: 20 };
        const got = gearTake(victim, resolverFor({ cone }));
        assert.equal(got.id, 'cone');
        assert.equal(victim.entity.armor, 2);
        assert.deepEqual(victim.equipped, []);
    });

    test('a stolen weapon takes its damage with it', () => {
        const victim = { equipped: ['crowbar'], entity: { armor: 0 }, damage: 20 };
        gearTake(victim, resolverFor({ crowbar }));
        assert.equal(victim.damage, 8);
    });

    test('picks the HEAVIEST piece, not the first', () => {
        const victim = { equipped: ['cone', 'crowbar'], entity: { armor: 10 }, damage: 20 };
        const got = gearTake(victim, resolverFor({ cone, crowbar }));
        assert.equal(got.id, 'crowbar', `crowbar ${gearWeight(crowbar)} > cone ${gearWeight(cone)}`);
    });

    test('never drives armor below the Law 3 floor', () => {
        const victim = { equipped: ['cone'], entity: { armor: -88 }, damage: 5 };
        gearTake(victim, resolverFor({ cone }));
        assert.equal(victim.entity.armor, -90);
    });

    test('never drives armor above the Law 3 ceiling', () => {
        // A negative-armor piece would otherwise push them out the top.
        const victim = { equipped: ['curse'], entity: { armor: 9 }, damage: 5 };
        gearTake(victim, resolverFor({ curse: { id: 'curse', armor: -20 } }));
        assert.equal(victim.entity.armor, 10);
    });

    test('never drives damage negative', () => {
        const victim = { equipped: ['crowbar'], entity: { armor: 0 }, damage: 3 };
        gearTake(victim, resolverFor({ crowbar }));
        assert.equal(victim.damage, 0);
    });

    test('an empty or missing equipped list returns null', () => {
        assert.equal(gearTake({ equipped: [] }, resolverFor({})), null);
        assert.equal(gearTake({}, resolverFor({})), null);
    });

    test('a victim with no entity does not crash', () => {
        const victim = { equipped: ['cone'], damage: 5 };
        assert.doesNotThrow(() => gearTake(victim, resolverFor({ cone })));
        assert.deepEqual(victim.equipped, []);
    });
});
