// act1-end-direction.test.js — AE2: after Act 1, the objective points at the
// three Act 2 zones (plans/ae2-act2-zones-objective.md).
//
// Act 1 ends with the burger delivery. After it, no quest is active, so the
// between-quests table (NO1) gives the HUD "Explore the Carnival, Factory and
// Graveyard" and the Map rings all three Act 2 zones. Any active quest takes
// over again.
//
// The delivery is played the way a player plays it: the real keydown listener
// _bindInput registers (lifted out of main.js, which touches `document` at
// import, as in quest-target-zones.test.js) drives the real dialogue methods,
// then M opens the Map. The HUD is read from what the real _drawQuestLog draws,
// the Map from the real _drawWorldMapBody.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap } from '../game/map.js';
import { QuestEngine, QUESTS, BETWEEN_QUESTS } from '../game/quests.js';
import { Renderer } from '../game/renderer.js';
import { getDialogue } from '../game/dialogue.js';
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

const OBJECTIVE = BETWEEN_QUESTS.find(r => r.id === 'to_act2').objective;
const ACT2 = ['CARNIVAL', 'FACTORY', 'GRAVEYARD'];

// Downtown, past the bridge by the ramp, standing by the Stranded Traveler with
// the burger in the bag and the delivery on its hand-off stage.
function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const audio = { playSfx() {}, playMusic() {} };
    const map = new GameMap(readMap('downtown-map.json'), 'downtown-map.json');
    const recipient = { ...readMap('downtown-map.json').enemies.find(e => e.id === 'dt-recipient') };
    const g = {
        state: STATE.IDLE, facing: 'up', playerX: recipient.x, playerY: recipient.y + 1,
        inventory: [{ itemDef: { id: 'burger_fries', name: 'Burger + Fries' }, count: 1 }],
        enemies: [recipient], containers: [], examinables: [], gold: 0,
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _paused: false, _deviceTab: 'items', _deviceSel: null, _journalScroll: 0,
        renderer: {}, logs: [], map, recipient,
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

// Talk to the traveler, hand over the burger, leave — every step a real key.
async function deliver(g) {
    g._openDialogue(g.recipient);
    assert.equal(g.state, STATE.DIALOGUE, 'talking to the traveler');
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

describe('after Act 1, the objective points at the three Act 2 zones', () => {
    test('handing over the burger (real keys) leaves the HUD on Act 2, and M shows all three zones ringed', async () => {
        const g = makeGame();
        assert.equal(hudObjective(g), QUESTS.deliver_burger.stages[1].objective.toUpperCase(), 'before: deliver the burger');

        await deliver(g);
        assert.equal(g.questEngine.state.activeId, null, 'no quest is active after Act 1');
        assert.equal(hudObjective(g), OBJECTIVE.toUpperCase());

        await g.press('KeyM');
        assert.equal(g.state, STATE.DEVICE, 'M pulls out the Remoticon');
        assert.equal(g._deviceTab, 'map');
        const boxes = drawMap(g);
        assert.equal(Object.keys(boxes).length, WORLD_ZONES.length, 'every zone box was drawn');
        assert.deepEqual(ringed(boxes), ACT2.slice().sort());
        for (const z of ACT2) assert.deepEqual(boxes[z].words, ['» GO'], `${z} says » GO`);
        assert.deepEqual(boxes.DOWNTOWN.words, ['YOU'], 'where you stand, the box says YOU');
    });

    test('the row survives a save and reload', async () => {
        const g = makeGame();
        await deliver(g);
        const reloaded = new QuestEngine({});
        reloaded.restore(JSON.parse(JSON.stringify(g.questEngine.serialize())));
        assert.equal(reloaded.getHudText(), OBJECTIVE);
        assert.deepEqual(reloaded.getTargetZones(), ACT2);
        assert.equal(reloaded.getTargetZone(), 'CARNIVAL', 'the single-zone lookup gives the first');
    });

    test('starting an Act 2 quest hands over to its own objective and zone', async () => {
        const g = makeGame();
        await deliver(g);
        QUESTS.act2_stand_in = {
            id: 'act2_stand_in', title: 'Stand-in',
            stages: [{ id: 's', objective: 'Win the Carnival prize', targetZone: 'CARNIVAL', on: { type: 'never' } }],
        };
        try {
            g.questEngine.start('act2_stand_in');
            assert.equal(hudObjective(g), 'WIN THE CARNIVAL PRIZE');
            assert.deepEqual(ringed(drawMap(g)), ['CARNIVAL']);
        } finally {
            delete QUESTS.act2_stand_in;
        }
    });

    test('before the delivery is done, the row stays quiet', () => {
        const qe = new QuestEngine({});
        qe.state.completed = ['fix_car', 'canyon_escape'];
        qe.state.flags = { carFixed: true, bridgeRoute: 'canyon' };
        assert.equal(qe.getHudText(), null);
        assert.deepEqual(qe.getTargetZones(), []);
    });
});
