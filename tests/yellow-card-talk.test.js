// yellow-card-talk.test.js — YC1: after the burger is delivered, the Financier brings up the
// Yellow Card, once (plans/yc1-financier-yellow-card.md, YCR1 pick a).
//
// Played the way a player plays it: the real keydown listener _bindInput registers (lifted out
// of main.js, which touches `document` at import) drives the real dialogue methods, with the
// Financier read out of the real bank-map.json. Label and reply stay placeholders.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap } from '../game/map.js';
import { QuestEngine, QUESTS } from '../game/quests.js';
import { getDialogue, DIALOGUES } from '../game/dialogue.js';
import { transferGold } from '../game/trade.js';
import { applyDispositionDelta } from '../game/give-action.js';
import { DEVICE_TABS, cycleDeviceTab } from '../game/layout.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const readMap = (file) => JSON.parse(readFileSync(fileURLToPath(new URL(`../game/${file}`, import.meta.url)), 'utf8'));

function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
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

function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const audio = { playSfx() {}, playMusic() {} };
    const map = new GameMap(readMap('bank-map.json'), 'bank-map.json');
    const financier = { ...readMap('bank-map.json').enemies.find(e => e.id === 'bank-financier') };
    const g = {
        state: STATE.IDLE, facing: 'up', playerX: financier.x, playerY: financier.y + 1,
        inventory: [{ itemDef: { id: 'burger_fries', name: 'Burger + Fries' }, count: 1 },
                    { itemDef: { id: 'tigers_blood_ice_cone', name: 'Cone' }, count: 1 }],
        enemies: [financier], containers: [], examinables: [], gold: 0,
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _paused: false, _deviceTab: 'items', _deviceSel: null, _journalScroll: 0,
        renderer: {}, logs: [], map, financier,
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

const ids = (g) => g._dialogueChoices().map(c => c.id);

describe('the Financier brings up the Yellow Card after the delivery', () => {
    test('before the delivery the choice is not on offer', () => {
        const g = makeGame();
        g._openDialogue(g.financier);
        assert.ok(!ids(g).includes('yellowCard'));
        assert.ok(ids(g).includes('deliver'));
    });

    test('after the hand-off (real keys) it is offered, once, and he replies', async () => {
        const g = makeGame();
        g._openDialogue(g.financier);
        await g.press('Space');                       // hand the order over
        assert.ok(g.questEngine.isComplete('deliver_burger'), g.logs.join(' | '));
        assert.equal(ids(g)[0], 'yellowCard', 'now first on offer');
        assert.equal(DIALOGUES.banker.choices.find(c => c.id === 'yellowCard').label, '[TEXT]');

        await g.press('Space');                       // pick it
        assert.equal(g._dialogueReply, '[TEXT]');
        assert.ok(!ids(g).includes('yellowCard'), 'spent');
        assert.equal(g.questEngine.getFlag('yellowCardRaised'), true);

        await g.press('KeyE');
        assert.equal(g.state, STATE.IDLE);
        g._openDialogue(g.financier);
        assert.ok(!ids(g).includes('yellowCard'), 'a second talk does not offer it again');
    });

    test('it stays spent after a save and reload', async () => {
        const g = makeGame();
        g._openDialogue(g.financier);
        await g.press('Space'); await g.press('Space');
        const saved = JSON.parse(JSON.stringify(g.questEngine.serialize()));

        const h = makeGame();
        h.questEngine.restore(saved);
        assert.ok(h.questEngine.isComplete('deliver_burger'));
        h._openDialogue(h.financier);
        assert.ok(!ids(h).includes('yellowCard'));
    });

    test('a save that finished the delivery before this existed still gets the offer', () => {
        const g = makeGame();
        g.questEngine.forceComplete('deliver_burger');
        g._openDialogue(g.financier);
        assert.ok(ids(g).includes('yellowCard'));
    });

    test('it gives nothing: no gold, no item, no new quest', async () => {
        const g = makeGame();
        g._openDialogue(g.financier);
        await g.press('Space');
        const gold = g.gold, bag = g.inventory.filter(Boolean).length, done = g.questEngine.state.completed.slice();
        await g.press('Space');
        assert.equal(g.gold, gold);
        assert.equal(g.inventory.filter(Boolean).length, bag);
        assert.deepEqual(g.questEngine.state.completed, done);
    });
});
