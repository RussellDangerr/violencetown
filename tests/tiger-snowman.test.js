// tiger-snowman.test.js — Siberia, the tigress snowwoman, rules the frozen area
// and drops the Tiger's Blood Ice Cone (plans/ic5-siberia-frozen-boss.md).
//
// She is spawned from the frozen map the way the game spawns her, then beaten
// through the game's own death handler (main.js _handleEnemyDeath, run as
// written), with auto-loot and the once-only boss gate beside it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SLOTS, ENTRIES, resolveSpawn, defaultPicks, pickSlots, requiredDropFor, labelOf } from '../game/slots.js';
import { spawnEnemy, shownName } from '../game/enemies.js';
import { transferGold } from '../game/trade.js';
import { dropLoadout, bossDropOnce } from '../game/drops.js';
import { ITEMS } from '../game/items.js';
import { ENEMY_SPRITES } from '../game/sprites.js';
import { weaknessesOf } from '../game/elements.js';
import { GameMap } from '../game/map.js';

const GAME = new URL('../game/', import.meta.url);
const frozen = JSON.parse(readFileSync(new URL('frozen-map.json', GAME), 'utf8'));
const CONE = 'tigers_blood_ice_cone';
const SLOT = 'frozen.boss';
const spawn = frozen.enemies.find(e => e.slot === SLOT);
const siberia = (picks = defaultPicks()) => spawnEnemy(resolveSpawn(spawn, picks));

// ── main.js methods, run as written against a stand-in game ─────────────────
const mainSrc = readFileSync(new URL('main.js', GAME), 'utf8');
function liveMethod(signature, freeVars) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const audio = { playSfx() {} };
const handleEnemyDeath = liveMethod('    _handleEnemyDeath(', {
    audio, transferGold, dropLoadout,
    requiredDropFor, dropLineFor: (e, s, sl) => null, ITEMS, onSewerEnemyKilled() {},
});
const takeKillLoot = liveMethod('    _takeKillLoot(', { audio });
const bossFirstFall = liveMethod('    _bossFirstFall(', { ITEMS, bossDropOnce });

function standIn() {
    const g = {
        enemies: [], logs: [], groundItems: [], bag: [], gold: 0, events: [],
        _muggedIds: new Set(), _bossDropsGiven: new Set(), _mapUrl: 'frozen-map.json',
        map: { enemySpawns: frozen.enemies, isWalkable: () => true },
        questEngine: null,
        _log(m) { this.logs.push(m); },
        _spawnEventWord() {}, _recordDrop() {}, _saveMoment() {},
        emitGameEvent(type, p) { this.events.push({ type, ...p }); },
        _addToInventory(def) { this.bag.push(def); return true; },
        _bossFirstFall(e, r) { return bossFirstFall.call(this, e, r); },
        _takeKillLoot(d, e) { return takeKillLoot.call(this, d, e); },
    };
    g.kill = (e) => { e.entity.hp = 0; e.entity.alive = false; handleEnemyDeath.call(g, e); };
    return g;
}

describe('Siberia fills the frozen area\'s boss slot', () => {
    test('the slot is a boss slot on the frozen map, holding the cone', () => {
        const s = SLOTS[SLOT];
        assert.ok(s, 'no frozen.boss slot');
        assert.equal(s.kind, 'boss');
        assert.equal(s.map, 'frozen-map.json');
        assert.equal(s.requiredDrop, CONE);
        assert.deepEqual(s.pool.map(p => p.entry), ['siberia']);
        assert.ok(ITEMS[CONE], 'the cone is a real item');
    });

    test('one boss stands on the map: on open snow, off both doors and the arrival, alone on its tile', () => {
        const here = frozen.enemies.filter(e => e.slot === SLOT);
        assert.equal(here.length, 1);
        const m = new GameMap(frozen, 'frozen-map.json');
        assert.ok(m.isWalkable(spawn.x, spawn.y), 'stands on a blocked tile');
        assert.ok(!m.getTransition(spawn.x, spawn.y), 'stands in a doorway');
        assert.ok(Math.abs(spawn.x - m.spawn.x) + Math.abs(spawn.y - m.spawn.y) >= 5, 'stands on the arrival');
        assert.ok(!frozen.enemies.some(e => e !== spawn && e.x === spawn.x && e.y === spawn.y), 'shares a tile');
        const bosses = frozen.enemies.map(e => resolveSpawn(e, defaultPicks())).filter(e => e.boss);
        assert.equal(bosses.length, 1, 'the frozen area has exactly one boss');
    });

    test('every new game seats her; she is a boss in the slot, with a boss\'s numbers and a cold row', () => {
        for (const seed of [0, 7, 0xFFFFFFFF]) assert.equal(pickSlots(seed)[SLOT], 'siberia');
        const e = siberia();
        assert.equal(e.boss, true);
        assert.equal(e.slot, SLOT);
        assert.equal(e.type, 'Siberia');
        assert.deepEqual(e.weak, weaknessesOf('cold'));
        assert.equal(e.examine, '[TEXT]');
        const act2 = ENTRIES.bigfoot;
        for (const k of ['hp', 'armor', 'damage', 'gold']) assert.equal(ENTRIES.siberia[k], act2[k], `${k} stands in at the shared boss row`);
    });

    test('she has art, on a cell no other frozen creature uses', () => {
        assert.ok(ENEMY_SPRITES.Siberia, 'no sprite');
        const cell = (t) => `${ENEMY_SPRITES[t].sheet}:${ENEMY_SPRITES[t].col},${ENEMY_SPRITES[t].row}`;
        for (const t of ['Snowman', 'Yeti', 'Polar Bear']) assert.notEqual(cell('Siberia'), cell(t));
    });

    test('the slot holds the cone, not she: a save from before it (no `slot` on the body) still knows', () => {
        assert.equal(requiredDropFor(siberia(), frozen.enemies), CONE);
        assert.equal(requiredDropFor({ id: spawn.id }, frozen.enemies), CONE);
    });
});

describe('Siberia goes by one name', () => {
    test('the registry name reaches the shared name helper, her entity and the log', () => {
        const e = siberia();
        assert.equal(ENTRIES.siberia.name, 'Siberia');
        assert.equal(labelOf(e), 'Siberia');
        assert.equal(shownName(e), 'Siberia');
        assert.equal(e.shownName, 'Siberia');
        assert.equal(e.entity.name, '[Siberia]');
        const g = standIn();
        g.kill(e);
        assert.ok(g.logs.includes('[Defeated [Siberia]]'), g.logs.join(' | '));
    });
});

describe('beating her drops the cone, from her slot', () => {
    test('through the death handler the cone lands in the bag, once, with the pickup event', () => {
        const g = standIn();
        const e = siberia();
        g.kill(e);
        assert.equal(g.bag.filter(d => d.id === CONE).length, 1, 'exactly one cone');
        assert.deepEqual(g.groundItems, [], 'auto-loot leaves nothing on the floor');
        assert.ok(g.events.some(ev => ev.type === 'item_pickup' && ev.id === CONE), 'the quest hears item_pickup');
        assert.ok(g.logs.some(l => l.includes('dropped')), 'the generic drop line');
    });

    test('her own kit carries no cone: the drop is the slot\'s', () => {
        assert.ok(!siberia().loadout.includes(CONE));
        assert.ok(!ENTRIES.siberia.loadout.includes(CONE));
    });

    test('whoever fills the slot drops it: the same body under another entry still hands it over', () => {
        const slots = { [SLOT]: { ...SLOTS[SLOT], pool: [{ entry: 'bigfoot', weight: 1 }] } };
        const other = spawnEnemy(resolveSpawn(spawn, {}, slots));
        assert.equal(other.type, 'Boss');
        assert.equal(requiredDropFor(other, frozen.enemies, slots), CONE);
        assert.equal(requiredDropFor(other, frozen.enemies), CONE);
    });

    test('a boss of another slot does not drop it', () => {
        const factory = JSON.parse(readFileSync(new URL('factory-map.json', GAME), 'utf8'));
        const alien = spawnEnemy(resolveSpawn(factory.enemies.find(e => e.slot === 'factory.boss'), defaultPicks()));
        assert.notEqual(requiredDropFor(alien, factory.enemies), CONE);
        const mook = spawnEnemy(resolveSpawn(frozen.enemies.find(e => e.slot === 'frozen.mob'), defaultPicks()));
        assert.equal(requiredDropFor(mook, frozen.enemies), null);
        const g = standIn();
        g.kill(mook);
        assert.ok(!g.bag.some(d => d.id === CONE), 'a snowman drops no cone');
    });

    test('beating her again gives no second cone', () => {
        const g = standIn();
        g.kill(siberia());
        g.kill(siberia());
        assert.equal(g.bag.filter(d => d.id === CONE).length, 1);
    });
});
