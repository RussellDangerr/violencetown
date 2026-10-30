// loot-ticker.test.js — a slot-machine reel rolls through what a kill gave
// (plans/fx3c-slot-machine-loot-reel.md, FX3c).
//
// The reel model is pure (game/loot-ticker.js), so its frames are pinned at exact
// moments. The real main.js methods start it from a real kill (the same
// _handleEnemyDeath the game calls), and the real renderer draws it into a
// recording canvas.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    TICKER, reelEntry, reelEntries, itemMs, windowRows, makeReel, reelDuration, reelDone, liveReel,
    rollPosition, reelFrame, extendReel,
} from '../game/loot-ticker.js';
import { recordKill, stepRespawns, deadIds, bossDropOnce, recordDrop, pendingDrops, takeDrop, dropLoadout } from '../game/drops.js';
import { GameMap } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { transferGold } from '../game/trade.js';
import { ITEMS, VALUE_TIERS } from '../game/items.js';
import { addToInventory as addToInv } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { Renderer } from '../game/renderer.js';
import { DOCK, lootReelRect, LOOT_REEL, hudLayout, rectsOverlap } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';
import { makeBurst } from '../game/loot-burst.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

// A clock the test owns: main.js and the renderer both read performance.now().
const realNow = performance.now.bind(performance);
let clock = 0;
performance.now = () => clock;
afterEach(() => { clock = 0; });
process.on('exit', () => { performance.now = realNow; });

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);
const defs = (...ids) => ids.map(id => ITEMS[id]);

// ── The lines ───────────────────────────────────────────────────────────────

describe('a line is the item as the game already knows it', () => {
    test('icon, name, rarity name and colour from the ladder, count, and base value', () => {
        for (const id of ['catalytic_converter', 'wererat_fur', 'bandage']) {
            const def = ITEMS[id], e = reelEntry(def);
            const tier = VALUE_TIERS.find(t => (def.tier ? t.key === def.tier : (def.baseValue ?? 0) <= t.max));
            assert.equal(e.id, id);
            assert.equal(e.name, def.name);
            assert.equal(e.icon, def.icon);
            assert.equal(e.tierName, tier.name, `${id} rarity name`);
            assert.equal(e.color, tier.color, `${id} rarity colour`);
            assert.equal(e.value, def.baseValue ?? 0, `${id} base value`);
            assert.equal(e.count, 1);
        }
    });

    test('two of one item are one line with a count, in the order they came', () => {
        const es = reelEntries(defs('bandage', 'rock', 'bandage', 'bandage'));
        assert.deepEqual(es.map(e => [e.id, e.count]), [['bandage', 3], ['rock', 1]]);
        assert.deepEqual(reelEntries([]), []);
        assert.deepEqual(reelEntries(null), []);
    });
});

// ── The roll ────────────────────────────────────────────────────────────────

describe('the reel, frame by frame', () => {
    const ids = ['catalytic_converter', 'wererat_fur', 'bandage'];
    const reel = makeReel(reelEntries(defs(...ids)), 1000);
    const at = (t) => reelFrame(reel, 1000 + t);

    test('the timings it was built with (the builder\'s numbers, flagged for review)', () => {
        assert.deepEqual({ ...TICKER }, {
            IN_MS: 120, MAX_ITEM_MS: 420, MIN_ITEM_MS: 110, ROLL_BUDGET_MS: 2400, ROLL_FRAC: 0.6,
            HOLD_MS: 900, OUT_MS: 300, WINDOW_ROWS: 3, DIM: 0.55,
        });
        assert.equal(reelDuration(3), 2 * 420 + 900 + 300);
        assert.equal(reelDuration(0), 0);
    });

    test('it opens on the first line, centred, with the next below it', () => {
        const f = at(0);
        assert.equal(f.s, 0);
        assert.deepEqual(f.rows.map(r => [r.entry.id, r.offset]), [[ids[0], 0], [ids[1], 1]]);
        assert.equal(f.rows[0].weight, 1);
        close(f.rows[1].weight, 0.45, 'the next line is dimmed');
        assert.equal(f.alpha, 0, 'faded in from nothing');
        close(at(60).alpha, 0.5, 'half faded in');
        assert.equal(at(120).alpha, 1);
    });

    test('each item sits still, then rolls up to put the next in the centre', () => {
        // 420 ms an item; it moves for the last 60% (from 168 ms in).
        assert.equal(rollPosition(3, 100), 0);
        assert.equal(rollPosition(3, 168), 0);
        const mid = rollPosition(3, 168 + 126);
        close(mid, 0.5, 'halfway through the move');
        assert.equal(rollPosition(3, 420), 1);
        assert.deepEqual(at(420).rows.map(r => [r.entry.id, r.offset]), [[ids[0], -1], [ids[1], 0], [ids[2], 1]]);
        assert.equal(at(840).s, 2);
        assert.equal(at(840).rows.length, 2, 'the last line has nothing below it');
    });

    test('the last line holds, then fades, then the reel is over', () => {
        const end = reelDuration(3);
        assert.equal(at(840 + 800).s, 2);
        assert.equal(at(840 + 800).alpha, 1);
        close(at(end - 150).alpha, 0.5, 'half faded out');
        assert.equal(at(end), null);
        assert.equal(reelDone(reel, 1000 + end - 1), false);
        assert.equal(reelDone(reel, 1000 + end), true);
        assert.equal(liveReel(reel, 1000 + end), null);
        assert.equal(liveReel(reel, 1000 + end - 1), reel);
        assert.equal(liveReel(null, 5), null);
    });

    test('the same moment always gives the same frame (no randomness)', () => {
        assert.deepEqual(at(500), at(500));
    });
});

describe('a one-item kill is one line', () => {
    const one = makeReel(reelEntries(defs('catalytic_converter')), 0);
    test('a one-line window with nothing to roll', () => {
        assert.equal(windowRows(1), 1);
        assert.equal(windowRows(2), 3);
        for (const t of [0, 100, 500, 1000, 1300]) {
            const f = reelFrame(one, t);
            if (!f) continue;
            assert.equal(f.rows.length, 1);
            assert.equal(f.rows[0].offset, 0);
            assert.equal(f.s, 0);
        }
        assert.equal(reelDuration(1), TICKER.HOLD_MS + TICKER.OUT_MS);
        assert.equal(reelFrame(one, reelDuration(1)), null);
    });
});

describe('a many-item kill rolls fast and stays readable', () => {
    test('the time per item shrinks with the list, to a floor and a ceiling', () => {
        assert.equal(itemMs(2), TICKER.MAX_ITEM_MS);
        assert.equal(itemMs(5), 420 > 2400 / 5 ? 2400 / 5 : 420);
        let prev = Infinity;
        for (let n = 1; n <= 40; n++) {
            const ms = itemMs(n);
            assert.ok(ms <= prev, `${n} items are no slower than ${n - 1}`);
            assert.ok(ms >= TICKER.MIN_ITEM_MS && ms <= TICKER.MAX_ITEM_MS);
            prev = ms;
        }
        assert.equal(itemMs(40), TICKER.MIN_ITEM_MS);
    });

    test('a long roll is far quicker per item than a short one, and never shows more than three lines', () => {
        const many = reelEntries(Object.values(ITEMS).slice(0, 30));
        assert.equal(many.length, 30);
        const reel = makeReel(many, 0);
        const perItem = (reelDuration(30) - TICKER.HOLD_MS - TICKER.OUT_MS) / 29;
        assert.ok(perItem < itemMs(2) / 3, `${perItem} ms an item`);
        for (let t = 0; t < reelDuration(30); t += 37) {
            const f = reelFrame(reel, t);
            assert.ok(f.rows.length <= 3, `${f.rows.length} lines at ${t}`);
            assert.ok(f.rows.some(r => Math.abs(r.offset) <= 0.5), 'a line is always near the centre');
        }
        assert.equal(reelFrame(reel, reelDuration(30) - TICKER.OUT_MS - 1).s, 29, 'the last line is centred before it fades');
    });

    test('every item takes the centre at some moment (none is skipped)', () => {
        const many = reelEntries(Object.values(ITEMS).slice(0, 20));
        const reel = makeReel(many, 0);
        const seen = new Set();
        for (let t = 0; t < reelDuration(20); t += 5) {
            const f = reelFrame(reel, t);
            if (!f) break;
            for (const r of f.rows) if (Math.abs(r.offset) < 0.05) seen.add(r.entry.id);
        }
        assert.equal(seen.size, 20);
    });
});

describe('a second kill while the reel rolls', () => {
    test('what is left joins the new items in one reel, counts adding up', () => {
        const old = makeReel(reelEntries(defs('rock', 'bandage', 'wererat_fur')), 0);
        // 500 ms in the window has passed `rock` (centre is now `bandage`).
        const merged = extendReel(old, reelEntries(defs('bandage', 'catalytic_converter')), 500);
        assert.deepEqual(merged.entries.map(e => [e.id, e.count]), [['bandage', 2], ['wererat_fur', 1], ['catalytic_converter', 1]]);
        assert.equal(merged.bornAt, 500);
    });

    test('a finished (or no) reel is replaced outright', () => {
        const old = makeReel(reelEntries(defs('rock')), 0);
        const fresh = reelEntries(defs('bandage'));
        assert.deepEqual(extendReel(old, fresh, 99_999).entries.map(e => e.id), ['bandage']);
        assert.deepEqual(extendReel(null, fresh, 5).entries.map(e => e.id), ['bandage']);
    });
});

// ── Where it sits ───────────────────────────────────────────────────────────

describe('it fits every screen', () => {
    const screens = {
        '3440x1440': [3440, 1440], '1920x1080': [1920, 1080], '1280x720': [1280, 720],
        'phone 390x844': [390, 844], 'phone landscape 844x390': [844, 390], 'small 320x568': [320, 568],
        'tablet 820x1180': [820, 1180],
    };
    for (const [name, [cssW, cssH]] of Object.entries(screens)) {
        test(`${name}: inside the world, centred, clear of the HP panel and the buffs`, () => {
            const vp = computeViewport({ cssW, cssH, dpr: 1, dock: DOCK });
            const hud = hudLayout(vp);
            for (const rows of [1, 3]) {
                const r = lootReelRect(vp, rows);
                assert.ok(r.x >= 0 && r.x + r.w <= vp.w, 'inside the screen across');
                assert.ok(r.y >= vp.world.y && r.y + r.h <= vp.world.y + vp.world.h, 'inside the world down');
                assert.ok(Math.abs((r.x + r.w / 2) - vp.w / 2) <= 1, 'centred');
                assert.equal(r.w, LOOT_REEL.W);
                assert.equal(r.h, rows * LOOT_REEL.ROW_H + 2 * LOOT_REEL.PAD);
                const hp = { x: hud.hp.x, y: hud.hp.y, w: 170, h: 90 };
                const buffs = { x: hud.buffsRight - (4 * 55 + 12), y: hud.buffsTop, w: 4 * 55 + 12, h: 38 };   // four chips
                assert.ok(!rectsOverlap(r, hp), 'clear of the HP panel');
                assert.ok(!rectsOverlap(r, buffs), 'clear of four buff chips');
            }
        });
    }
});

// ── A real kill starts it ───────────────────────────────────────────────────

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars, { async = false } = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return ${async ? 'async ' : ''}function ${body}`)(...names.map(n => freeVars[n]));
}
const sewer = JSON.parse(readFileSync(new URL('../game/sewer-map.json', import.meta.url), 'utf8'));
const free = {
    loadMap: async (url) => new GameMap(sewer, url),
    document: { getElementById: () => null }, audio: { playSfx() {}, playMusic() {} },
    spawnEnemy, resolveSpawn, deadIds, pendingDrops, recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce,
    transferGold, dropLoadout, requiredDropFor, dropLineFor, ITEMS, onSewerEnemyKilled() {},
    addToInv, SAFE_SLOTS, PACK_PAGE, MAX_STACK, makeBurst, reelEntries, extendReel, liveReel,
};
const names = ['_handleEnemyDeath', '_takeKillLoot', '_addToInventory', '_startLootBurst', '_startLootReel',
    '_skipLootReel', '_rememberKill', '_bossFirstFall', '_recordDrop', '_takeDropRecord'];
const M = Object.fromEntries(names.map(n => [n, liveMethod(`    ${n}(`, free)]));
M._loadMap = liveMethod('    async _loadMap(', free, { async: true });

async function sewerGame() {
    const g = {
        ...M,
        slots: defaultPicks(), map: null, _mapUrl: null, enemies: [], groundItems: [], logs: [],
        inventory: new Array(INVENTORY_SIZE).fill(null), _lootBursts: [], _lootReel: null, loops: 0, renders: 0,
        state: 'explore',
        _collectedItems: new Set(), _droppedItems: {}, _muggedIds: new Set(), _robbed: {},
        _respawnLists: {}, _bossDropsGiven: new Set(), _pendingFollowers: null, gold: 0,
        renderer: { dropFightFog() {} }, questEngine: null,
        _endBuybacks() {}, _advanceDayClock() {}, _openBridgeIfCarFixed() {}, _render() { this.renders++; },
        _resolveItemDef: (id) => ITEMS[id] || null,
        _log(m) { this.logs.push(m); }, _spawnEventWord() {}, emitGameEvent() {}, _grantItem() {},
        _ensureParticleLoop() { this.loops++; },
    };
    await g._loadMap('sewer-map.json');
    return g;
}
const kill = (g, e) => { e.entity.hp = 0; e.entity.alive = false; g._handleEnemyDeath(e); };

describe('a boss kill rolls its loot', () => {
    test('the reel carries one line per item the kill bagged, named and priced from the game', async () => {
        const g = await sewerGame();
        const boss = g.enemies.find(e => e.id === 'wererat');
        const kit = dropLoadout(boss.loadout, 0, 0).map(i => i.type);
        clock = 4242;
        kill(g, boss);
        assert.ok(g._lootReel, 'a reel is rolling');
        assert.equal(g._lootReel.bornAt, 4242);
        assert.equal(g.loops, 2, 'the effect loop is woken for the burst and for the reel');
        const lines = g._lootReel.entries;
        const want = [...kit, 'catalytic_converter', 'wererat_fur'];
        assert.deepEqual([...new Set(lines.map(l => l.id))].sort(), [...new Set(want)].sort());
        assert.equal(lines.reduce((n, l) => n + l.count, 0), want.length, 'every item is counted');
        for (const l of lines) {
            const def = ITEMS[l.id];
            assert.equal(l.name, def.name);
            assert.equal(l.value, def.baseValue ?? 0);
            assert.ok(VALUE_TIERS.some(t => t.name === l.tierName && t.color === l.color));
        }
        // Pure show: every item is in the bag before the first frame.
        const bag = g.inventory.filter(Boolean).map(s => s.itemDef.id);
        for (const l of lines) assert.ok(bag.includes(l.id), `${l.id} is already in the bag`);
    });

    test('a kill that gives nothing rolls nothing', async () => {
        const g = await sewerGame();
        g._takeKillLoot([], { x: 1, y: 1 });
        assert.equal(g._lootReel, null);
        g._startLootReel([]);
        assert.equal(g._lootReel, null);
    });

    test('a second kill while the reel rolls folds into the same reel', async () => {
        const g = await sewerGame();
        clock = 100;
        g._startLootReel(defs('rock', 'bandage'));
        clock = 200;
        g._startLootReel(defs('bandage'));
        assert.equal(g._lootReel.bornAt, 200);
        assert.deepEqual(g._lootReel.entries.map(e => [e.id, e.count]), [['rock', 1], ['bandage', 2]]);
    });

    test('a skip clears the reel and repaints, and does nothing when there is no reel', async () => {
        const g = await sewerGame();
        const before = g.renders;
        g._startLootReel(defs('rock'));
        g._skipLootReel();
        assert.equal(g._lootReel, null);
        assert.equal(g.renders, before + 1);
        g._skipLootReel();
        assert.equal(g.renders, before + 1, 'nothing to repaint the second time');
    });
});

describe('it never blocks play', () => {
    const lines = mainSrc.split(/\r?\n/);
    // Every line of main.js that names the reel, by the method it sits in.
    const owners = new Set();
    let method = null;
    for (const line of lines) {
        const m = /^    (?:async )?([_a-zA-Z]\w*)\s*\([^)]*\)\s*\{\s*$/.exec(line);
        if (m) method = m[1];
        if (line.includes('_lootReel')) owners.add(method);
    }

    test('only the effect loop, the start and the skip read the reel: no turn, input or save does', () => {
        assert.deepEqual([...owners].sort(), ['_ensureParticleLoop', '_hasActiveEffects', '_skipLootReel', '_startLootReel', 'constructor'].sort());
    });

    test('the skip runs first thing in the key handler and the tap handler, before the key is read', () => {
        const key = mainSrc.indexOf("document.addEventListener('keydown', (e) => {\n            if (e.target.tagName === 'INPUT'".replace(/\n/g, mainSrc.includes('\r\n') ? '\r\n' : '\n'));
        assert.ok(key > 0, 'the game\'s key handler');
        const skip = mainSrc.indexOf('this._skipLootReel?.()', key);
        const stateGate = mainSrc.indexOf('STATE.SPLASH || this.state === STATE.RESOLVING) return;', key);
        const firstAction = mainSrc.indexOf('this._physicalHeld.add', key);
        assert.ok(stateGate > key && skip > stateGate && skip < firstAction, 'after the splash gate, before any key is acted on');
        assert.match(mainSrc.slice(skip - 40, skip), /!e\.repeat/, 'a held key\'s repeats do not count as a fresh press');
        // The skip is not a return: nothing after it is skipped.
        assert.doesNotMatch(mainSrc.slice(skip, skip + 60), /return/);
        const tap = mainSrc.indexOf('_onCanvasPointerDown(e) {');
        const tapSkip = mainSrc.indexOf('this._skipLootReel?.()', tap);
        assert.ok(tapSkip > tap && tapSkip < mainSrc.indexOf('this.state === STATE.SPLASH', tap));
    });
});

// ── The renderer draws it ───────────────────────────────────────────────────

describe('the renderer draws the reel', () => {
    function rig(vp) {
        const texts = [], panels = [], clips = [];
        const state = { globalAlpha: 1, fillStyle: null, strokeStyle: null };
        const ctx = new Proxy(state, {
            get(t, k) {
                if (k in t) return t[k];
                if (k === 'rect') return (x, y, w, h) => clips.push({ x, y, w, h });
                if (k === 'fillRect') return (x, y, w, h) => panels.push({ x, y, w, h, fill: t.fillStyle, alpha: t.globalAlpha });
                return () => undefined;
            },
            set(t, k, v) { t[k] = v; return true; },
        });
        const font = { drawText: (c, text, x, y, o) => texts.push({ text, x, y, color: o.color, align: o.align, alpha: state.globalAlpha }) };
        const r = Object.assign(Object.create(Renderer.prototype), {
            ctx, canvas: { width: vp.backingW, height: vp.backingH }, viewport: vp, sprites: {}, font,
            _scrollX: 0, _scrollY: 0,
        });
        r._measurer = () => (s) => s.length * 8;
        return { r, texts, panels, clips };
    }
    const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });

    test('the centre line shows its name, count, rarity in its colour, and value', () => {
        const { r, texts } = rig(VP);
        const reel = makeReel(reelEntries(defs('catalytic_converter', 'bandage', 'bandage')), 0);
        clock = 600;   // the first line has rolled out; the bandages are centred
        const f = reelFrame(reel, 600);
        r._drawLootReel({ _lootReel: reel });
        const centre = f.rows.reduce((a, b) => (Math.abs(b.offset) < Math.abs(a.offset) ? b : a)).entry;
        assert.equal(centre.id, 'bandage');
        const bandage = ITEMS.bandage, tier = VALUE_TIERS.find(t => t.name === centre.tierName);
        const mine = texts.filter(t => t.alpha === f.alpha * f.rows.find(x => x.entry === centre).weight);
        assert.ok(mine.some(t => t.text === bandage.name), 'name');
        assert.ok(mine.some(t => t.text === 'x2'), 'count');
        assert.ok(mine.some(t => t.text === tier.name && t.color === tier.color), 'rarity name, in its colour');
        assert.ok(mine.some(t => t.text === `${bandage.baseValue ?? 0} GP`), 'gold value');
    });

    test('a one-item kill draws one line in a one-line panel', () => {
        const { r, texts, clips } = rig(VP);
        const reel = makeReel(reelEntries(defs('catalytic_converter')), 0);
        clock = 400;
        r._drawLootReel({ _lootReel: reel });
        assert.equal(texts.filter(t => t.text === ITEMS.catalytic_converter.name).length, 1);
        assert.equal(texts.filter(t => t.text.length > 1).length, 4, 'name, count, rarity, value: one line (the icon letter aside)');
        assert.equal(clips[0].h, LOOT_REEL.ROW_H);
    });

    test('the longest item name in the game fits the line uncut, beside a two-digit count', () => {
        const { r, texts } = rig(VP);
        const longest = Object.values(ITEMS).map(d => d.name).sort((a, b) => b.length - a.length)[0];
        const def = Object.values(ITEMS).find(d => d.name === longest);
        const reel = makeReel([{ ...reelEntry(def), count: 12 }], 0);
        clock = 400;
        r._drawLootReel({ _lootReel: reel });
        assert.ok(texts.some(t => t.text === longest), `${longest} is drawn whole`);
    });

    test('lines are clipped to the panel, and a finished or absent reel draws nothing', () => {
        const { r, texts, clips } = rig(VP);
        const reel = makeReel(reelEntries(defs('rock', 'bandage', 'wererat_fur')), 0);
        clock = 500;
        r._drawLootReel({ _lootReel: reel });
        const R = lootReelRect(VP, 3);
        assert.equal(clips.length, 1);
        assert.ok(clips[0].x >= R.x && clips[0].x + clips[0].w <= R.x + R.w && clips[0].y >= R.y && clips[0].y + clips[0].h <= R.y + R.h);
        assert.ok(texts.length > 0);
        texts.length = 0;
        clock = 60_000;
        r._drawLootReel({ _lootReel: reel });
        r._drawLootReel({ _lootReel: null });
        r._drawLootReel({});
        assert.deepEqual(texts, []);
    });

    test('it draws at every size without throwing, a phone included', () => {
        for (const [w, h] of [[3440, 1440], [390, 844], [320, 568]]) {
            const vp = computeViewport({ cssW: w, cssH: h, dpr: 1, dock: DOCK });
            const { r, texts } = rig(vp);
            const reel = makeReel(reelEntries(Object.values(ITEMS).slice(0, 12)), 0);
            for (const t of [0, 300, 1000, 2000]) { clock = t; r._drawLootReel({ _lootReel: reel }); }
            assert.ok(texts.length > 0, `${w}x${h} drew text`);
        }
    });
});
