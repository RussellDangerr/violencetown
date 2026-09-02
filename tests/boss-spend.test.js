// boss-spend.test.js — Law 5, "bosses spend, not pool".
//
// The bible has carried this law since the gold standard shipped and it has
// never executed once; the systems audit calls it "the most interesting idea in
// the bible" and notes it has never run. The mechanic that makes it more than a
// larger healPurchase is that the WALLET DRAINS: a boss's purse is both its
// second health bar and its loot, so what you take off the corpse is exactly
// what it did not have to spend on you.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    bossSpend, BOSS_HEAL_FLOOR, BOSS_HEAL_MAX, BOSS_RALLY_MIN,
} from '../game/ai.js';
import { Enemy } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';

describe('saving itself', () => {
    test('a healthy boss buys nothing', () => {
        assert.equal(bossSpend(100, 100, 200, []), null);
    });

    test('nor does one above the buy floor with no ally to fund', () => {
        assert.equal(bossSpend(BOSS_HEAL_FLOOR + 1, 100, 200, []), null);
    });

    test('at the floor it buys HP at the peg — the spend IS the healing', () => {
        const s = bossSpend(BOSS_HEAL_FLOOR, 100, 200, []);
        assert.equal(s.kind, 'heal');
        assert.equal(s.spend, s.heal, 'Law 1: 1 GP buys 1 HP');
    });

    test('it never dumps the whole purse into one heal', () => {
        const s = bossSpend(10, 100, 5000, []);
        assert.equal(s.heal, BOSS_HEAL_MAX);
    });

    test('nor overheals — the heal is clamped to what is actually missing', () => {
        // Needs a smaller maxHp to exercise: with the Hundred, floor 60 and max
        // 40, the missing HP is always >= 40 at the buy floor, so the cap is what
        // binds and the missing-clamp never gets a turn. Pinned here so a future
        // change to either constant cannot quietly start overhealing.
        const s = bossSpend(50, 60, 5000, []);
        assert.equal(s.heal, 10);
    });

    test('at the buy floor the cap binds, not the missing-clamp', () => {
        assert.equal(100 - BOSS_HEAL_FLOOR, BOSS_HEAL_MAX,
            'floor and cap are tuned to meet exactly at the Hundred');
    });

    test('a broke boss is just a fighter', () => {
        assert.equal(bossSpend(10, 100, 0, []), null);
        assert.equal(bossSpend(10, 100, -5, []), null);
    });

    test('it can only spend what it actually holds', () => {
        const s = bossSpend(10, 100, 12, []);
        assert.equal(s.spend, 12);
    });
});

describe('funding the room — the rules-change move', () => {
    const ally = (hp) => ({ hp, maxHp: 100 });

    test('a healthy boss with a wounded ally pays for the ally', () => {
        const s = bossSpend(100, 100, 200, [ally(40)]);
        assert.equal(s.kind, 'rally');
        assert.equal(s.index, 0);
        assert.equal(s.spend, s.heal, 'priced at peg like everything else');
    });

    test('it picks the WORST-off ally, not the first', () => {
        const s = bossSpend(100, 100, 200, [ally(90), ally(30), ally(70)]);
        assert.equal(s.index, 1);
    });

    test('saving itself outranks funding others', () => {
        const s = bossSpend(20, 100, 200, [ally(10)]);
        assert.equal(s.kind, 'heal');
    });

    test('it keeps a reserve rather than emptying the purse on someone else', () => {
        assert.equal(bossSpend(100, 100, BOSS_RALLY_MIN, [ally(10)]), null,
            'at exactly the reserve there is nothing spare to give');
        const s = bossSpend(100, 100, BOSS_RALLY_MIN + 10, [ally(10)]);
        assert.equal(s.heal, 10);
    });

    test('healthy allies get nothing', () => {
        assert.equal(bossSpend(100, 100, 200, [ally(100), ally(100)]), null);
    });

    test('no allies at all is null-safe', () => {
        assert.equal(bossSpend(100, 100, 200, []), null);
        assert.equal(bossSpend(100, 100, 200, null), null);
        assert.equal(bossSpend(100, 100, 200, [null, undefined]), null);
    });
});

describe('the wallet is the second health bar', () => {
    // The property the whole law rests on: spending is finite and visible.
    test('a purse converts to HP at 1:1 and then it is gone', () => {
        let gold = 100, hp = 30;
        let spent = 0, healed = 0;
        for (let i = 0; i < 10; i++) {
            const s = bossSpend(hp, 100, gold, []);
            if (!s) break;
            gold -= s.spend; hp = Math.min(100, hp + s.heal);
            spent += s.spend; healed += s.heal;
        }
        assert.equal(spent, healed, 'peg held across the whole fight');
        assert.ok(gold < 100, 'and the purse actually drained');
        assert.equal(gold, 100 - spent, 'by exactly what was spent — nothing minted or burned twice');
    });

    test('what it could not spend is what you loot', () => {
        // A boss killed before it needs anything keeps its whole purse.
        assert.equal(bossSpend(100, 100, 150, []), null);
    });
});

describe('a real boss spends in a real turn', () => {
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
    const spawn = (g, over) => {
        const e = new Enemy({ type: 'Boss', x: 5, y: 2, sightRange: 8, facing: 'S', ...over });
        g.enemies.push(e);
        return e;
    };

    test('a hurt boss buys HP, and the purse actually drops', () => {
        const g = makeGame(5, 3);
        const b = spawn(g, { id: 'b1', boss: true, gold: 100, damage: 9 });
        b.entity.hp = 40;
        tickNpcState(g, b, 1);
        assert.ok(b.entity.hp > 40, 'it healed');
        assert.equal(b.gold, 100 - (b.entity.hp - 40), 'and paid exactly the peg for it');
        assert.equal(g.damageTaken, 0, 'the purchase IS the turn');
    });

    test('a NON-boss at the same HP falls through to the grunt policy', () => {
        const g = makeGame(5, 3);
        const e = spawn(g, { id: 'e1', boss: false, gold: 100, damage: 9 });
        e.entity.hp = 50;                         // above the grunt floor of 40
        tickNpcState(g, e, 1);
        assert.equal(e.gold, 100, 'a grunt does not buy at 50 HP; only a boss does');
    });

    test('a healthy boss in a fight funds its worst-off ally instead', () => {
        const g = makeGame(5, 3);                 // player in its cone, so it engages
        const b = spawn(g, { id: 'b1', boss: true, gold: 100, damage: 9 });
        const hurtAlly = spawn(g, { id: 'a1', x: 6, y: 2, damage: 9 });
        hurtAlly.entity.hp = 30;
        tickNpcState(g, b, 1);
        assert.ok(hurtAlly.entity.hp > 30, 'the ally was paid for');
        assert.ok(b.gold < 100, 'out of the boss purse');
    });

    test('an IDLE boss spends nothing — the purse is a combat resource', () => {
        // The spend block deliberately sits below the "is it engaged" guard, so a
        // boss standing around cannot quietly top its friends up forever.
        const g = makeGame(5, 0);                 // player behind it: blind, never engages
        const b = spawn(g, { id: 'b1', boss: true, gold: 100, damage: 9 });
        const hurtAlly = spawn(g, { id: 'a1', x: 6, y: 2, damage: 9 });
        hurtAlly.entity.hp = 30;
        for (let i = 1; i <= 5; i++) tickNpcState(g, b, i);
        assert.equal(b.state, 'idle');
        assert.equal(b.gold, 100, 'not a coin spent while unaware');
        assert.equal(hurtAlly.entity.hp, 30);
    });

    test('it will not fund an ally across the map', () => {
        const g = makeGame(5, 3);
        const b = spawn(g, { id: 'b1', boss: true, gold: 100, damage: 9 });
        const far = spawn(g, { id: 'a1', x: 5, y: 30, damage: 9 });
        far.entity.hp = 30;
        tickNpcState(g, b, 1);
        assert.equal(b.gold, 100);
        assert.equal(far.entity.hp, 30);
    });

    test('a broke boss just fights — the second health bar is spent', () => {
        const g = makeGame(5, 3);
        const b = spawn(g, { id: 'b1', boss: true, gold: 0, damage: 9 });
        b.entity.hp = 30;
        tickNpcState(g, b, 1);
        tickNpcState(g, b, 2);
        assert.ok(g.damageTaken > 0, 'with nothing left to spend it swings');
    });

    test('the boss flag round-trips through toSave', () => {
        const b = new Enemy({ id: 'b1', type: 'Boss', x: 1, y: 1, boss: true });
        assert.equal(b.toSave().boss, true);
        assert.equal(new Enemy(b.toSave()).boss, true);
    });
});
