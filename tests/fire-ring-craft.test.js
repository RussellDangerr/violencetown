// fire-ring-craft.test.js — Platero sets a Fire Ring from three Fire Blood
// (plans/fr1-platero-fire-ring.md). Played with the real keydown listener from
// main.js and the real dialogue, craft and ring methods, lifted out as in
// act1-end-direction.test.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDialogue } from '../game/dialogue.js';
import { transferGold } from '../game/trade.js';
import { applyDispositionDelta } from '../game/give-action.js';
import { ITEMS } from '../game/items.js';
import { RINGS, FUSIONS } from '../game/ring-data.js';
import { acquireRing, slotRing, slottedActives, resolveAdjacencies, aggregatePassives } from '../game/rings.js';
import { DEVICE_TABS, cycleDeviceTab } from '../game/layout.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const eol = mainSrc.indexOf('\n', at);
    const oneLine = mainSrc.slice(at, eol).trimEnd().endsWith('}');
    const closeAt = oneLine ? eol - 1 : mainSrc.indexOf('\n    }', at);
    const body = oneLine ? mainSrc.slice(at + name.length, eol).trimEnd()
                         : mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    try { return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
    } catch (e) { throw new Error(`${name}: ${e.message}`); }
}
const liveConst = (name) => {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*`).exec(mainSrc);
    const from = m.index + m[0].length;
    return new Function(`'use strict'; return ${mainSrc.slice(from, mainSrc.indexOf('\n};', from) + 2)}`)();
};
const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
const DIALOGUE_HOSTILE_AT = Number(/const DIALOGUE_HOSTILE_AT = (-?\d+);/.exec(mainSrc)[1]);

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

function makeGame({ fireBlood = [] } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const audio = { playSfx() {}, playMusic() {} };
    const platero = { id: 'dt-platero', name: 'Platero', dialogueId: 'platero', disposition: 10, x: 7, y: 10,
                      entity: { isAlive: () => true } };
    const g = {
        state: STATE.IDLE, facing: 'up', playerX: 7, playerY: 11,
        inventory: fireBlood.map(count => ({ itemDef: ITEMS.fire_blood, count })),
        enemies: [platero], containers: [], examinables: [], gold: 0, logs: [],
        ownedRings: new Set(), ringSlots: {}, ringTier: 1, discoveredFusions: new Set(),
        equipment: {}, ringMods: {},
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _paused: false, _deviceTab: 'items', _deviceSel: null, _journalScroll: 0,
        renderer: {}, platero,
        _log(m) { this.logs.push(m); },
        _render() {}, _resumeHeldWalk() {}, _stopAutoRepeat() {}, _onEntityHarmed() {}, _wheelOpenerUp() {},
        hasBuff() { return false; }, emitGameEvent() {},
        _refreshGrantedSkills() {
            const getRing = id => RINGS[id] || null;
            const adj = resolveAdjacencies(this.ringTier, this.ringSlots, getRing, FUSIONS);
            for (const f of adj.fusions) this.discoveredFusions.add(f.fusion.id);
            this.actives = [...slottedActives(this.ringSlots, getRing), ...adj.grantedActives];
            this.ringMods = aggregatePassives(this.ringSlots, getRing);
        },
    };
    const free = {
        STATE, DIRS, audio, document, window, DEVICE_TABS, cycleDeviceTab,
        getDialogue, transferGold, applyDispositionDelta, DIALOGUE_HOSTILE_AT,
        performance: { now: () => 0 }, setTimeout: () => 0,
        RINGS, acquireRing, slotRing,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_digitToSlot', 'code'], ['_openDevice', "tab = 'items'"],
        ['_closeDevice', ''], ['_deviceKey', 'code'], ['_deviceCycleTab', 'dir'], ['_openWorldMap', ''],
        ['_scrollJournal', 'delta'], ['_openDialogue', 'npc'], ['_closeDialogue', ''], ['_dialogueChoices', ''],
        ['_pickDialogueChoice', 'choice'], ['_removeFromSlot', 'slot'],
        ['_fashionRing', 'materialId, ringId, count = 1, price = 0'], ['_acquireRing', 'ringId'],
    ]) g[n] = liveMethod(n, p, free);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    return g;
}

async function pickRow(g, id) {
    g._openDialogue(g.platero);
    assert.equal(g.state, STATE.DIALOGUE);
    const row = g._dialogueChoices().findIndex(c => c.id === id);
    assert.ok(row >= 0, `Platero offers ${id}`);
    for (let i = 0; i < row; i++) await g.press('ArrowDown');
    await g.press('Space');
}
const fireBloodCount = (g) => g.inventory.reduce((n, s) => n + (s && s.itemDef.id === 'fire_blood' ? s.count : 0), 0);

describe('Platero sets a Fire Ring', () => {
    test('with three Fire Blood (across two stacks) he takes exactly three and gives the ring', async () => {
        const g = makeGame({ fireBlood: [2, 2] });
        await pickRow(g, 'fashion_fire');
        assert.ok(g.ownedRings.has('fire_ring'));
        assert.equal(fireBloodCount(g), 1, 'four in, three taken, one left');
        assert.ok(Object.values(g.ringSlots).includes('fire_ring'), 'the ring is worn at once');
        assert.equal(g.gold, 0);
    });

    test('with too little Fire Blood nothing is taken and the old line shows', async () => {
        const g = makeGame({ fireBlood: [2] });
        await pickRow(g, 'fashion_fire');
        assert.ok(!g.ownedRings.has('fire_ring'));
        assert.equal(fireBloodCount(g), 2);
        assert.ok(g.logs.some(l => l.includes('Bring me the material')), g.logs.join(' | '));
    });

    test('the Rat Ring choice still works as before', async () => {
        const g = makeGame();
        g.inventory.push({ itemDef: { id: 'wererat_fur' }, count: 1 });
        await pickRow(g, 'fashion_rat');
        assert.ok(g.ownedRings.has('rat_ring'));
        assert.equal(g.inventory.filter(Boolean).length, 0);
    });

    test('a price, when given, is paid in gold and refused when short', () => {
        const g = makeGame({ fireBlood: [3] });
        g.gold = 4;
        assert.equal(g._fashionRing('fire_blood', 'fire_ring', 3, 5), false);
        assert.equal(fireBloodCount(g), 3);
        g.gold = 9;
        assert.equal(g._fashionRing('fire_blood', 'fire_ring', 3, 5), true);
        assert.equal(g.gold, 4);
    });

    test('Fire Ring beside the Rat Ring shows the Ember Rat fusion; its fire bonus and ignite are in the data', async () => {
        const g = makeGame({ fireBlood: [3] });
        g._acquireRing('rat_ring');
        await pickRow(g, 'fashion_fire');
        g.ringSlots = { 'left:ring': 'rat_ring', 'left:middle': 'fire_ring' };
        g._refreshGrantedSkills();
        assert.ok(g.discoveredFusions.has('ember_rat'));
        assert.ok(g.actives.includes('ember_rat'));
        assert.equal(g.ringMods.fireDamage, 10);
        assert.equal(RINGS.fire_ring.trigger.effect, 'ignite');
    });
});
