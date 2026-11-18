// pc10-describe-item.test.js — every item's text gives its numbers, what it does and where it
// comes from (plans/pc10-describe-item.md, ruling PCR3). Each generated line is pinned to the
// code's own fields, and the numbers it quotes are tied to the places the game reads them.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEMS, itemTier } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import { RINGS } from '../game/ring-data.js';
import { describeItem, describeItemParts, itemStatSentences, itemSourceLines, USES_ACTION } from '../game/inspector.js';
import { itemParts, itemParagraphs } from '../game/examine.js';

const NO_SOURCES = {};
const src = (f) => readFileSync(new URL(`../game/${f}`, import.meta.url), 'utf8');
const ALL = { ...ITEMS, ...WEAPONS };

describe('the flavour is gone; a fact is empty or one he stated', () => {
    test('no item, weapon or ring carries a description; each carries a fact string', () => {
        for (const [id, d] of [...Object.entries(ALL), ...Object.entries(RINGS)]) {
            assert.equal('description' in d, false, `${id} still has a description`);
            assert.equal(typeof d.fact, 'string', `${id} has no fact`);
            assert.ok(!/[\[\]]/.test(d.fact), `${id}: brackets in the fact`);
        }
    });

    test('the only fact kept is his Sludge Sack line', () => {
        const kept = Object.entries({ ...ALL, ...RINGS }).filter(([, d]) => d.fact).map(([id, d]) => [id, d.fact]);
        assert.deepEqual(kept, [['sludge_sack', 'Burlap sack, leather tie, filled with sludge.']]);
    });

    test('no [TEXT] or bracket in any generated line, and the Uses button names its action', () => {
        for (const [id, d] of Object.entries(ALL)) assert.ok(!/[\[\]]/.test(describeItem(d)), id);
        assert.equal(USES_ACTION.label, 'Use on');
    });
});

describe('describeItem: stats, then the fact, then the sources', () => {
    test('the Sludge Sack reads in that order', () => {
        assert.equal(describeItem(ITEMS.sludge_sack),
            'Throw: sludge, 3 damage per turn for 5 turns, range 5. It bursts over 3x3 tiles; the tiles around the centre get 2 turns. '
            + 'Sewer creatures are healed instead of hurt. Used up when used. Rare, value 10 GP.\n'
            + 'Burlap sack, leather tie, filled with sludge.\n'
            + `${itemSourceLines(ITEMS.sludge_sack).join('\n')}`);
        const parts = describeItemParts(ITEMS.sludge_sack);
        assert.equal(parts.fact, 'Burlap sack, leather tie, filled with sludge.');
        assert.match(parts.sources[0], /^Dropped by: .*Violet Fungus/);
        assert.deepEqual(parts.sources.map(l => l.split(':')[0]), ['Dropped by', 'Sold by']);
    });

    test('the Tunnel Mushroom: poison, 5 per turn for 2 turns, range 4, found in the Sewer, dropped by Red Fungus', () => {
        const p = describeItemParts(ITEMS.tunnel_mushroom, { sources: { tunnel_mushroom: { droppedBy: ['Red Fungus'], foundIn: ['Sewer'] } } });
        assert.equal(p.stats, 'Throw: poison, 5 damage per turn for 2 turns, range 4. It bursts over 3x3 tiles; the tiles around the centre get 1 turn. '
            + 'Sewer creatures are healed instead of hurt. Used up when used. Uncommon, value 9 GP.');
        assert.equal(p.fact, '');
        assert.deepEqual(p.sources, ['Dropped by: Red Fungus.', 'Found in: Sewer.']);
        assert.ok(describeItem(ITEMS.tunnel_mushroom).split('\n').some(l => /^Dropped by: .*Red Fungus/.test(l)));
    });

    test('every source is listed, in the order Dropped by, Sold by, Found in', () => {
        const lines = itemSourceLines({ id: 'x' }, { x: { foundIn: ['Z'], soldBy: ['Y'], droppedBy: ['A', 'B', 'C', 'D', 'E', 'F'] } });
        assert.deepEqual(lines, ['Dropped by: A, B, C, D, E, F.', 'Sold by: Y.', 'Found in: Z.']);
        assert.deepEqual(itemSourceLines({ id: 'none' }, {}), []);
    });

    test('exact stat lines, item by item (no sources)', () => {
        const stats = (d, o = {}) => describeItemParts(d, { sources: NO_SOURCES, ...o }).stats;
        assert.equal(stats(ITEMS.rock), 'Throw: 2 damage to everything in a 3x3 burst (half of 3), range 4. Idle or wandering enemies in earshot go to where it lands. Used up when used. Common, value 3 GP.');
        assert.equal(stats(ITEMS.fire_blood), 'Throw: fire, 5 damage per turn for 5 turns, range 5. It bursts over 3x3 tiles; the tiles around the centre get 2 turns. '
            + 'Whoever it burns also gets fire blood for as long; while both last, their hits set the target burning. Can be drunk. Enemies throw it at you. Used up when used. Rare, value 17 GP.');
        assert.equal(stats(ITEMS.sludge_brain), 'Throw: leaves a sludge puddle on up to 3 tiles for 8 turns, range 5. Ending a turn in it applies Sludge; sewer creatures are healed instead. Enemies throw it at you. Used up when used. Rare, value 12 GP.');
        assert.equal(stats(ITEMS.goo), 'Throw: leaves a goo puddle on up to 3 tiles for 8 turns, range 5. Ending a turn in it gives the Goo status. Enemies throw it at you. Used up when used. Common, value 0 GP.');
        assert.equal(stats(ITEMS.mystery_meat), 'Throw: poison 2 damage to everything in a 3x3 burst (half of 3), range 3. Sewer creatures are healed instead of hurt. Used up when used. Common, value 3 GP.');
        assert.equal(stats(ITEMS.soap), 'Use: cures sludge and poison. Also worn on your back for 3 turns: +2 armour. Used up when used. Rare, value 15 GP.');
        assert.equal(stats(ITEMS.bandage), 'Use: heals 25 HP. Also worn on your front for 2 turns: +1 armour. Used up when used. Epic, value 25 GP.');
        assert.equal(stats(ITEMS.boardwalk_burger), 'Eat: heals 15 HP. Used up when used. Rare, value 15 GP.');
        assert.equal(stats(ITEMS.mola_cola), 'Eat: heals 10 HP. Vendors will not buy it until the delivery is done. Used up when used. Rare, value 10 GP.');
        assert.equal(stats(ITEMS.foil_hat), 'Armour: +2, worn on top. Rare, value 10 GP.');
        assert.equal(stats(ITEMS.shoe_bags), 'Armour: +2, worn on bottom. Perk: sludge-proof. Rare, value 10 GP.');
        assert.equal(stats(ITEMS.lava_cape), 'Armour: +2, worn on back. Perk: +6 melee. Rare, value 10 GP.');
        assert.equal(stats(ITEMS.rat_mask), 'Armour: +2, worn on top. Perk: walks through grates. While worn you look like a rat. Rare, value 10 GP.');
        assert.equal(stats(ITEMS.health_poition), 'Drink: +25 HP. Used up when used. Epic, value 25 GP.');
        assert.equal(stats(ITEMS.strength_poition), 'Drink: +6 strength, 5 turns. Used up when used. Rare, value 20 GP.');
        assert.equal(stats(ITEMS.speed_poition), 'Drink: 2 free actions. Used up when used. Epic, value 40 GP.');
        assert.equal(stats(ITEMS.boon_poition), 'Drink: permanent, your choice of +10 Max MP, +1 Armour or +1 Strength. At most 12 boons per game. Thrown at an enemy: lowers its max MP by 10. Used up when used. Common, value 0 GP.');
        assert.equal(stats(ITEMS.alcohol), 'Car fuel: slows the car. Rare, value 14 GP.');
        assert.equal(stats(ITEMS.burger_fries), 'Quest item: always kept, cannot be dropped. Legendary, value 0 GP.');
        assert.equal(stats(ITEMS.test_costume), 'Costume: Use puts it on, Use again takes it off. Rare, value 10 GP.');
        assert.equal(stats(ITEMS.pipe), 'Weapon: 12 damage. Use: wedges the door you came through shut, and the pipe stays in it. Uncommon, value 8 GP.');
    });

    test('a weapon: damage against the held weapon, hands, class, reach, pull, onHit, grants', () => {
        const held = WEAPONS.wooden_sword;
        assert.equal(describeItemParts(WEAPONS.fearmur, { sources: NO_SOURCES, held, hands: 1, weaponClass: 'hammer', grants: ['Boo! (8 MP)'] }).stats,
            'Weapon: 16 damage (+6 vs Wooden Sword). 1 hand, hammer. Hitting the same enemy twice in a row frightens it for 3 turns. Grants while worn: Boo! (8 MP). Epic, value 28 GP.');
        assert.equal(describeItemParts(WEAPONS.lion_whip, { sources: NO_SOURCES }).stats,
            'Weapon: 16 damage. Reach 3 tiles. A hit enemy is pulled 1 tile closer. Epic, value 26 GP.');
        assert.equal(describeItemParts(WEAPONS.ray_gun, { sources: NO_SOURCES, held: WEAPONS.ray_gun }).stats,
            'Weapon: energy 22 damage (same as Ray Gun). Epic, value 45 GP.');
        assert.equal(itemParts(WEAPONS.fearmur, WEAPONS.wooden_sword).stats,
            'Weapon: 16 damage (+6 vs Wooden Sword). 1 hand, hammer. Hitting the same enemy twice in a row frightens it for 3 turns. Grants while worn: Boo! (8 MP). Epic, value 28 GP.');
        assert.deepEqual(itemParagraphs(WEAPONS.fearmur, null).slice(1), itemSourceLines(WEAPONS.fearmur));
    });

    test('a tiered copy counts its empty perk slots and prints no bracket', () => {
        const def = { id: 'x_blue', name: 'Blue X', damage: 10, equipSlot: 'weapon', useType: 'equip', tier: 'blue', baseValue: 6, perks: ['[PERK]', '[PERK]'] };
        assert.equal(itemStatSentences(def).join(' '), 'Weapon: 10 damage. 2 perk slots not yet filled. Rare, value 6 GP.');
        assert.equal(itemStatSentences({ ...def, perks: ['Sharp'] }).join(' '), 'Weapon: 10 damage. Perks: Sharp. Rare, value 6 GP.');
    });

    test('every item and weapon gets a stat line that ends with its tier and value', () => {
        for (const [id, d] of Object.entries(ALL)) {
            const s = describeItemParts(d, { sources: NO_SOURCES }).stats;
            assert.ok(s.endsWith(`${itemTier(d).name}, value ${d.baseValue ?? 0} GP.`), `${id}: ${s}`);
        }
    });
});

describe('the numbers the lines quote are the numbers the code uses', () => {
    test('a thrown poition says its own amount, turns and range, and half the turns at the edge', () => {
        for (const id of ['sludge_sack', 'fire_blood', 'tunnel_mushroom']) {
            const d = ITEMS[id];
            const s = describeItemParts(d, { sources: NO_SOURCES }).stats;
            assert.ok(s.includes(`${-d.poition.amount} damage per turn for ${d.poition.turns} turns, range ${d.range}.`), id);
            assert.ok(s.includes(`get ${Math.max(1, Math.floor(d.poition.turns / 2))} turn`), id);
        }
        assert.match(src('items.js'), /Math\.max\(1, Math\.floor\(itemDef\.poition\.turns \/ 2\)\)/);
    });

    test('a thrown flat-damage item says the half it deals', () => {
        assert.match(src('items.js'), /const mag = Math\.max\(1, Math\.round\(itemDef\.damage \/ 2\)\)/);
        assert.match(src('items.js'), /const range = itemDef\.range \|\| 5;/);
    });

    test('the Fearmur frightens for the turns main.js applies', () => {
        assert.match(src('main.js'), /if \(repeat\) \{ this\._applyFear\(enemy, 3\);/);
    });

    test('the boon line reads BOON_KINDS and BOON_CAP', async () => {
        const { BOON_KINDS, BOON_CAP } = await import('../game/items.js');
        const s = describeItemParts(ITEMS.boon_poition, { sources: NO_SOURCES }).stats;
        for (const k of Object.values(BOON_KINDS)) assert.ok(s.includes(`+${k.amount} ${k.label}`));
        assert.ok(s.includes(`At most ${BOON_CAP} boons`));
    });
});

describe('every panel shows stats, then the fact, then the sources', () => {
    test('ground examine builds the panel body from the same paragraphs', () => {
        const paras = itemParagraphs(ITEMS.sludge_sack, null);
        assert.equal(paras[0], describeItemParts(ITEMS.sludge_sack).stats);
        assert.equal(paras[1], 'Burlap sack, leather tie, filled with sludge.');
        assert.match(paras[2], /^Dropped by: /);
    });

    test('the renderer reads itemParagraphs in the bag panel and the trade strip, and no description', () => {
        const r = src('renderer.js');
        assert.ok(r.split('itemParagraphs(').length - 1 >= 2);
        assert.ok(!/def\.description/.test(r));
        assert.ok(!/def\.description/.test(src('examine.js')));
    });
});
