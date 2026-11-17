// pc1b-car-bridge-plain-copy.test.js -- the car and the bridge say plainly what happened.
// _interactCar and _openBridgeIfCarFixed are lifted out of main.js (the liveMethod trick used
// across this suite) and run on a stub game, so each branch's exact line is pinned.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const townJson = JSON.parse(readFileSync(fileURLToPath(new URL('../game/town-map.json', import.meta.url)), 'utf8'));

function liveMethod(name, params, freeVars = {}) {
    const at = mainSrc.indexOf(`    ${name}(${params}) {`);
    assert.ok(at > 0, `${name} not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + 4 + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

const audio = { playSfx() {} };

function stub({ flags = {}, inventory = [], carFuel = 'raw' } = {}) {
    const g = {
        logs: [], inventory, carFuel, _sewerEscape: 'x', events: [], forced: [],
        questEngine: {
            state: { flags },
            getFlag(k) { return flags[k]; },
            forceComplete(id) { g.forced.push(id); flags.carFixed = true; },
        },
        examinables: [{ id: 'bridge', text: 'old' }],
        tiles: [],
        _log(t) { g.logs.push(t); },
        _render() {},
        _removeFromSlot(i) { g.inventory[i] = null; },
        emitGameEvent(n) { g.events.push(n); },
        setTile(x, y, t) { g.tiles.push([x, y, t]); },
        map: { zoneName: 'TOWN' },
    };
    g._interactCar = liveMethod('_interactCar', '', { audio });
    g._openBridgeIfCarFixed = liveMethod('_openBridgeIfCarFixed', '', { audio });
    return g;
}
const item = id => ({ itemDef: { id } });

describe('the car says plainly what happened', () => {
    test('no converter, and it was never sold', () => {
        const g = stub();
        g._interactCar();
        assert.deepEqual(g.logs, ['Your car needs the cataclysmic converter. Go to the sewer and kill the Were-Rat so that it drops the converter.']);
    });

    test('no converter, because it was left with Macc', () => {
        const g = stub({ flags: { shelved: { catalytic_converter: 500 } } });
        g._interactCar();
        assert.deepEqual(g.logs, ['Your car needs the cataclysmic converter. You left it with Macc. Buy it back from him.']);
    });

    test('the converter goes in and the car is fixed', () => {
        const g = stub({ inventory: [item('catalytic_converter')] });
        g._interactCar();
        assert.deepEqual(g.logs, ['You put the cataclysmic converter in your car. The car is fixed. Drive north over the bridge.']);
        assert.equal(g.inventory[0], null);
        assert.deepEqual(g.events, ['interact_car']);
    });

    test('fixed, no alcohol: says the engine is too hot and where to get alcohol', () => {
        const g = stub({ flags: { carFixed: true } });
        g._interactCar();
        assert.deepEqual(g.logs, ['Your car is fixed, but the engine runs too hot for the bridge. Buy a bottle of alcohol from Hooch and pour it into the tank.']);
        assert.equal(g.carFuel, 'raw');
    });

    test('fixed, with alcohol in the bag: the pour is spent and says so', () => {
        const g = stub({ flags: { carFixed: true }, inventory: [item('alcohol')] });
        g._interactCar();
        assert.deepEqual(g.logs, ['You pour a bottle of alcohol into the tank of your car. The engine now runs slower, so you can drive over the bridge.']);
        assert.equal(g.carFuel, 'alcohol');
        assert.equal(g.inventory[0], null);
    });

    test('fixed, alcohol already in the tank', () => {
        const g = stub({ flags: { carFixed: true }, carFuel: 'alcohol' });
        g._interactCar();
        assert.deepEqual(g.logs, ['Your car is fixed and has alcohol in the tank. Drive north over the bridge.']);
    });
});

describe('the bridge after the car is fixed', () => {
    test('says the car is fixed, and opens with the same words as the examinable', () => {
        const g = stub({ flags: { carFixed: true } });
        g._openBridgeIfCarFixed();
        const before = townJson.examinables.find(e => e.id === 'bridge').text;
        assert.equal(g.examinables[0].text, 'This is the bridge north out of Town. Your car is fixed. Drive north across the bridge.');
        assert.ok(before.startsWith('This is the bridge north out of Town.'));
        assert.ok(g.examinables[0].text.startsWith('This is the bridge north out of Town.'));
        assert.equal(g.tiles.length, 12, 'the barricade is cleared');
    });

    test('nothing changes while the car is broken', () => {
        const g = stub();
        g._openBridgeIfCarFixed();
        assert.equal(g.examinables[0].text, 'old');
    });
});

describe('no [TEXT] in the two methods', () => {
    for (const [name, params] of [['_interactCar', ''], ['_openBridgeIfCarFixed', '']]) {
        test(name, () => {
            const at = mainSrc.indexOf(`    ${name}(${params}) {`);
            const body = mainSrc.slice(at, mainSrc.indexOf('\n    }', at));
            assert.ok(!body.includes('[TEXT]'));
        });
    }
});
