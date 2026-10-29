// quest-target-zones.test.js — MP1: the Map marks where every quest stage wants
// you (plans/mp1-map-marks-quest-stages.md).
//
// The MAP tab rings the active stage's targetZone in red with "» GO" under it.
// Every stage now names one, or says null for none, and content-validate holds
// every future stage to that.
//
// The key test drives the real keydown listener _bindInput registers (lifted out
// of main.js, which touches `document` at import, as in canyon-branch.test.js)
// into the real _openDevice / _deviceKey, then draws the real _drawWorldMapBody
// onto a recording canvas and reads back which box is ringed and what it says.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap } from '../game/map.js';
import { QuestEngine, QUESTS } from '../game/quests.js';
import { Renderer } from '../game/renderer.js';
import { validateContent } from '../game/content-validate.js';
import { WORLD_ZONES, overworldZone } from '../game/world-map.js';
import { SLOTS } from '../game/slots.js';
import { DEVICE_TABS, cycleDeviceTab } from '../game/layout.js';

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

// The pinned answer: each stage's zone, as read from where its objective is.
const EXPECTED = {
    'canyon_escape/find_way_out':  'CANYON',
    'deliver_burger/get_burger':   'DOWNTOWN',
    'deliver_burger/handoff':      'DOWNTOWN',
    'fix_car/examine_car':         'TOWN',
    'fix_car/recover_converter':   'SEWER',
    'fix_car/escape_sewer':        'SEWER',
    'fix_car/return_to_car':       'TOWN',
};

const allStages = () => Object.entries(QUESTS).flatMap(([qid, q]) => q.stages.map(s => [`${qid}/${s.id}`, s]));

describe('every quest stage names where the Map should send you', () => {
    test('each stage carries targetZone, a zone or null, and they match the table', () => {
        const got = {};
        for (const [key, s] of allStages()) {
            assert.ok(Object.hasOwn(s, 'targetZone'), `${key} names no targetZone`);
            got[key] = s.targetZone;
        }
        assert.deepEqual(got, EXPECTED, 'a new or changed stage: add it to the table here');
    });

    test('every named zone is a box on the Map', () => {
        for (const [key, s] of allStages()) {
            if (s.targetZone === null) continue;
            assert.ok(WORLD_ZONES.some(z => z.zoneName === s.targetZone), `${key}: '${s.targetZone}' has no box on the Map`);
        }
    });

    test('the zones are where the objectives are, in the maps', () => {
        const zoneOf = (file) => overworldZone(readMap(file).zoneName);
        // The car is an examinable in the old town.
        assert.ok(readMap('town-map.json').examinables.some(x => x.id === 'car'));
        assert.equal(zoneOf('town-map.json'), QUESTS.fix_car.stages[0].targetZone);
        assert.equal(zoneOf('town-map.json'), QUESTS.fix_car.stages[3].targetZone);
        // The converter is the sewer boss slot's required drop.
        const boss = Object.values(SLOTS).find(s => s.requiredDrop === 'catalytic_converter');
        assert.equal(zoneOf(boss.map), QUESTS.fix_car.stages[1].targetZone);
        assert.equal(zoneOf(boss.map), QUESTS.fix_car.stages[2].targetZone);
        // Pike, whose rope gets you out, stands in the Canyon.
        assert.ok(readMap('canyon-map.json').enemies.some(e => e.id === 'pike'));
        assert.equal(zoneOf('canyon-map.json'), QUESTS.canyon_escape.stages[0].targetZone);
        // The delivery's recipient waits in Downtown.
        assert.ok(readMap('downtown-map.json').enemies.some(e => e.id === 'dt-recipient'));
        assert.equal(zoneOf('downtown-map.json'), QUESTS.deliver_burger.stages[1].targetZone);
    });
});

describe('content-validate holds every stage to it', () => {
    const quest = (stage) => ({ q: { id: 'q', title: 'q', stages: [{ id: 's', objective: 'o', ...stage }] } });
    const zoneProblems = (quests) => validateContent([], { quests }).problems.filter(p => p.startsWith('q/s:') || /targetZone/.test(p));

    test('the real quests pass', () => {
        assert.deepEqual(validateContent([]).problems.filter(p => /targetZone/.test(p)), []);
    });

    test('a stage with no targetZone is a problem', () => {
        assert.deepEqual(zoneProblems(quest({})), ['q/s: names no targetZone (a zone, or null for none)']);
    });

    test('targetZone: null says the stage has no place, and passes', () => {
        assert.deepEqual(zoneProblems(quest({ targetZone: null })), []);
    });

    test('a zone not on the Map is a problem; a zone on it passes', () => {
        assert.deepEqual(zoneProblems(quest({ targetZone: 'NOWHERE' })), ["q/s: unknown targetZone 'NOWHERE'"]);
        assert.deepEqual(zoneProblems(quest({ targetZone: '' })), ["q/s: unknown targetZone ''"]);
        assert.deepEqual(zoneProblems(quest({ targetZone: 'SEWER' })), []);
    });
});

// A game standing in the old town, bound to the real key listener and device methods.
function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const audio = { playSfx() {}, playMusic() {} };
    const g = {
        state: STATE.IDLE, facing: 'up', playerX: 16, playerY: 8,
        inventory: [], enemies: [], containers: [], examinables: [],
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _paused: false, _deviceTab: 'items', _deviceSel: null, _journalScroll: 0,
        logs: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _resumeHeldWalk() {}, _stopAutoRepeat() {},
        hasBuff() { return false; },
        map: new GameMap(readMap('town-map.json'), 'town-map.json'),
    };
    const free = {
        STATE, DIRS, audio, document, window, DEVICE_TABS, cycleDeviceTab,
        performance: { now: () => 0 }, setTimeout: () => 0,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_digitToSlot', 'code'], ['_openDevice', "tab = 'items'"], ['_closeDevice', ''],
        ['_deviceKey', 'code'], ['_deviceCycleTab', 'dir'], ['_openWorldMap', ''], ['_scrollJournal', 'delta'],
    ]) g[n] = liveMethod(n, p, free);
    g.questEngine = new QuestEngine(g);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    return g;
}

// Draw the Map onto a canvas that remembers every outline and every word, then
// report each zone box's outline colour and the words drawn inside it.
function drawMap(game) {
    const rects = [], words = [];
    const state = {};
    const ctx = new Proxy(state, {
        get: (t, k) => {
            if (k === 'strokeRect') return (x, y, w, h) => rects.push({ x, y, w, h, stroke: t.strokeStyle, lineWidth: t.lineWidth });
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
    for (const w of words) {
        const b = rects.find(rc => inside(rc, w));
        if (!b) continue;
        const label = words.find(o => inside(b, o) && WORLD_ZONES.some(z => z.label === o.text));
        if (!label) continue;
        const box = (boxes[label.text] ||= { stroke: b.stroke, lineWidth: b.lineWidth, words: [] });
        if (w !== label) box.words.push(w.text);
    }
    return boxes;
}

const RED = '#e8462f';
const ringed = (boxes) => Object.keys(boxes).filter(k => boxes[k].stroke === RED);

describe('the Map, opened with real keys, rings the stage\'s zone', () => {
    test('on "get your converter back", Tab then M shows the Sewer ringed with » GO', async () => {
        const g = makeGame();
        g.questEngine.start('fix_car');
        g.questEngine.emit('examine', { targetId: 'car' });
        assert.equal(g.questEngine.currentStageId(), 'recover_converter');

        await g.press('Tab');
        assert.equal(g.state, STATE.DEVICE, 'Tab pulls out the Remoticon');
        assert.equal(g._deviceTab, 'items');
        await g.press('KeyM');
        assert.equal(g.state, STATE.DEVICE);
        assert.equal(g._deviceTab, 'map', 'M turns to the Map tab');

        const boxes = drawMap(g);
        assert.equal(Object.keys(boxes).length, WORLD_ZONES.length, 'every zone box was drawn');
        assert.deepEqual(ringed(boxes), ['SEWER']);
        assert.deepEqual(boxes.SEWER.words, ['» GO']);
        assert.deepEqual(boxes.TOWN.words, ['YOU']);
    });

    test('on "your car won\'t start", M from the street rings the Town you stand in', async () => {
        const g = makeGame();
        g.questEngine.start('fix_car');
        assert.equal(g.questEngine.currentStageId(), 'examine_car');

        await g.press('KeyM');
        assert.equal(g.state, STATE.DEVICE);
        assert.equal(g._deviceTab, 'map');

        const boxes = drawMap(g);
        assert.deepEqual(ringed(boxes), ['TOWN']);
        assert.deepEqual(boxes.TOWN.words, ['YOU'], 'where you stand, the box says YOU');
    });

    test('with no quest active, nothing is ringed', async () => {
        const g = makeGame();
        await g.press('KeyM');
        assert.equal(g._deviceTab, 'map');
        assert.deepEqual(ringed(drawMap(g)), []);
    });
});
