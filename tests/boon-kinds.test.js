// boon-kinds.test.js (BP4) — one boon poition, and drinking it asks what it raises: max MP,
// armour or strength. The kind is read where its number is computed.
// main.js touches `document` at import, so the live methods are lifted from its source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEMS, BOON_KINDS, isBoon, resolveUse } from '../game/items.js';
import { serialize } from '../game/save.js';

const mainSrc = readFileSync('game/main.js', 'utf8');

function live(name, params, freeVars = {}) {
    const at = mainSrc.indexOf(`    ${name}(${params}) {`);
    assert.ok(at > 0, `${name} not found in main.js`);
    const end = mainSrc.indexOf('\n    }', at) + '\n    }'.length;
    const body = mainSrc.slice(at + 4 + name.length, end);
    return new Function(...Object.keys(freeVars), `'use strict'; return function ${body}`)(...Object.values(freeVars));
}

function stub(over = {}) {
    return { playerHp: 100, playerMaxHp: 100, playerMp: 100, playerMaxMp: 100, gold: 0, equipment: {}, tempEquips: [],
        buffs: [], boons: {}, enemies: [], playerX: 5, playerY: 5, map: { isWalkable: () => true },
        _entitiesInRadius: () => [], addBuff() {}, hasBuff: () => false, removeBuff() {}, ...over };
}
const drink = (g, kind) => { g._boonKind = kind; return resolveUse(g, ITEMS.boon_poition, null); };

test('there are three kinds and no max HP', () => {
    assert.deepEqual(Object.keys(BOON_KINDS), ['mana', 'defence', 'strength']);
    assert.ok(isBoon(ITEMS.boon_poition));
    assert.equal(isBoon(ITEMS.mana_poition), false);
});

test('each kind is written to the record; only MP moves a bar', () => {
    const g = stub();
    drink(g, 'defence'); drink(g, 'defence'); drink(g, 'strength'); drink(g, 'mana');
    assert.deepEqual(g.boons, { defence: 2, strength: 1, mana: 1 });
    assert.equal(g.playerMaxMp, 101);
    assert.equal(g.playerMaxHp, 100);
    assert.equal(g._boonKind, undefined, 'the pick is spent');
});

test('no kind asked is max MP, as before', () => {
    const g = stub();
    resolveUse(g, ITEMS.boon_poition, null);
    assert.deepEqual(g.boons, { mana: 1 });
});

test('armour is read where the armour number is computed', () => {
    const armor = live('_playerArmor', '', {});
    const g = stub({ ringMods: {}, _poitionMod: () => 0, _shieldArmor: () => 0 });
    assert.equal(armor.call(g), 0);
    drink(g, 'defence'); drink(g, 'defence');
    assert.equal(armor.call(g), 2);
    drink(g, 'strength');
    assert.equal(armor.call(g), 2, 'strength does not add armour');
});

test("strength is read in the attack's flats", () => {
    assert.match(mainSrc, /flats: this\._poitionMod\('strength'\)\s*\+ \(\(this\.boons && this\.boons\.strength\) \|\| 0\)/);
});

test('the chooser lists one plain row per kind and no [TEXT]', () => {
    const open = live('_openBoonChooser', '', { BOON_KINDS, performance: { now: () => 1 } });
    const g = { overlayOptions: [], overlayCursor: 3, _render() {} };
    open.call(g);
    assert.deepEqual(g.overlayOptions.map(o => o.kind), ['mana', 'defence', 'strength']);
    assert.ok(g.overlayOptions.every(o => o.action === 'boon' && !o.label.includes('[TEXT]')));
    assert.equal(g.overlayCursor, 0);
});

test('Use asks first; a picked row drinks; closing keeps the poition', () => {
    assert.match(mainSrc, /if \(item\.poition && item\.poition\.permanent && item\.useType === 'self'\) \{ this\._openBoonChooser\(\); return; \}/);
    assert.match(mainSrc, /case 'boon':\s*this\._boonKind = opt\.kind;[^\n]*\s*this\._doItemUse\(item\);/);
    assert.match(mainSrc, /if \(def\.poition && def\.poition\.permanent && def\.useType === 'self'\) \{ this\._deviceOpenBoon\?\.\(idx\)/);
    // Escape / tap outside on the item list returns to ITEM_SELECTED without resolving anything.
    assert.match(mainSrc, /case STATE\.ITEM_OVERLAY:\s+this\.state = STATE\.ITEM_SELECTED;/);
});

test('every kind survives save; a mana-only save is unchanged', () => {
    const base = { map: { url: 'town-map.json' }, turn: 1, playerX: 1, playerY: 1, playerHp: 1, playerMaxHp: 1,
        playerMp: 1, playerMaxMp: 1, facing: 'down', gold: 0, rng: { getState: () => 0 }, equipment: {}, tempEquips: [],
        buffs: [], inventory: [], selectedSlot: -1, groundItems: [], containers: [], enemies: [], _tileDiffs: [] };
    assert.deepEqual(serialize({ ...base, boons: { mana: 2 } }).player.boons, { mana: 2 });
    const all = { mana: 2, defence: 3, strength: 1 };
    assert.deepEqual(serialize({ ...base, boons: all }).player.boons, all);
});
