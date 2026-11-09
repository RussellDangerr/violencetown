// dialogue-greetings.test.js — DQ1: conditional greetings (plans/dq1-story-greetings.md).
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
import { getDialogue, greetingFor, DIALOGUES } from '../game/dialogue.js';
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

function makeGame(npcDef) {
    const document = new EventTarget();
    const window = new EventTarget();
    const audio = { playSfx() {}, playMusic() {} };
    const npc = { ...npcDef };
    const g = {
        state: STATE.IDLE, facing: 'up', playerX: npc.x, playerY: npc.y + 1,
        inventory: [], enemies: [npc], containers: [], examinables: [], gold: 0,
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _paused: false, _deviceTab: 'items', _deviceSel: null, _journalScroll: 0,
        renderer: {}, logs: [], npc,
        _log(m) { this.logs.push(m); },
        _render() {}, _resumeHeldWalk() {}, _stopAutoRepeat() {}, _onEntityHarmed() {}, _wheelOpenerUp() {},
        hasBuff() { return false; },
        emitGameEvent(type, payload) { this.questEngine.emit(type, payload); },
    };
    const free = {
        STATE, DIRS, audio, document, window, DEVICE_TABS, cycleDeviceTab,
        getDialogue, greetingFor, transferGold, applyDispositionDelta, DIALOGUE_HOSTILE_AT,
        performance: { now: () => 0 }, setTimeout: () => 0,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_digitToSlot', 'code'], ['_openDevice', "tab = 'items'"], ['_closeDevice', ''],
        ['_deviceKey', 'code'], ['_deviceCycleTab', 'dir'], ['_openWorldMap', ''], ['_scrollJournal', 'delta'],
        ['_openDialogue', 'npc'], ['_closeDialogue', ''], ['_dialogueChoices', ''], ['_pickDialogueChoice', 'choice'],
        ['_removeFromSlot', 'slot'],
    ]) g[n] = liveMethod(n, p, free);
    g.questEngine = new QuestEngine(g);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    // Talk with real keys: open, read the greeting, close with E.
    g.talk = async () => {
        g._openDialogue(g.npc);
        assert.equal(g.state, STATE.DIALOGUE);
        const said = g._dialogueReply;
        await g.press('KeyE');
        assert.equal(g.state, STATE.IDLE);
        return said;
    };
    return g;
}

const cook = readMap('diner-map.json').enemies.find(e => e.id === 'diner-cook');
const bartho = readMap('town-map.json').enemies.find(e => e.dialogueId === 'bartho');

describe('the diner cook', () => {
    test('before the pickup he says today\'s line, then the after line once the burger is out', async () => {
        const g = makeGame(cook);
        g.questEngine.start('deliver_burger');
        assert.equal(await g.talk(), DIALOGUES.diner_cook.greeting);
        g.questEngine.emit('item_pickup', { id: 'burger_fries' });
        assert.notEqual(g.questEngine.currentStageId(), 'get_burger');
        const after = await g.talk();
        assert.equal(after, '[TEXT: the cook, after the pickup]');
        assert.notEqual(after, DIALOGUES.diner_cook.greeting);
    });
    test('no quest started yet: today\'s line', async () => {
        const g = makeGame(cook);
        assert.equal(await g.talk(), DIALOGUES.diner_cook.greeting);
    });
    test('after the delivery is done he still has the after line', async () => {
        const g = makeGame(cook);
        g.questEngine.forceComplete('deliver_burger');
        assert.equal(await g.talk(), '[TEXT: the cook, after the pickup]');
    });
});

describe('Bartho', () => {
    test('before the car opens the bridge: today\'s line; after: the after line', async () => {
        const g = makeGame(bartho);
        assert.equal(await g.talk(), '"...what."');
        g.questEngine.state.flags.carFixed = true;
        assert.equal(await g.talk(), '[TEXT: Bartho, bridge open]');
    });
});

describe('the greeting rule', () => {
    test('a dialogue with no greetings list behaves as today', () => {
        const d = DIALOGUES.pike;
        assert.equal(d.greetings, undefined);
        assert.equal(greetingFor(d, {}), d.greeting);
        assert.equal(greetingFor(null, {}), '');
    });
    test('the first greeting whose condition holds wins', () => {
        const d = { greeting: 'a', greetings: [{ when: () => false, text: 'b' }, { when: () => true, text: 'c' }, { when: () => true, text: 'd' }] };
        assert.equal(greetingFor(d, {}), 'c');
    });
});
