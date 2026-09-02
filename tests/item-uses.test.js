// item-uses.test.js — the "use THIS on THAT" table and its resolver.
//
// The registry is pure and gets tested directly. The wiring into the hotbar
// overlay is lifted out of main.js with the liveMethod trick used across this
// suite — with the standing caveat that lifting a method body CANNOT see a
// missing import, because it hands free variables in by hand. The browser run
// is what proves `contextualUses` is actually imported into main.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ITEM_USES, contextualUses } from '../game/item-uses.js';
import { ITEMS } from '../game/items.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const freeNames = Object.keys(freeVars);
    const factory = new Function(...freeNames, `'use strict'; return function ${body}`);
    return factory(...freeNames.map(n => freeVars[n]));
}

// ── a world stub ────────────────────────────────────────────────────────────

const soap    = { id: 'soap', name: '[Soap]', useType: 'self', effect: 'cure_sludge', consumable: true };
const alcohol = { id: 'alcohol', name: '[Bottle of Alcohol]', useType: 'none', consumable: false };
const rock    = { id: 'rock', name: '[Rock]', useType: 'throw' };

function bloomAt(x, y, hp = 100, armor = 15) {
    return { x, y, type: 'Sludge Bloom', name: 'Sludge Bloom', puzzleWall: true,
             entity: { isAlive: () => true, hp, armor } };
}

// Targets keyed by tile, resolved the way main.js's _targetAt does.
function gameWith({ at = [5, 5], facing = 'up', tiles = {}, carFixed = false, carFuel = 'raw' } = {}) {
    return {
        playerX: at[0], playerY: at[1], facing,
        carFuel,
        questEngine: { getFlag: (f) => (f === 'carFixed' ? carFixed : false) },
        _targetAt: (x, y) => tiles[`${x},${y}`] || null,
    };
}

// ── the table itself ────────────────────────────────────────────────────────

test('every authored use names a real item id', () => {
    for (const row of ITEM_USES) {
        assert.ok(ITEMS[row.item], `ITEM_USES row "${row.id}" targets unknown item "${row.item}"`);
    }
});

test('every row is complete enough to fire', () => {
    for (const row of ITEM_USES) {
        assert.equal(typeof row.match, 'function', `${row.id}: match`);
        assert.equal(typeof row.apply, 'function', `${row.id}: apply`);
        assert.ok(row.label, `${row.id}: label`);
        assert.ok(row.id, 'every row needs an id — _pickOverlay re-resolves by it');
    }
});

// ── soap on sludge ──────────────────────────────────────────────────────────

test('soap offers itself against a wall of sludge you are facing', () => {
    const bloom = bloomAt(5, 4);
    const g = gameWith({ facing: 'up', tiles: { '5,4': { x: 5, y: 4, npc: bloom } } });
    const uses = contextualUses(soap, g);
    assert.equal(uses.length, 1);
    assert.equal(uses[0].id, 'soap-on-sludge');
    assert.match(uses[0].label, /Sludge Bloom/);
});

test('soap says nothing to an ordinary neighbour', () => {
    const puck = { x: 5, y: 4, type: 'Violencian', name: 'Puck', entity: { isAlive: () => true, hp: 30 } };
    const g = gameWith({ tiles: { '5,4': { x: 5, y: 4, npc: puck } } });
    assert.deepEqual(contextualUses(soap, g), []);
});

test('sludge is matched by nature, not by being a puzzleWall', () => {
    // A future sludge creature that is NOT a wall must still be scrubbable
    // without editing item-uses.js. This is the whole point of matching on type.
    const crawler = { x: 5, y: 4, type: 'Sludge Crawler', entity: { isAlive: () => true, hp: 12, armor: 0 } };
    const g = gameWith({ tiles: { '5,4': { x: 5, y: 4, npc: crawler } } });
    assert.equal(contextualUses(soap, g).length, 1);
});

test('scrubbing dissolves it whatever its numbers are, spends the bar, and costs the turn', () => {
    const bloom = bloomAt(5, 4, 250, 90);          // deliberately re-tuned
    const g = gameWith({ facing: 'up', tiles: { '5,4': { x: 5, y: 4, npc: bloom } } });
    const hits = [], removed = [];
    let advanced = 0;
    Object.assign(g, {
        combatAttack: (npc, dmg, opts) => hits.push({ npc, dmg, type: opts && opts.type }),
        _removeFromSlot: (s) => removed.push(s),
        _advanceWorld: () => { advanced++; },
        selectedSlot: 3,
    });

    const use = contextualUses(soap, g)[0];
    use.apply(g, use.target, { slot: 3 });

    assert.equal(hits.length, 1);
    assert.equal(hits[0].npc, bloom);
    assert.ok(hits[0].dmg > 250 + 90, `dealt ${hits[0].dmg} — must out-scale hp+armor`);
    assert.equal(hits[0].type, 'clean');
    assert.deepEqual(removed, [3]);
    assert.equal(advanced, 1);
    assert.equal(g.selectedSlot, -1);
});

// ── alcohol in the tank ─────────────────────────────────────────────────────

const carTile = { '5,4': { x: 5, y: 4, examinable: { id: 'car' } } };

test('the pour appears at the car only once the car is fixed', () => {
    assert.deepEqual(contextualUses(alcohol, gameWith({ tiles: carTile, carFixed: false })), [],
        'before the converter the tank is not the problem yet');
    assert.equal(contextualUses(alcohol, gameWith({ tiles: carTile, carFixed: true })).length, 1);
});

test('the pour stops offering itself once the tank is already full of it', () => {
    const g = gameWith({ tiles: carTile, carFixed: true, carFuel: 'alcohol' });
    assert.deepEqual(contextualUses(alcohol, g), []);
});

test('pouring delegates to the car, so bump and tap cannot drift apart', () => {
    const g = gameWith({ tiles: carTile, carFixed: true });
    let called = 0;
    g._interactCar = () => { called++; };
    g.selectedSlot = 2;
    const use = contextualUses(alcohol, g)[0];
    use.apply(g, use.target, { slot: 2 });
    assert.equal(called, 1, '_interactCar owns the pour — one spelling, shared with the bump');
    assert.equal(g.selectedSlot, -1);
});

// ── the resolver ────────────────────────────────────────────────────────────

test('what you FACE is offered before what merely stands beside you', () => {
    const faced  = bloomAt(5, 4);
    const beside = bloomAt(6, 5);
    const g = gameWith({ at: [5, 5], facing: 'up', tiles: {
        '5,4': { x: 5, y: 4, npc: faced },
        '6,5': { x: 6, y: 5, npc: beside },
    } });
    const uses = contextualUses(soap, g);
    assert.equal(uses.length, 2);
    assert.equal(uses[0].target.npc, faced, 'the deliberate look wins the top row');
});

test('the faced tile is not offered twice', () => {
    const bloom = bloomAt(5, 4);
    const g = gameWith({ at: [5, 5], facing: 'up', tiles: { '5,4': { x: 5, y: 4, npc: bloom } } });
    assert.equal(contextualUses(soap, g).length, 1);
});

test('an item with nothing authored is silent', () => {
    const g = gameWith({ tiles: { '5,4': { x: 5, y: 4, npc: bloomAt(5, 4) } } });
    assert.deepEqual(contextualUses(rock, g), []);
});

test('a row whose match() throws is skipped, not fatal', () => {
    // match() reads live world state and is authored content. A broken secret
    // must fail to offer itself rather than take the overlay down with it.
    const g = gameWith({ tiles: { '5,4': { x: 5, y: 4, npc: bloomAt(5, 4) } } });
    const boom = { id: 'boom', item: 'soap', match: () => { throw new Error('bad predicate'); },
                   label: 'x', apply: () => {} };
    ITEM_USES.push(boom);
    try {
        assert.equal(contextualUses(soap, g).length, 1, 'the good row still resolves');
    } finally {
        ITEM_USES.splice(ITEM_USES.indexOf(boom), 1);
    }
});

test('a game that cannot resolve targets yields nothing rather than throwing', () => {
    assert.deepEqual(contextualUses(soap, {}), []);
    assert.deepEqual(contextualUses(null, gameWith({})), []);
});

// ── the hotbar overlay ──────────────────────────────────────────────────────

function overlayFor(item, game) {
    const self = Object.assign({
        inventory: [{ itemDef: item }], selectedSlot: 0,
        overlayOptions: [], overlayCursor: 0,
        _adjacentHostiles: () => [],
        _log: () => {}, _render: () => {}, _ensureParticleLoop: () => {},
        state: null,
    }, game);
    const fn = liveMethod('_openItemOverlay', '', {
        contextualUses,
        audio: { playSfx: () => {} },
        STATE: { IDLE: 'idle', ITEM_SELECTED: 'item_selected', ITEM_OVERLAY: 'item_overlay' },
        performance: { now: () => 0 },
    });
    fn.call(self);
    return self.overlayOptions;
}

test('soap keeps its ordinary Use and gains the scrub when a bloom is there', () => {
    const g = gameWith({ facing: 'up', tiles: { '5,4': { x: 5, y: 4, npc: bloomAt(5, 4) } } });
    const opts = overlayFor(soap, g);
    assert.equal(opts[0].action, 'use', 'the plain reading of an item stays the default');
    assert.ok(opts.some(o => o.action === 'ctx'), 'and the scrub is offered under it');
});

test('soap alone in a field is just Use', () => {
    assert.deepEqual(overlayFor(soap, gameWith({})).map(o => o.action), ['use']);
});

test('alcohol at the car offers ONLY the pour — no dud Use above it', () => {
    // useType 'none' means the plain Use prints a shrug and still burns the turn
    // through _advanceWorld. Offering that as the default above a row that works
    // is a trap, so it is suppressed.
    const opts = overlayFor(alcohol, gameWith({ tiles: carTile, carFixed: true }));
    assert.deepEqual(opts.map(o => o.action), ['ctx']);
    assert.equal(opts[0].label, 'Pour it in the tank');
});

test('alcohol away from the car still offers Use, so the item is never unselectable', () => {
    assert.deepEqual(overlayFor(alcohol, gameWith({})).map(o => o.action), ['use']);
});

// ── shove, now that bumping opens the list instead ──────────────────────────

test('shoving displaces the target and spins it', () => {
    const stepped = [];
    const shove = liveMethod('_shoveNpc', 'enemy, dir', {
        audio: { playSfx: () => {} },
        stepEntity: (e, x, y) => { stepped.push([x, y]); e.x = x; e.y = y; },
    });
    const npc = { x: 6, y: 5, name: 'Puck', heavy: false };
    const self = {
        _isHeavy: (c) => c.heavy === true,
        _shoveDestination: () => ({ x: 6, y: 4 }),
        _bounceOff: () => {}, _log: () => {}, _MOVE_MS: 100,
    };
    assert.equal(shove.call(self, npc, { dx: 1, dy: 0 }), true);
    assert.deepEqual(stepped, [[6, 4]]);
    assert.equal(npc._spunTurns, 1);
});

test('a heavy character refuses the shove and is not moved', () => {
    let bounced = 0, stepped = 0;
    const shove = liveMethod('_shoveNpc', 'enemy, dir', {
        audio: { playSfx: () => {} },
        stepEntity: () => { stepped++; },
    });
    const self = {
        _isHeavy: (c) => c.heavy === true,
        _shoveDestination: () => ({ x: 6, y: 4 }),
        _bounceOff: () => { bounced++; }, _log: () => {}, _MOVE_MS: 100,
    };
    assert.equal(shove.call(self, { x: 6, y: 5, heavy: true }, { dx: 1, dy: 0 }), false);
    assert.equal(bounced, 1);
    assert.equal(stepped, 0);
});

test('a boxed-in character bounces rather than being shoved nowhere', () => {
    let bounced = 0;
    const shove = liveMethod('_shoveNpc', 'enemy, dir', {
        audio: { playSfx: () => {} }, stepEntity: () => {},
    });
    const self = {
        _isHeavy: () => false,
        _shoveDestination: () => null,          // nowhere to put them
        _bounceOff: () => { bounced++; }, _log: () => {}, _MOVE_MS: 100,
    };
    assert.equal(shove.call(self, { x: 6, y: 5 }, { dx: 1, dy: 0 }), false);
    assert.equal(bounced, 1);
});
