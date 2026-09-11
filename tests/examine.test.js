// examine.test.js — Examine never dead-ends (plans/layered-examine.md).
//
// Both entry points — the E key (examine.js doExamine) and the Target List /
// tap (main.js _fireResolver 'examine') — resolve through one ladder, so they
// cannot drift apart again. First match wins: an authored instance, a
// creature, a container, an item on the ground, a prop, the tile itself.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveExamine, doExamine } from '../game/examine.js';
import { TILES } from '../game/data.js';
import { PROP_SPRITES } from '../game/sprites.js';

const game = (over = {}) => ({
    examinables: [], enemies: [], containers: [], groundItems: [],
    playerX: 5, playerY: 5, facing: 'down',
    map: { getTile: () => TILES.FLOOR.id, isInBounds: () => true, propSpawns: [] },
    ...over,
});
const creature = (type, x, y, allegiance) => ({ type, x, y, allegiance, entity: { name: `[${type}]`, isAlive: () => true } });
const tileGame = (tileId) => game({ map: { getTile: () => tileId, isInBounds: () => true, propSpawns: [] } });

describe('resolveExamine — the ladder', () => {
    test('an authored instance says its own text, and carries its id and grant', () => {
        const grate = { id: 'cape_grate', x: 2, y: 2, text: '[Something red in the grate.]', grants: 'red_cape' };
        const r = resolveExamine(game({ examinables: [grate] }), 2, 2);
        assert.equal(r.body, '[Something red in the grate.]');
        assert.equal(r.instanceId, 'cape_grate');
        assert.equal(r.grantsInstance, grate);
    });

    test('a creature is named, hostile or not — the strings the Target List already used', () => {
        assert.equal(resolveExamine(game({ enemies: [creature('Wererat', 3, 3, 'hostile')] }), 3, 3).body, '[Wererat. Looks like trouble.]');
        assert.equal(resolveExamine(game({ enemies: [creature('Puck', 3, 3, 'neutral')] }), 3, 3).body, '[Puck. Minding their own business.]');
    });

    test('a container says whether anything is in it', () => {
        const full = { type: 'chest', x: 1, y: 1, contents: [{ type: 'rock' }] };
        const empty = { type: 'chest', x: 1, y: 1, contents: [] };
        assert.equal(resolveExamine(game({ containers: [full] }), 1, 1).body, '[A chest. Something rattles inside.]');
        assert.equal(resolveExamine(game({ containers: [empty] }), 1, 1).body, '[A chest. Empty.]');
    });

    test('an item on the ground wears its value tier — weapons included', () => {
        const r = resolveExamine(game({ groundItems: [{ type: 'ray_gun', x: 4, y: 4 }] }), 4, 4);
        assert.equal(r.title, '[Ray Gun]');
        assert.ok(r.tierName, 'no tier on an item');
        assert.match(r.body, /^\[\[Ray Gun\] \(\w+\)\. Dented brass/);
    });

    test('a prop names itself instead of the ground under it', () => {
        const g = game({ map: { getTile: () => TILES.DEAD_GRASS.id, isInBounds: () => true, propSpawns: [{ type: 'gravestoneWideArch', x: 6, y: 6 }] } });
        assert.equal(resolveExamine(g, 6, 6).body, '[Gravestone.]');
    });

    test('every prop the game places has a name — no raw type leaks out', () => {
        for (const type of Object.keys(PROP_SPRITES)) {
            const g = game({ map: { getTile: () => TILES.FLOOR.id, isInBounds: () => true, propSpawns: [{ type, x: 0, y: 0 }] } });
            const { body } = resolveExamine(g, 0, 0);
            assert.ok(!body.includes(type) && body !== '[Floor.]', `${type} examines as ${body}`);
        }
    });

    test('bare ground reads as its tile', () => {
        assert.equal(resolveExamine(tileGame(TILES.SLUDGE.id), 0, 0).body, '[Sludge.]');
        assert.equal(resolveExamine(tileGame(TILES.FACTORY_FLOOR.id), 0, 0).body, '[Factory floor.]');
        assert.equal(resolveExamine(tileGame(TILES.GOO_VISUAL.id), 0, 0).body, '[Goo.]', 'the render-hint word is dropped');
        assert.equal(resolveExamine(tileGame(TILES.GREEN_TENT?.id), 0, 0).body, '[Green tent.]');
    });

    test('first match wins — instance over creature over item over tile', () => {
        const g = game({
            examinables: [{ id: 'sign', x: 1, y: 1, text: '[A sign.]' }],
            enemies: [creature('Wererat', 1, 1, 'hostile')],
            groundItems: [{ type: 'rock', x: 1, y: 1 }],
        });
        assert.equal(resolveExamine(g, 1, 1).instanceId, 'sign');
        g.examinables = [];
        assert.match(resolveExamine(g, 1, 1).body, /Wererat/);
        g.enemies = [];
        assert.match(resolveExamine(g, 1, 1).body, /Rock/);
    });

    test('off the map is the only place that still says nothing', () => {
        const g = game({ map: { getTile: () => 0, isInBounds: () => false, propSpawns: [] } });
        assert.equal(resolveExamine(g, -1, -1).body, '[Nothing here worth examining.]');
    });
});

describe('doExamine — the E key', () => {
    const recorder = (over = {}) => {
        const g = game(over);
        Object.assign(g, { logs: [], events: [], panels: [], grants: [] });
        g._log = (t) => g.logs.push(t);
        g.emitGameEvent = (type, p) => g.events.push([type, p]);
        g._openInspect = (d) => g.panels.push(d);
        g._grantFromExaminable = (inst) => { g.grants.push(inst.id); return true; };
        return g;
    };

    test('facing bare ground reads the ground — it no longer dead-ends', () => {
        const g = recorder();                       // faces down, onto (5,6): FLOOR
        doExamine(g);
        assert.deepEqual(g.logs, ['[Floor.]']);
        assert.equal(g.panels.length, 1);
        assert.deepEqual(g.events, [], 'only authored instances fire the quest event');
    });

    test('an adjacent instance still wins over the faced tile (the 2x2 car)', () => {
        const car = { id: 'car', x: 4, y: 5, text: '[The car sits dead.]' };
        const g = recorder({ examinables: [car] });
        doExamine(g);
        assert.deepEqual(g.logs, ['[The car sits dead.]']);
        assert.deepEqual(g.events, [['examine', { targetId: 'car' }]]);
    });

    test('a granting instance fires its quest event, then grants — in that order, as before', () => {
        const grate = { id: 'cape_grate', x: 5, y: 6, text: '[Red, in the grate.]', grants: 'red_cape' };
        const g = recorder({ examinables: [grate] });
        doExamine(g);
        assert.deepEqual(g.events, [['examine', { targetId: 'cape_grate' }]]);
        assert.deepEqual(g.grants, ['cape_grate']);
    });
});

describe('the Target List / tap examine — main.js _fireResolver', () => {
    // main.js boots on DOMContentLoaded and cannot be imported under node, so the
    // live method is lifted out of its source (the tests/hunting-state.test.js
    // pattern) and run against a recording stand-in for the Game.
    const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
    const at = mainSrc.indexOf('_fireResolver(verb, t) {');
    const body = mainSrc.slice(at + '_fireResolver'.length, mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const fire = new Function('STATE', 'resolveExamine', `'use strict'; return function ${body}`)({ IDLE: 'idle' }, resolveExamine);

    const view = (over = {}) => {
        const g = game(over);
        Object.assign(g, { logs: [], events: [], panels: [], grants: [] });
        g._log = (t) => g.logs.push(t);
        g.emitGameEvent = (type, p) => g.events.push([type, p]);
        g._openInspect = (d) => g.panels.push(d);
        g._grantFromExaminable = (inst) => g.grants.push(inst.id);
        return g;
    };
    const examine = (g, t) => fire.call(g, { resolver: 'examine' }, { npc: null, item: null, examinable: null, container: null, ...t });

    test('tapping bare ground names the ground instead of dead-ending', () => {
        const g = view();
        examine(g, { x: 2, y: 2 });
        assert.deepEqual(g.logs, ['[Floor.]']);
    });

    test('an item keeps its tier chip and shows its description in the panel', () => {
        const g = view({ groundItems: [{ type: 'ray_gun', x: 3, y: 3 }] });
        examine(g, { x: 3, y: 3, item: g.groundItems[0] });
        assert.ok(g.panels[0].tierName);
        assert.match(g.panels[0].body, /^Dented brass/);
    });

    test('a multi-tile instance resolves at its own tile, and fires its quest event', () => {
        const car = { id: 'car', x: 4, y: 5, text: '[The car sits dead.]' };
        const g = view({ examinables: [car] });
        examine(g, { x: 5, y: 5, examinable: car });            // tapped the car's other half
        assert.deepEqual(g.logs, ['[The car sits dead.]']);
        assert.deepEqual(g.events, [['examine', { targetId: 'car' }]]);
    });

    test('a granting instance grants from the Target List too — the E key always did', () => {
        const grate = { id: 'cape_grate', x: 1, y: 1, text: '[Red.]', grants: 'red_cape' };
        const g = view({ examinables: [grate] });
        examine(g, { x: 1, y: 1, examinable: grate });
        assert.deepEqual(g.grants, ['cape_grate']);
    });
});
