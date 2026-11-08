// financier-delivery.test.js — AE1: the burger is delivered to the Financier
// (plans/ae1-burger-to-financier.md, SP8 pick a).
//
// The delivery's last stage (`handoff`) goes to the Financier in the First Blood Bank, not the
// stranded traveler on the Downtown street. Handing the order over, by talking or by offering it
// from the bag, finishes Special Delivery and pays the 50 GP as before. The traveler no longer
// takes it. A save taken mid-delivery still completes.
//
// The hand-off is played the way a player plays it: the real keydown listener _bindInput
// registers (lifted out of main.js, which touches `document` at import) drives the real dialogue
// methods, with the Financier read out of the real bank-map.json.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap } from '../game/map.js';
import { QuestEngine, QUESTS, BETWEEN_QUESTS } from '../game/quests.js';
import { Renderer } from '../game/renderer.js';
import { getDialogue, DIALOGUES } from '../game/dialogue.js';
import { transferGold } from '../game/trade.js';
import { applyDispositionDelta } from '../game/give-action.js';
import { WORLD_ZONES } from '../game/world-map.js';
import { DEVICE_TABS, cycleDeviceTab, DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const readMap = (file) => JSON.parse(readFileSync(fileURLToPath(new URL(`../game/${file}`, import.meta.url)), 'utf8'));

function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    // A one-line method (`_openWorldMap() { ... }`) closes on its own line.
    const eol = mainSrc.indexOf('\n', at);
    const oneLine = mainSrc.slice(at, eol).trimEnd().endsWith('}');
    const closeAt = oneLine ? eol - 1 : mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = oneLine ? mainSrc.slice(at + name.length, eol).trimEnd()
                         : mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    const factory = new Function(...names, `'use strict'; return function ${body}`);
    return factory(...names.map(n => freeVars[n]));
}

function liveConst(name) {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*`).exec(mainSrc);
    assert.ok(m, `const ${name} not found in main.js`);
    const from = m.index + m[0].length;
    const end = mainSrc.indexOf('\n};', from);
    return new Function(`'use strict'; return ${mainSrc.slice(from, end + 2)}`)();
}

const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
const DIALOGUE_HOSTILE_AT = Number(/const DIALOGUE_HOSTILE_AT = (-?\d+);/.exec(mainSrc)[1]);

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code;
        this.key = code;
        this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

// In the First Blood Bank, past the bridge by the ramp, standing by the Financier with the
// order in the bag and the delivery on its hand-off stage.
function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const audio = { playSfx() {}, playMusic() {} };
    const map = new GameMap(readMap('bank-map.json'), 'bank-map.json');
    const recipient = { ...readMap('bank-map.json').enemies.find(e => e.id === 'bank-financier') };
    const g = {
        state: STATE.IDLE, facing: 'up', playerX: recipient.x, playerY: recipient.y + 1,
        inventory: [{ itemDef: { id: 'burger_fries', name: 'Burger + Fries' }, count: 1 },
                    { itemDef: { id: 'tigers_blood_ice_cone', name: 'Cone' }, count: 1 }],
        enemies: [recipient], containers: [], examinables: [], gold: 0,
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _paused: false, _deviceTab: 'items', _deviceSel: null, _journalScroll: 0,
        renderer: {}, logs: [], map, financier: recipient,
        _log(m) { this.logs.push(m); },
        _render() {}, _resumeHeldWalk() {}, _stopAutoRepeat() {}, _onEntityHarmed() {}, _wheelOpenerUp() {},
        hasBuff() { return false; },
        emitGameEvent(type, payload) { this.questEngine.emit(type, payload); },
    };
    const free = {
        STATE, DIRS, audio, document, window, DEVICE_TABS, cycleDeviceTab,
        getDialogue, transferGold, applyDispositionDelta, DIALOGUE_HOSTILE_AT,
        performance: { now: () => 0 }, setTimeout: () => 0,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_digitToSlot', 'code'], ['_openDevice', "tab = 'items'"], ['_closeDevice', ''],
        ['_deviceKey', 'code'], ['_deviceCycleTab', 'dir'], ['_openWorldMap', ''], ['_scrollJournal', 'delta'],
        ['_openDialogue', 'npc'], ['_closeDialogue', ''], ['_dialogueChoices', ''], ['_pickDialogueChoice', 'choice'],
        ['_removeFromSlot', 'slot'],
    ]) g[n] = liveMethod(n, p, free);
    g.questEngine = new QuestEngine(g);
    g.questEngine.forceComplete('fix_car');
    g.questEngine.state.flags.bridgeRoute = 'ramp';
    g.questEngine.start('deliver_burger');
    g.questEngine.state.stageIndex = QUESTS.deliver_burger.stages.findIndex(s => s.id === 'handoff');
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    return g;
}

// Talk to the Financier, hand over the order, leave — every step a real key.
async function deliver(g) {
    g._openDialogue(g.financier);
    assert.equal(g.state, STATE.DIALOGUE, 'talking to the Financier');
    assert.equal(g._dialogueChoices()[0].id, 'deliver', 'the hand-off is the first line on offer');
    await g.press('Space');
    assert.ok(g.questEngine.isComplete('deliver_burger'), `the delivery finished: ${g.logs.join(' | ')}`);
    await g.press('KeyE');
    assert.equal(g.state, STATE.IDLE, 'E leaves the conversation');
}

// The dock's objective line, as the real _drawQuestLog draws it (town face).
const VP = computeViewport({ cssW: 1920, cssH: 1080, dpr: 1, dock: DOCK });
function hudObjective(game) {
    const drawn = [];
    const ctx = new Proxy({ globalAlpha: 1 }, {
        get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, canvas: { width: VP.backingW, height: VP.backingH },
        viewport: VP, sprites: { uiPanel: null },
        font: { drawText: (c, text) => drawn.push(text) },
        _fightFace: false, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    r._drawQuestLog({
        map: game.map, _timeOfDay: () => '12:05', questEngine: game.questEngine,
        _logHistory: [], _logStripMessages: [],
    });
    return drawn.filter(t => t !== game.map.zoneName && t !== '12:05')[0] ?? null;
}

// Each zone box the real _drawWorldMapBody draws: its outline colour and the
// words inside it besides its label.
const RED = '#e8462f';
function drawMap(game) {
    const rects = [], words = [];
    const ctx = new Proxy({}, {
        get: (t, k) => {
            if (k === 'strokeRect') return (x, y, w, h) => rects.push({ x, y, w, h, stroke: t.strokeStyle });
            return k in t ? t[k] : () => {};
        },
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, font: { drawText: (c, text, x, y) => words.push({ text, x, y }) },
    });
    r._drawWorldMapBody(game, { x: 0, y: 0, w: 608, h: 608 }, 40);
    const inside = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    const boxes = {};
    for (const z of WORLD_ZONES) {
        const label = words.find(w => w.text === z.label);
        const b = label && rects.find(rc => inside(rc, label));
        if (b) boxes[z.zoneName] = { stroke: b.stroke, words: words.filter(w => w !== label && inside(b, w)).map(w => w.text) };
    }
    return boxes;
}
const ringed = (boxes) => Object.keys(boxes).filter(k => boxes[k].stroke === RED).sort();

function ringedZones(game) { return ringed(drawMap(game)); }

const HANDOFF = QUESTS.deliver_burger.stages.find(s => s.id === 'handoff');
const FINANCIER = 'bank-financier';
const ORDER = ['burger_fries', 'tigers_blood_ice_cone'];
const bag = (g) => g.inventory.filter(Boolean).map(s => s.itemDef.id);

describe('the order is delivered to the Financier', () => {
    test('the last stage names him, in the bank, and the Map rings Downtown', () => {
        assert.equal(HANDOFF.on.type, 'item_given');
        assert.equal(HANDOFF.on.match.npc, FINANCIER);
        const inBank = readMap('bank-map.json').enemies.find(e => e.id === FINANCIER);
        assert.ok(inBank, 'the bank holds the NPC the stage names');
        assert.equal(inBank.dialogueId, 'banker');
        assert.equal(HANDOFF.targetZone, 'DOWNTOWN', 'the bank is an interior off Downtown');
        for (const k of ['objective', 'location', 'description']) assert.equal(HANDOFF[k], '[TEXT]', `${k} is a placeholder`);
    });

    test('talking to him (real keys) hands it over, finishes the quest and pays 50 GP', async () => {
        const g = makeGame();
        assert.deepEqual(ringedZones(g), ['DOWNTOWN'], 'before: the Map rings Downtown');
        assert.equal(hudObjective(g), HANDOFF.objective.toUpperCase());

        await deliver(g);
        assert.ok(g.questEngine.isComplete('deliver_burger'), `the delivery finished: ${g.logs.join(' | ')}`);
        assert.equal(g.gold, 50, 'the 50 GP stays');
        assert.deepEqual(bag(g), [], 'the order left the bag');
    });

    test('he offers the hand-off only while everything owed is in the bag', () => {
        const g = makeGame();
        g.inventory = g.inventory.slice(0, 1);   // the cone is missing
        g._dialogueNpc = { ...g.financier };
        g._dialogueCursor = 0;
        assert.ok(!g._dialogueChoices().some(c => c.id === 'deliver'));
        assert.ok(g.questEngine.isActive('deliver_burger'));
    });

    test('offering it from the bag works for him, one item at a time', () => {
        const g = makeGame();
        const give = (item) => {
            const slot = g.inventory.findIndex(s => s && s.itemDef.id === item);
            g._removeFromSlot(slot);
            g.emitGameEvent('item_given', { npc: FINANCIER, item });
        };
        for (const item of ORDER) assert.equal(g.questEngine.expectsDelivery(item, FINANCIER), true, `${item} may go to him`);
        give(ORDER[0]);
        assert.ok(g.questEngine.isActive('deliver_burger'), 'one of two does not finish it');
        give(ORDER[1]);
        assert.ok(g.questEngine.isComplete('deliver_burger'));
        assert.equal(g.gold, 50);
    });
});

describe('the traveler no longer takes it', () => {
    test('he is not expecting it, and his dialogue has no hand-off line', async () => {
        const g = makeGame();
        for (const item of ORDER) assert.equal(g.questEngine.expectsDelivery(item, 'dt-recipient'), false);
        assert.ok(!DIALOGUES.mq2_recipient.choices.some(c => c.id === 'deliver'));
        g._dialogueNpc = { id: 'dt-recipient', name: 'Stranded Traveler', dialogueId: 'mq2_recipient', disposition: 0 };
        g._dialogueCursor = 0;
        assert.ok(!g._dialogueChoices().some(c => c.id === 'deliver'));
        assert.ok(g.questEngine.isActive('deliver_burger'), 'still owed');
        assert.deepEqual(bag(g), ORDER, 'nothing left the bag');
    });

    test('an item given to him counts for nothing', () => {
        const g = makeGame();
        g.emitGameEvent('item_given', { npc: 'dt-recipient', item: ORDER[0] });
        assert.deepEqual(g.questEngine.owedItems(), ORDER);
    });
});

describe('a save from before, mid-delivery, still completes', () => {
    test('a save on the hand-off stage with the cone already given completes at the Financier', async () => {
        const g = makeGame();
        // What a save made when the traveler took the order held: the stage index, and the
        // counters keyed by stage id and item, never by who received it.
        const saved = JSON.parse(JSON.stringify({
            ...g.questEngine.serialize(),
            counters: { 'handoff/tigers_blood_ice_cone': 1 },
        }));
        const h = makeGame();
        h.inventory = h.inventory.slice(0, 1);
        h.questEngine.restore(saved);
        assert.equal(h.questEngine.currentStageId(), 'handoff');
        assert.deepEqual(h.questEngine.owedItems(), ['burger_fries']);
        await deliver(h);
        assert.ok(h.questEngine.isComplete('deliver_burger'));
        assert.equal(h.gold, 50);
    });

    test('a save on the hand-off stage with the whole order in the bag completes too', async () => {
        const g = makeGame();
        const saved = JSON.parse(JSON.stringify(g.questEngine.serialize()));
        const h = makeGame();
        h.questEngine.restore(saved);
        await deliver(h);
        assert.ok(h.questEngine.isComplete('deliver_burger'));
    });
});
