// autoplay-loops.test.js — the everyday-loops run (plans/al1-autoplay-loops-run.md).
//
// The run itself needs Chrome (npm run autoplay:check). What node can check:
// the bag cursor's planner walks the bag the way its keys do, and every id the
// script names is real and where the script expects it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cursorPath } from '../game/autoplay/path.js';
import { SCRIPTS } from '../game/autoplay/run.js';
import { ITEMS } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import { itemActions } from '../game/inspector.js';
import { deviceBodyRect, deviceBagSlotRects, inspectorActionRects, nearestRectInDir } from '../game/layout.js';

const map = (f) => JSON.parse(readFileSync(new URL(`../game/${f}`, import.meta.url), 'utf8'));
const MOVE = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
// Press the planned keys through the bag's own rule, as _deviceKey does.
const press = (rects, from, dirs) => dirs.reduce((at, d) => nearestRectInDir(rects, at, ...MOVE[d]), from);

describe('cursorPath', () => {
    const row = [0, 1, 2, 3].map((i) => ({ x: i * 50, y: 0, w: 40, h: 40 }));

    test('already there is no presses', () => {
        assert.deepEqual(cursorPath(row, 2, 2, nearestRectInDir), []);
    });
    test('along a row it presses toward the target, once per rect', () => {
        assert.deepEqual(cursorPath(row, 0, 3, nearestRectInDir), ['right', 'right', 'right']);
        assert.deepEqual(cursorPath(row, 3, 1, nearestRectInDir), ['left', 'left']);
    });
    test('a rect no press ever lands on is unreachable', () => {
        const stuck = (_r, from) => from;   // a menu whose keys do nothing
        assert.equal(cursorPath(row, 0, 3, stuck), null);
    });
    test('it follows the rule it is given, not geometry it assumes', () => {
        // A menu whose Right jumps two at a time and Left steps one.
        const odd = (_r, from, dx) => (dx > 0 ? Math.min(3, from + 2) : dx < 0 ? Math.max(0, from - 1) : from);
        const dirs = cursorPath(row, 0, 3, odd);
        assert.equal(dirs.reduce((at, d) => odd(row, at, ...MOVE[d]), 0), 3);
        assert.ok(dirs.length <= 3);
    });
    test('every bag slot is reachable from the first, and the presses land on it', () => {
        const rects = deviceBagSlotRects(deviceBodyRect());
        for (let to = 0; to < rects.length; to++) {
            const dirs = cursorPath(rects, 0, to, nearestRectInDir);
            assert.ok(dirs, `slot ${to} is unreachable`);
            assert.equal(press(rects, 0, dirs), to, `the presses to slot ${to} landed elsewhere`);
        }
    });
    test('every inspector button is reachable from the first', () => {
        const rects = inspectorActionRects(deviceBodyRect());
        for (let to = 0; to < rects.length; to++) {
            assert.equal(press(rects, 0, cursorPath(rects, 0, to, nearestRectInDir)), to);
        }
    });
});

describe('the loops script', () => {
    const loops = SCRIPTS.loops;
    const steps = loops.steps;
    const all = (k) => steps.filter((s) => s[k]);

    test('it is a steps script with an expectation, and every step is a kind the driver knows', () => {
        assert.ok(Array.isArray(steps) && steps.length);
        assert.equal(typeof loops.expect, 'function');
        for (const s of steps) {
            assert.equal(typeof s.label, 'string');
            assert.equal(['goals', 'bag', 'meet', 'shop'].filter((k) => s[k]).length, 1, `step ${s.label} is not exactly one kind`);
        }
    });

    test('it does the loops the card names, in order: pick up, equip, drop, sell and buy', () => {
        const order = steps.map((s) => (s.goals && s.goals.some((g) => g.take) ? 'pick_up'
            : s.bag ? s.bag.action : s.shop ? 'shop' : null)).filter(Boolean);
        assert.deepEqual(order, ['pick_up', 'equip', 'drop', 'shop']);
        const shop = all('shop')[0].shop;
        assert.ok(shop.sell && shop.buy);
    });

    test('what it picks up lies on the floor of the map it names, and is a real item', () => {
        for (const s of all('goals')) {
            for (const g of s.goals.filter((x) => x.take)) {
                assert.ok(ITEMS[g.take] || WEAPONS[g.take], `no item ${g.take}`);
                assert.ok(map(g.map).items.some((i) => i.type === g.take), `no ${g.take} on the floor of ${g.map}`);
            }
        }
    });

    test('every map it walks to exists, and each is next door to the last', () => {
        let at = 'town-map.json';
        for (const s of all('goals')) {
            for (const g of s.goals.filter((x) => x.reach)) {
                assert.ok(map(at).transitions.some((t) => t.toMap === g.reach), `${at} has no way to ${g.reach}`);
                at = g.reach;
            }
        }
    });

    test('the item it equips through the bag is a weapon with an Equip button', () => {
        const equip = all('bag').find((s) => s.bag.action === 'equip').bag.item;
        const def = WEAPONS[equip] || ITEMS[equip];
        assert.equal(def.equipSlot, 'weapon');
        assert.ok(itemActions(def, 'pack').some((a) => a.id === 'equip'));
    });

    test('the item it drops has a Drop button', () => {
        const drop = all('bag').find((s) => s.bag.action === 'drop').bag.item;
        assert.ok(itemActions(ITEMS[drop] || WEAPONS[drop], 'pack').some((a) => a.id === 'drop'));
    });

    test('the enemy it hunts and the vendor it meets are in the factory, and the vendor stocks what it buys', () => {
        const factory = map('factory-map.json');
        const kill = all('goals').flatMap((s) => s.goals).find((g) => g.kill);
        assert.ok(factory.enemies.some((e) => e.id === kill.kill), `no ${kill.kill} in the factory`);
        const { npc, buy, sell } = all('shop')[0].shop;
        assert.equal(all('meet')[0].meet, npc);
        const vendor = factory.enemies.find((e) => e.id === npc);
        assert.ok(vendor && vendor.vendor, `${npc} is not a vendor`);
        assert.ok(vendor.stock.includes(buy), `${npc} does not stock ${buy}`);
        assert.ok(WEAPONS[sell] || ITEMS[sell], `no item ${sell}`);
    });

    test('its expectation fails a run that ends holding the wrong things', () => {
        const stack = (id) => ({ itemDef: { id }, count: 1 });
        const good = { equipment: { weapon: { id: 'lion_whip' } }, inventory: [stack('rock'), null] };
        const deals = [{ side: 'yours', item: 'wooden_sword', gold: 3 }, { side: 'theirs', item: 'rock', gold: -4 }];
        assert.equal(loops.expect(good, deals), null);
        assert.match(loops.expect({ ...good, equipment: { weapon: { id: 'wooden_sword' } } }, deals), /wielding wooden_sword/);
        assert.match(loops.expect({ ...good, inventory: [stack('rock'), stack('fire_blood')] }, deals), /fire_blood is still in the bag/);
        assert.match(loops.expect({ ...good, inventory: [] }, deals), /no rock/);
        assert.match(loops.expect(good, deals.slice(1)), /the sale paid nothing/);
    });
});

describe('autoplay:check', () => {
    const src = readFileSync(new URL('../tools/autoplay.mjs', import.meta.url), 'utf8');
    test('it plays quest, sneak and loops', () => {
        const checked = src.match(/const CHECKED = \[([^\n]*)\];/);
        assert.ok(checked, 'no CHECKED list');
        for (const s of ['quest', 'sneak', 'loops']) assert.match(checked[1], new RegExp(`script: '${s}'`));
    });
});
