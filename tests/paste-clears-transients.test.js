// FX68: pasting a save code closes whatever menu, talk or fight panel was open.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeSaveCode, importSaveCode } from '../game/save.js';
import { createWheelState } from '../game/wheel-model.js';

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
const m = mainSrc.match(/\n    _clearTransients\(\) \{[\s\S]*?\r?\n    \}\r?\n/);
assert.ok(m, 'main.js has _clearTransients');
const clear = new Function('createWheelState', `return function ${m[0].trim().replace(/^_clearTransients/, 'clearTransients')};`)(createWheelState);

function store() {
    const s = new Map();
    globalThis.localStorage = {
        getItem: k => (s.has(k) ? s.get(k) : null), setItem: (k, v) => s.set(k, String(v)),
        removeItem: k => s.delete(k), clear: () => s.clear(),
    };
    globalThis.document = { createElement: () => ({ set textContent(v) {}, get innerHTML() { return ''; } }) };
}

function game() {
    return {
        map: null, rng: { getState: () => 1, setState() {} }, turn: 3, playerX: 1, playerY: 1,
        playerHp: 10, playerMaxHp: 10, playerMp: 5, playerMaxMp: 5, facing: 'down', gold: 0,
        equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], selectedSlot: -1, groundItems: [], containers: [], enemies: [],
        _tileDiffs: [], _pendingTransition: null, _sewerEscape: null, _lastAutosaveTurn: 0, state: 'idle',
        questEngine: null, _log() {}, _render() {}, _resolveItemDef: () => null,
        async _loadMap(u, x, y) {
            this.map = { url: u || 'town-map.json', width: 20, height: 15, isInBounds: () => true, isWalkable: () => true, zoneName: 'Town' };
            this.playerX = x ?? 1; this.playerY = y ?? 1;
        },
        setTile() {},
        wheel: createWheelState(),
        targetList: { x: 0, y: 0, target: null, verbs: [], sel: 0 },
        _clearTransients() { clear.call(this); },
        _stopAutoRepeat() {},
    };
}

function openEverything(g) {
    g.state = 'dialogue';
    g._dialogueNpc = { id: 'puck' }; g._dialogueReply = 'hi'; g._dialogueCursor = 2;
    g._offerNpc = { id: 'puck' }; g._offer = { give: [] }; g._offerCursor = 1;
    g.wheel.path = [0, 2]; g.wheel.aiming = true; g.wheel.reticle = { x: 3, y: 3 }; g.wheel.confirming = true;
    g._wheelOpenedByHold = true;
    g.targetList.target = { id: 'rat' };
    g.selectedSlot = 4; g.overlayOptions = [{ label: 'x' }];
    g.inspect = { title: 't' };
    g._heldDirKeys = ['KeyW'];
}

describe('FX68 paste clears transients', () => {
    test('a pasted code leaves no talk, offer, wheel, target pick or throw aim open', async () => {
        store();
        const origin = game();
        await importSaveCode(origin, encodeSaveCode(origin));
        const g = game();
        openEverything(g);
        const res = await importSaveCode(g, encodeSaveCode(origin));
        assert.equal(res.ok, true);
        assert.equal(g.state, 'idle');
        assert.equal(g._dialogueNpc, null);
        assert.equal(g._offer, null);
        assert.equal(g._offerNpc, null);
        assert.deepEqual(g.wheel.path, [0]);
        assert.equal(g.wheel.aiming, false);
        assert.equal(g.wheel.reticle, null);
        assert.equal(g.wheel.confirming, undefined);
        assert.equal(g._wheelOpenedByHold, false);
        assert.equal(g.targetList.target, null);
        assert.equal(g.selectedSlot, -1);
        assert.equal(g.inspect, null);
        assert.deepEqual(g._heldDirKeys, []);
    });

    test('a paste with nothing open leaves things as they were', async () => {
        store();
        const g = game();
        await importSaveCode(g, encodeSaveCode(g));
        assert.equal(g.state, 'idle');
        assert.deepEqual(g.wheel, createWheelState());
        assert.equal(g.selectedSlot, -1);
    });

    test('a refused code leaves the open menus alone', async () => {
        store();
        const g = game();
        openEverything(g);
        const res = await importSaveCode(g, 'not a code');
        assert.equal(res.ok, false);
        assert.equal(g.state, 'dialogue');
        assert.ok(g._dialogueNpc);
        assert.equal(g.wheel.aiming, true);
    });

    test('CONTINUE does not call it; the save code path does', () => {
        const cont = mainSrc.slice(mainSrc.indexOf('const continueGame = async'), mainSrc.indexOf('continueBtn.addEventListener'));
        assert.ok(cont.length > 100 && !cont.includes('_clearTransients'));
        assert.match(readFileSync(new URL('../game/save.js', import.meta.url), 'utf8'), /game\._clearTransients\?\.\(\)/);
    });
});
