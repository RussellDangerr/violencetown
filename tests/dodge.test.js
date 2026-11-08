// dodge.test.js — RR1: evasion dodges blows, and the Hands tab shows each worn ring's passive.
// main.js touches `document` at import, so the real methods are lifted out of its source
// (as cascade.test.js and device-keys.test.js do) and bound onto a small game object.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RNG } from '../game/rng.js';
import { computeHit } from '../game/combat.js';
import { RINGS } from '../game/ring-data.js';
import { aggregatePassives } from '../game/rings.js';
import { dodgeChance, DODGE_PER_POINT, DODGE_WORD } from '../game/hit-splat.js';
import {
    deviceRingsLayout, deviceBodyRect, ringPassiveRows, RING_PASSIVE_LABEL,
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBagSlotRects, deviceBagPagerRects,
    deviceEquipLayout, inspectorActionRects, gearOptionRects, nearestRectInDir, OFFER_ROWS_VISIBLE,
} from '../game/layout.js';
import { resolveUse, unequipItem } from '../game/items.js';
import { zoneOf, moveToZone, pageCount, slotOnPage, pageOfSlot } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { itemActions, equipOptions } from '../game/inspector.js';
import { doExamine } from '../game/examine.js';

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
const rendererSrc = readFileSync(new URL('../game/renderer.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const applyDamageToPlayer = liveMethod('    applyDamageToPlayer(', { computeHit, audio: { playSfx() {} }, DODGE_WORD });
const rollDodge = liveMethod('    _rollDodge(', { dodgeChance });

// The same lift, by method name, for the input listener and the device methods it reaches.
function liveMethodN(name, params, freeVars) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${signature} not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
function liveConst(name) {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*`).exec(mainSrc);
    assert.ok(m, `const ${name} not found in main.js`);
    const from = m.index + m[0].length;
    return new Function(`'use strict'; return ${mainSrc.slice(from, mainSrc.indexOf('\n};', from) + 2)}`)();
}
const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

function hitGame(seed, ringMods) {
    const g = {
        playerHp: 1e9, playerX: 5, playerY: 5, rng: new RNG(seed), _cascade: null, _cascadeActor: null,
        ringMods, splats: [],
        hasBuff: () => false, _playerArmor: () => 0, _spreadFireBlood() {},
        _spawnHitSplat(...a) { g.splats.push(a); },
        _ensureParticleLoop() {}, _triggerScreenShake() {}, _spawnEventWord() {},
    };
    g.hit = applyDamageToPlayer.bind(g);
    g._rollDodge = rollDodge.bind(g);
    return g;
}

describe('dodge rate', () => {
    test('2% a point, so the Rat Ring is 10%', () => {
        assert.equal(DODGE_PER_POINT, 0.02);
        assert.ok(Math.abs(dodgeChance(RINGS.rat_ring.passive.evasion) - 0.10) < 1e-9);
        assert.equal(dodgeChance(0), 0);
        assert.equal(dodgeChance(undefined), 0);
    });

    test('wearing the Rat Ring, about 1 blow in 10 is dodged, and a dodge deals nothing', () => {
        const mods = aggregatePassives({ 'left:index': 'rat_ring' }, (id) => RINGS[id]);
        assert.equal(mods.evasion, 5);
        const g = hitGame(7, mods);
        const N = 5000;
        let dodged = 0, hpLost = 0;
        for (let i = 0; i < N; i++) {
            const before = g.playerHp;
            const dealt = g.hit(8, { x: 6, y: 5 });
            if (dealt === 0) { dodged++; assert.equal(g.playerHp, before, 'a dodge costs no HP'); }
            else hpLost += before - g.playerHp;
        }
        const rate = dodged / N;
        assert.ok(rate > 0.08 && rate < 0.12, `dodge rate ${rate}`);
        assert.equal(hpLost, (N - dodged) * 8);
        assert.equal(g.splats.filter(s => s[2] === DODGE_WORD && s[3] === 'dodge').length, dodged);
    });

    test('a dodge does not stagger', () => {
        const g = hitGame(3, { evasion: 50 });   // 100%
        g.hit(8, null);
        assert.equal(g._playerStaggerUntil, undefined);
        assert.equal(g.splats.length, 1);
    });
});

describe('evasion is rolled before armour', () => {
    const playerArmor = liveMethod('    _playerArmor(', {});
    function armouredGame(seed, ringMods, armor) {
        const g = hitGame(seed, ringMods);
        g.equipment = { top: { armor }, bottom: null, front: null, back: null, sides: null };
        g._poitionMod = () => 0;
        g._playerArmor = playerArmor.bind(g);
        assert.equal(g._playerArmor(), armor, 'real armour, not the stub');
        return g;
    }

    test('a dodged blow deals 0 even against armour (never floored up to 1)', () => {
        const g = armouredGame(5, { evasion: 50 }, 3);   // 100% dodge
        for (let i = 0; i < 20; i++) {
            const before = g.playerHp;
            assert.equal(g.hit(2, { x: 6, y: 5 }), 0, 'armour 3 would have floored a 2 to 1');
            assert.equal(g.playerHp, before);
        }
        assert.equal(g.splats.length, 20);
        assert.ok(g.splats.every(s => s[2] === DODGE_WORD && s[3] === 'dodge'));
    });

    test('no hit flash and no stagger on a dodge', () => {
        const g = armouredGame(5, { evasion: 50 }, 3);
        g.hit(8, null);
        assert.equal(g._playerHitFlashUntil, undefined);
        assert.equal(g._playerStaggerUntil, undefined);
    });

    test('a blow that is not dodged is soaked as before, and min 1 still lands', () => {
        const g = armouredGame(5, { evasion: 0 }, 3);
        let before = g.playerHp;
        assert.equal(g.hit(8, null), 5);
        assert.equal(before - g.playerHp, 5);
        before = g.playerHp;
        g.hit(2, null);
        assert.equal(before - g.playerHp, 1, 'armour never takes a blow to 0');
        assert.ok(g._playerHitFlashUntil > 0, 'a landed blow flashes');
    });
});

describe('without evasion nothing changes', () => {
    for (const mods of [{}, undefined, { armor: 2 }]) {
        test(`the RNG hands out the same draws (${JSON.stringify(mods)})`, () => {
            const g = hitGame(11, mods);
            const ref = new RNG(11);
            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (let i = 0; i < 20; i++) {
                assert.equal(g.hit(5, null), 5);
                ref.pick(dirs);   // the stagger direction: the only draw a plain hit makes
            }
            assert.equal(g.rng.float(), ref.float());
        });
    }
});

describe('the Hands tab', () => {
    // The real keydown listener (_bindInput) is lifted out of main.js and registered on an
    // EventTarget standing in for `document`; keys are dispatched as real events, so the
    // Tab and R presses travel the same path a player's do.
    class Key extends Event {
        constructor(type, code) {
            super(type, { bubbles: true, cancelable: true });
            this.code = code; this.key = code; this.repeat = false;
            this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
        }
    }
    const FREE = {
        STATE, DIRS, audio: { playSfx() {} }, HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect,
        deviceBagSlotRects, deviceBagPagerRects, deviceEquipLayout, deviceRingsLayout, inspectorActionRects,
        gearOptionRects, nearestRectInDir, itemActions, equipOptions, zoneOf, moveToZone, SAFE_SLOTS,
        INVENTORY_SIZE, PACK_PAGE, MAX_STACK, pageCount, slotOnPage, pageOfSlot, resolveUse, unequipItem,
        doExamine, defaultVerb: () => null, OFFER_ROWS_VISIBLE,
    };
    const LIVE = [
        ['_tapDevice', 'pt'], ['_deviceActivate', 'zone, index'], ['_deviceTargets', ''],
        ['_deviceFocus', 't, i'], ['_deviceKey', 'code'], ['_deviceBack', ''],
        ['_deviceCycleTab', 'dir'], ['_closeDevice', ''], ['_openDevice', "tab = 'items'"], ['_bagFirstFilled', ''],
        ['_closeCurrentMenu', ''], ['_pointInRect', 'p, r, slop = 0'],
        ['_openInspect', 'desc'], ['_closeInspect', ''],
    ].map(([n, params]) => [n, liveMethodN(n, params, FREE)]);

    function handsGame() {
        const page = { document: new EventTarget(), window: new EventTarget() };
        const g = {
            state: STATE.IDLE, _deviceTab: 'items', _deviceSel: null, _bagPage: 0, _journalScroll: 0,
            inventory: new Array(INVENTORY_SIZE).fill(null),
            equipment: { weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null },
            tempEquips: [], ownedRings: new Set(['rat_ring', 'fire_ring']), ringSlots: {}, ringTier: 1,
            playerX: 5, playerY: 5, facing: 'down', gold: 0,
            examinables: [], enemies: [], containers: [], groundItems: [],
            map: { getTile: () => 0, isInBounds: () => true, propSpawns: [] },
            _physicalHeld: new Set(), _heldDirKeys: [], _animating: false, _paused: false, renders: 0,
            _log() {}, _render() { this.renders++; },
            _resumeHeldWalk() {}, _stopAutoRepeat() {}, _targetAt: () => null,
            _digitToSlot: () => -1, _noteHeld() {}, _buybackList: () => [], emitGameEvent() {},
            _resolveItemDef: () => null,
        };
        for (const [n, fn] of LIVE) g[n] = fn;
        g._bindInput = liveMethodN('_bindInput', '', { ...FREE, document: page.document, window: page.window });
        g._bindInput();
        g.press = (code) => {
            const down = new Key('keydown', code);
            page.document.dispatchEvent(down);
            page.document.dispatchEvent(new Key('keyup', code));
            return down;
        };
        return g;
    }

    test('Tab pulls out the device, then R opens the Hands tab (real key events)', () => {
        const g = handsGame();
        g.press('Tab');
        assert.equal(g.state, STATE.DEVICE);
        assert.equal(g._deviceTab, 'items');
        const rendersBefore = g.renders;
        const down = g.press('KeyR');
        assert.equal(g.state, STATE.DEVICE);
        assert.equal(g._deviceTab, 'rings');
        assert.ok(g.renders > rendersBefore, 'the tab change redraws');
        assert.equal(down.defaultPrevented, true, 'the device swallows the key');
    });

    test('each worn ring lists its passive: a label and its number (Fire Ring too)', () => {
        const g = handsGame();
        g.press('Tab');
        g.press('KeyR');
        assert.equal(g._deviceTab, 'rings');
        const sockets = deviceRingsLayout(deviceBodyRect(), { ringTier: 1, ringSlots: {} }).sockets;
        assert.ok(sockets.length >= 2, 'tier 1 opens two sockets');
        g.ringSlots = { [sockets[0].key]: 'rat_ring', [sockets[1].key]: 'fire_ring' };
        const worn = deviceRingsLayout(deviceBodyRect(), g).sockets.filter(s => s.ringId);
        assert.equal(worn.length, 2);
        const rows = worn.map(s => ringPassiveRows(RINGS[s.ringId]));
        assert.deepEqual(rows[0], [{ key: 'evasion', label: RING_PASSIVE_LABEL, value: 5 }]);
        assert.deepEqual(rows[1], [{ key: 'fireDamage', label: RING_PASSIVE_LABEL, value: 10 }]);
        assert.deepEqual(ringPassiveRows(null), []);
    });

    test('the renderer draws those rows under a worn socket', () => {
        assert.match(rendererSrc, /ringPassiveRows\(RINGS\[f\.ringId\]\)/);
    });
});
