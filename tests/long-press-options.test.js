// FX60 — a touch long-press on an enemy opens the options list without hitting first.
// Drives the game's own canvas listeners (_bindCanvasTap): real pointerdown / pointerup
// events, with the 450 ms long-press timer advanced by node's mock clock.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../game/main.js';
import { computeViewport } from '../game/viewport.js';
import { DOCK } from '../game/layout.js';

const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });
const FOE = { x: 6, y: 5 };

// A canvas that is just an event target: the game binds its listeners on it and the
// test dispatches events at it, the way the browser does.
function makeCanvas() {
    const handlers = {};
    return {
        addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: VP.cssW, height: VP.cssH }),
        fire(type, init = {}) {
            const e = { type, button: 0, clientX: 600, clientY: 400, pointerType: 'mouse',
                        currentTarget: this, preventDefault() {}, ...init };
            for (const fn of handlers[type] || []) fn(e);
            return e;
        },
    };
}

// A real Game, with only the parts that need a page (renderer, map, sprites) stubbed. The
// foe is a real hostile on a real tile; Hit goes through the real default-verb and
// resolver path, and the weapon lands for 10.
function makeGame() {
    const g = new Game();
    const canvas = makeCanvas();
    const foe = { x: FOE.x, y: FOE.y, allegiance: 'hostile', name: 'Foe',
                  entity: { hp: 100, isAlive() { return this.hp > 0; } } };
    Object.assign(g, {
        state: 'idle',
        playerX: 5, playerY: 5, enemies: [foe], groundItems: [], containers: [], examinables: [],
        equipment: { weapon: { damage: 10, damageType: 'blunt' } },
        renderer: { _menuPanelRect: null, _closeBtnRect: null, _view: () => VP },
        map: { getTile: () => 0, isWalkable: () => true },
    });
    g._animating = false;
    g.turns = 0;
    g._hud = () => ({ opener: null, log: null, dock: null });
    g._screenToTile = () => ({ x: FOE.x, y: FOE.y });
    g._tapXmbBar = () => false;
    g._render = () => {};
    g._log = () => {};
    g._skipLootReel = () => {};
    g._advanceWorld = () => { g.turns++; };
    g.combatAttack = (npc, dmg) => { npc.entity.hp -= dmg; };
    g._bindCanvasTap(canvas);
    return { g, canvas, foe };
}

describe('fx60: long-press on an enemy', () => {
    beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
    afterEach(() => mock.timers.reset());

    test('a touch long-press opens the options list and the foe is not hit', () => {
        const { g, canvas, foe } = makeGame();
        canvas.fire('pointerdown', { pointerType: 'touch' });
        assert.equal(foe.entity.hp, 100, 'nothing happens while the finger is down');
        mock.timers.tick(450);
        assert.equal(g.state, 'target_list', 'the list opened');
        assert.equal(g.targetList.target.npc, foe);
        canvas.fire('pointerup', { pointerType: 'touch' });
        assert.equal(foe.entity.hp, 100, 'lifting after the list opened does not hit');
        assert.equal(g.turns, 0, 'no turn spent');
        assert.equal(g.state, 'target_list', 'the list is still open');
    });

    test('a touch tap on an enemy still hits, when the finger lifts', () => {
        const { g, canvas, foe } = makeGame();
        canvas.fire('pointerdown', { pointerType: 'touch' });
        mock.timers.tick(100);
        canvas.fire('pointerup', { pointerType: 'touch' });
        assert.equal(foe.entity.hp, 90, 'one hit for the weapon damage');
        assert.equal(g.turns, 1);
        mock.timers.tick(1000);
        assert.equal(g.state, 'idle', 'the stale timer does not open the list later');
        assert.equal(foe.entity.hp, 90);
    });

    test('a touch that drags away is neither a hit nor a list', () => {
        const { g, canvas, foe } = makeGame();
        canvas.fire('pointerdown', { pointerType: 'touch' });
        canvas.fire('pointermove', { pointerType: 'touch', clientX: 640, clientY: 400 });
        canvas.fire('pointerup', { pointerType: 'touch', clientX: 640 });
        mock.timers.tick(1000);
        assert.equal(foe.entity.hp, 100);
        assert.equal(g.state, 'idle');
    });

    test('a cancelled touch is neither a hit nor a list', () => {
        const { g, canvas, foe } = makeGame();
        canvas.fire('pointerdown', { pointerType: 'touch' });
        canvas.fire('pointercancel', { pointerType: 'touch' });
        mock.timers.tick(1000);
        assert.equal(foe.entity.hp, 100);
        assert.equal(g.state, 'idle');
    });

    test('a mouse click still hits on press, as before', () => {
        const { g, canvas, foe } = makeGame();
        canvas.fire('pointerdown', { pointerType: 'mouse' });
        assert.equal(foe.entity.hp, 90, 'hit before any release');
        canvas.fire('pointerup', { pointerType: 'mouse' });
        mock.timers.tick(1000);
        assert.equal(foe.entity.hp, 90, 'one hit only');
        assert.equal(g.turns, 1);
    });

    test('mouse right-click opens the list and spends no turn', () => {
        const { g, canvas, foe } = makeGame();
        canvas.fire('pointerdown', { pointerType: 'mouse', button: 2 });
        canvas.fire('contextmenu', { pointerType: 'mouse', button: 2 });
        assert.equal(g.state, 'target_list');
        assert.equal(foe.entity.hp, 100);
        assert.equal(g.turns, 0);
    });

    test('a touch tap on a friendly or an item is not deferred', () => {
        const { g, canvas, foe } = makeGame();
        foe.allegiance = 'neutral';
        foe.dialogueId = 'x';
        let acted = null;
        g._actOnTarget = (verb) => { acted = verb.key; };
        canvas.fire('pointerdown', { pointerType: 'touch' });
        assert.equal(acted, 'talk', 'talk fires on press, as before');
    });
});
