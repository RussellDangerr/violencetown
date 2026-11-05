// fight-arc.test.js — FA1: in a fight, an arc of every attack you own appears under you
// (plans/fa1-fight-arc.md).
//
// Two halves. The first is the pure module: which slots exist, where they sit, what fades them.
// The second drives the REAL game: a real Game, its own keydown listener (_bindInput, on a
// stand-in document) and its own pointer listeners (_bindCanvasTap, on a stand-in canvas). The
// test only presses keys and pointers; the stand-ins below them are _render, _advanceWorld
// (counted, to prove a refused slot spends no turn) and combatAttack (recorded, to prove WHAT
// a slot hits). Every slot is compared against the same action done on the wheel itself.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { Game } = await import('../game/main.js');
const { Renderer } = await import('../game/renderer.js');
const { Enemy } = await import('../game/enemies.js');
const wm = await import('../game/wheel-model.js');
const arc = await import('../game/fight-arc.js');
const { computeViewport } = await import('../game/viewport.js');
const { DOCK, hudLayout, fightPanelRects } = await import('../game/layout.js');
const { TILE_PX } = await import('../game/data.js');

const { ROOT, GREYED_REASON_TEXT, greyedReason } = wm;
const { arcSlots, arcVisible, arcOn, arcLayout, arcSlotAt, arcFaded, ARC_MAX, ARC_KEYS } = arc;

// Set after main.js is imported: with a document present, importing it would boot the real page.
globalThis.window = new EventTarget();
setMaxListeners(200, globalThis.window);   // every game binds a blur listener

const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });
const PX = 20, PY = 20;

// ── a fight, without a page ─────────────────────────────────────────────────────────────
function foe(x, y, over = {}) {
    const e = new Enemy({ id: `foe_${x}_${y}`, type: 'Violencian', x, y, name: 'Foe', sightRange: 8 });
    e.state = 'chasing';
    return Object.assign(e, over);
}

function makeCanvas() {
    const handlers = {};
    return {
        addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: VP.cssW, height: VP.cssH }),
        fire(type, init = {}) {
            const e = { type, button: 0, clientX: 0, clientY: 0, pointerType: 'mouse',
                        currentTarget: this, preventDefault() {}, ...init };
            for (const fn of handlers[type] || []) fn(e);
            return e;
        },
    };
}

// Logical px (what the arc lays out in) to the client px a pointer event carries.
const client = (pt) => ({ clientX: pt.x * (VP.cssW / VP.w), clientY: pt.y * (VP.cssH / VP.h) });
const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const slotPt = (n) => centre(arcLayout(VP).slots[n - 1]);
// The screen centre of a world tile.
const tilePt = (tx, ty) => ({ x: VP.origin.x + (tx - PX) * TILE_PX + TILE_PX / 2, y: VP.origin.y + (ty - PY) * TILE_PX + TILE_PX / 2 });

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

function makeGame(enemies = [foe(PX + 1, PY)], over = {}) {
    const g = new Game();
    const canvas = makeCanvas();
    Object.assign(g, {
        state: 'idle',
        playerX: PX, playerY: PY, playerHp: 100, playerMaxHp: 100, playerMp: 100, gold: 0,
        enemies, groundItems: [], containers: [], examinables: [], inventory: [], facing: 'down',
        equipment: { weapon: { damage: 10, damageType: 'blunt', id: 'stick' } },
        knownSpells: ['fireball', 'coneOfCold'], grantedTricks: [],
        renderer: { _menuPanelRect: null, _closeBtnRect: null, _view: () => VP, _hud: () => hudLayout(VP, { fight: true }) },
        map: { getTile: () => 0, isWalkable: () => true },
        ...over,
    });
    g._animating = false;
    g.turns = 0; g.logs = []; g.hits = []; g.selected = [];
    g._hud = () => hudLayout(VP, { fight: true });
    g._render = () => {};
    g._log = (m) => { g.logs.push(m); };
    g._skipLootReel = () => {};
    g._maybeShowHint = () => {};
    g._ensureParticleLoop = () => {};
    g._advanceWorld = () => { g.turns++; };
    g._selectItem = (i) => { g.selected.push(i); };
    g.combatAttack = (npc, dmg, opts) => { g.hits.push({ npc, dmg, type: opts && opts.type }); npc.entity.hp -= dmg; return true; };
    const doc = globalThis.document = new EventTarget();
    g._bindInput();
    g._bindCanvasTap(canvas);
    g.canvas = canvas;
    g.down = (code) => doc.dispatchEvent(new Key('keydown', code));
    g.up = (code) => doc.dispatchEvent(new Key('keyup', code));
    g.tap = (code) => { g.down(code); g.up(code); };
    return g;
}

// ── pure: the slots ─────────────────────────────────────────────────────────────────────
const bare = (over = {}) => ({
    state: 'idle', wheel: wm.createWheelState(), playerX: PX, playerY: PY, playerHp: 100, playerMaxHp: 100, playerMp: 100,
    knownSpells: [], grantedTricks: [], gold: 0, inventory: [], equipment: {}, enemies: [], map: { isWalkable: () => true },
    ...over,
});
const labels = (g) => arcSlots(g).map(s => s.label);

describe('the arc: which slots exist', () => {
    test('without spells: Hit, Cleave, Spin, Ranged, Defend, numbered from 1', () => {
        assert.deepEqual(labels(bare()), ['Hit', 'Cleave', 'Spin', 'Ranged', 'Defend']);
        assert.deepEqual(arcSlots(bare()).map(s => s.n), [1, 2, 3, 4, 5]);
    });

    test('a spell you own gets a slot, in fixed order; one you do not own gets none', () => {
        assert.deepEqual(labels(bare({ knownSpells: ['coneOfCold'] })), ['Hit', 'Cleave', 'Spin', 'Ranged', 'Cone of Cold', 'Defend']);
        assert.deepEqual(labels(bare({ knownSpells: ['fireball', 'coneOfCold', 'boo'] })),
            ['Hit', 'Cleave', 'Spin', 'Ranged', 'Fireball', 'Cone of Cold', 'Boo!', 'Defend']);
    });

    test('at most eight, even with every spell; Ranged and Throw are one slot', () => {
        const all = arcSlots(bare({ knownSpells: ['fireball', 'coneOfCold', 'boo'], grantedTricks: ['ray_blast', 'hire_lion'] }));
        assert.equal(all.length, ARC_MAX);
        assert.equal(all.length, 8);
        assert.equal(all.filter(s => s.node.resolver === 'resolveThrow').length, 1);
    });

    test('every slot IS the wheel\'s own node, reached by its path', () => {
        for (const s of arcSlots(bare({ knownSpells: ['fireball', 'coneOfCold', 'boo'] }))) {
            let n = ROOT;
            for (const i of s.path) n = n.children[i];
            assert.equal(n, s.node, `${s.key}: the path does not reach the wheel's node`);
        }
        assert.equal(ARC_KEYS.length, ARC_MAX);
    });

    test('the reason is the wheel\'s (FX58), not a copy', () => {
        const g = bare({ knownSpells: ['fireball'], playerMp: 0 });
        for (const s of arcSlots(g)) {
            assert.equal(s.reason, greyedReason(s.node, g), s.key);
            assert.equal(s.line, s.reason ? GREYED_REASON_TEXT[s.reason] : null, s.key);
        }
        const by = Object.fromEntries(arcSlots(g).map(s => [s.key, s.reason]));
        assert.equal(by.hit, 'nobody-beside');
        assert.equal(by.ranged, 'no-rock');
        assert.equal(by.fireball, 'no-mp');
        assert.equal(by.spin, null, 'Spin is never greyed');
        assert.equal(by.defend, null);
    });

    test('a hostile beside you un-greys Hit and Cleave', () => {
        const g = bare({ enemies: [foe(PX + 1, PY)] });
        const by = Object.fromEntries(arcSlots(g).map(s => [s.key, s.reason]));
        assert.equal(by.hit, null);
        assert.equal(by.cleave, null);
    });
});

describe('the arc: when it shows', () => {
    test('only while a fight is on', () => {
        assert.equal(arcOn(bare({ enemies: [foe(PX + 3, PY)] })), true);
        assert.equal(arcOn(bare({ enemies: [foe(PX + 3, PY, { state: 'idle' })] })), false, 'a sleeper is not a fight');
        assert.equal(arcOn(bare({ enemies: [] })), false);
        assert.equal(arcOn(bare({ state: 'dead', enemies: [foe(PX + 3, PY)] })), false);
    });

    test('idle and the wheel\'s aim layer only; every menu hides it', () => {
        const en = [foe(PX + 3, PY)];
        assert.equal(arcVisible(bare({ enemies: en })), true);
        for (const state of ['target_list', 'item_overlay', 'dialogue', 'trade', 'device', 'log_modal', 'item_selected']) {
            assert.equal(arcVisible(bare({ enemies: en, state })), false, state);
        }
        const dial = bare({ enemies: en, state: 'radial_menu' });
        assert.equal(arcVisible(dial), false, 'the open dial replaces it');
        const aiming = bare({ enemies: en, state: 'radial_menu' }); aiming.wheel.aiming = true;
        assert.equal(arcVisible(aiming), true);
        aiming.wheel.confirming = true;
        assert.equal(arcVisible(aiming), false, 'the confirm takes the screen');
    });
});

// ── pure: where it sits ─────────────────────────────────────────────────────────────────
const VIEWS = [
    ['3440x1440', { cssW: 3440, cssH: 1440 }], ['1920x1080', { cssW: 1920, cssH: 1080 }],
    ['1366x768', { cssW: 1366, cssH: 768 }], ['800x600', { cssW: 800, cssH: 600 }],
    ['390x844 phone', { cssW: 390, cssH: 844 }], ['844x390 phone, sideways', { cssW: 844, cssH: 390 }],
];
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the arc: where it sits', () => {
    test('a position belongs to its number: the layout never depends on who is here', () => {
        const a = arcLayout(VP).slots, b = arcLayout(VP).slots;
        assert.deepEqual(a, b);
        assert.equal(a.length, 8);
        const xs = a.map(r => r.x);
        assert.deepEqual([...xs].sort((p, q) => p - q), xs, 'slot 1 is leftmost and 8 rightmost');
    });

    for (const [name, size] of VIEWS) {
        test(`covers nothing a player must see at ${name}`, () => {
            const vp = computeViewport({ ...size, dpr: 1, dock: DOCK });
            const L = arcLayout(vp).slots;
            const hud = hudLayout(vp, { fight: true });
            const panels = fightPanelRects(vp);
            const you = { x: vp.origin.x, y: vp.origin.y, w: TILE_PX, h: TILE_PX };
            // the ring of tiles beside you, where the fight happens
            const beside = { x: you.x - TILE_PX, y: you.y - TILE_PX, w: 3 * TILE_PX, h: 3 * TILE_PX };
            for (const r of L) {
                assert.ok(r.x >= 0 && r.x + r.w <= vp.w, `slot ${r.n} runs off the sides`);
                assert.ok(r.y >= vp.world.y && r.y + r.h <= vp.world.y + vp.world.h, `slot ${r.n} leaves the world`);
                assert.ok(!overlaps(r, beside), `slot ${r.n} covers a tile beside you`);
                assert.ok(!overlaps(r, panels.left) && !overlaps(r, panels.right), `slot ${r.n} covers a fight panel`);
                if (hud.dock) assert.ok(r.y + r.h <= hud.dock.y, `slot ${r.n} covers the dock`);
                for (const key of ['hp', 'log', 'opener']) {
                    const p = hud[key];
                    if (p && p.w) assert.ok(!overlaps(r, p), `slot ${r.n} covers ${key}`);
                }
                if (hud.hp) assert.ok(!overlaps(r, { x: hud.hp.x, y: hud.hp.y, w: 200, h: 96 }), `slot ${r.n} covers the HP panel`);
            }
            for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
                assert.ok(!overlaps(L[i], L[j]), `slots ${L[i].n} and ${L[j].n} overlap`);
            }
        });
    }

    test('a point lands on the slot under it, and only on slots that exist', () => {
        const slots = arcSlots(bare());   // five slots
        for (const s of slots) assert.equal(arcSlotAt(VP, slots, slotPt(s.n)), s.n);
        assert.equal(arcSlotAt(VP, slots, slotPt(8)), 0, 'slot 8 does not exist here');
        assert.equal(arcSlotAt(VP, slots, { x: VP.origin.x + 16, y: VP.origin.y + 16 }), 0, 'you');
        assert.equal(arcSlotAt(VP, slots, null), 0);
    });
});

describe('the arc: it gets out of the way of an aim', () => {
    const aimAt = (key, tile) => {
        const g = bare({ state: 'radial_menu', enemies: [foe(PX + 1, PY)] });
        g.wheel.aiming = true;
        g.wheel.path = ARC_KEYS && arcSlots(g).find(s => s.key === key).path.slice();
        g.wheel.reticle = tile;
        return g;
    };

    test('not aiming: never faded', () => {
        assert.equal(arcFaded(VP, bare({ enemies: [foe(PX + 1, PY)] })), false);
    });

    test('aiming at a tile a slot sits over: faded', () => {
        const under = arcLayout(VP).slots[3];   // slot 4, bottom of the ring
        const t = { x: PX + Math.floor((centre(under).x - VP.origin.x) / TILE_PX), y: PY + Math.floor((centre(under).y - VP.origin.y) / TILE_PX) };
        assert.equal(arcFaded(VP, aimAt('ranged', t)), true);
    });

    test('aiming at the tile beside you: not faded', () => {
        assert.equal(arcFaded(VP, aimAt('hit', { x: PX + 1, y: PY })), false);
    });

    test('a burst that reaches under the arc fades it even when its centre does not', () => {
        const g = aimAt('ranged', { x: PX + 1, y: PY + 1 });   // throw: a 3x3 burst
        const bottom = arcLayout(VP).slots[3];
        const burstReaches = wm.affectedTiles(g.wheel, g).some(t => {
            const r = { x: VP.origin.x + (t.x - PX) * TILE_PX, y: VP.origin.y + (t.y - PY) * TILE_PX, w: TILE_PX, h: TILE_PX };
            return overlaps(r, bottom);
        });
        assert.equal(arcFaded(VP, g), burstReaches);
    });
});

// ── the real game: keys ─────────────────────────────────────────────────────────────────
describe('the arc: the number keys, in a real fight', () => {
    test('outside a fight 1-9 select the bag exactly as before', () => {
        const g = makeGame([]);
        for (let d = 1; d <= 9; d++) g.tap(`Digit${d}`);
        assert.deepEqual(g.selected, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
        assert.equal(g.turns, 0);
    });

    test('in a fight 1-8 are the arc\'s and 9 is still the bag', () => {
        const g = makeGame();
        g.tap('Digit9');
        assert.deepEqual(g.selected, [8]);
        g.tap('Digit3');   // Spin
        assert.deepEqual(g.selected, [8], 'a digit the arc took never reaches the bag');
    });

    test('a digit with no slot behind it does nothing at all', () => {
        const g = makeGame();   // fireball + cone: seven slots, so 8 is empty
        assert.equal(arcSlots(g).length, 7);
        g.tap('Digit8');
        assert.deepEqual(g.selected, []);
        assert.equal(g.turns, 0);
        assert.equal(g.state, 'idle');
        assert.deepEqual(g.logs, []);
    });

    test('Defend (a self action) runs at once and spends one turn', () => {
        const g = makeGame();
        const n = arcSlots(g).find(s => s.key === 'defend').n;
        g.tap(`Digit${n}`);
        assert.equal(g.turns, 1);
        assert.equal(g.state, 'idle', 'back to idle, as after a wheel action');
        assert.ok(g.logs.some(l => /Bracing/.test(l)), g.logs.join('|'));
    });

    test('Spin with a foe beside you hits it, like the wheel\'s Spin', () => {
        const g = makeGame();
        g.tap('Digit3');
        assert.equal(g.hits.length, 1);
        assert.equal(g.hits[0].npc.x, PX + 1);
        assert.equal(g.turns, 1);
    });

    test('Hit enters the wheel\'s aim layer with the reticle on the foe; the same number again fires', () => {
        const g = makeGame();
        g.tap('Digit1');
        assert.equal(g.state, 'radial_menu');
        assert.equal(g.wheel.aiming, true);
        assert.deepEqual(g.wheel.reticle, { x: PX + 1, y: PY });
        assert.equal(g.turns, 0, 'nothing is spent until you commit');
        g.tap('Digit1');
        assert.equal(g.hits.length, 1);
        assert.equal(g.hits[0].dmg, 10, 'the weapon\'s damage, as the wheel\'s Hit');
        assert.equal(g.turns, 1);
        assert.equal(g.state, 'idle');
    });

    test('while aiming another number switches to that slot', () => {
        const g = makeGame();
        g.tap('Digit1');
        assert.equal(wm.selectedNode(g.wheel).key, 'hit');
        g.tap('Digit2');
        assert.equal(wm.selectedNode(g.wheel).key, 'cleave');
        assert.equal(g.wheel.aiming, true);
        assert.equal(g.turns, 0);
    });

    test('Space still commits an aim, and Escape still backs out', () => {
        const g = makeGame();
        g.tap('Digit1'); g.tap('Space');
        assert.equal(g.hits.length, 1);
        const h = makeGame();
        h.tap('Digit1'); h.tap('Escape');
        assert.equal(h.state, 'radial_menu', 'Escape in the aim layer backs out to the wheel, as it always did');
        assert.equal(h.wheel.aiming, false);
        assert.equal(h.hits.length, 0);
        assert.equal(h.turns, 0);
    });

    test('a spell spends its MP only when it is committed', () => {
        const g = makeGame();
        const n = arcSlots(g).find(s => s.key === 'fireball').n;
        g.tap(`Digit${n}`);
        assert.equal(g.playerMp, 100);
        g.tap(`Digit${n}`);
        assert.ok(g.playerMp < 100, 'fireball was cast');
        assert.equal(g.turns, 1);
    });

    test('with the wheel\'s dial open (not aiming) the digits are not the arc\'s', () => {
        const g = makeGame();
        g.tap('Space');
        assert.equal(g.state, 'radial_menu');
        const path = g.wheel.path.slice();
        g.tap('Digit3');
        assert.equal(g.state, 'radial_menu');
        assert.deepEqual(g.wheel.path, path);
        assert.equal(g.turns, 0);
    });
});

describe('the arc: a greyed slot says why and spends nothing', () => {
    test('every greyed slot, by key', () => {
        const g = makeGame([foe(PX + 4, PY)], { playerMp: 0 });   // a foe, but not beside you; no MP; no rock
        const greyed = arcSlots(g).filter(s => s.reason);
        assert.ok(greyed.length >= 4, 'the point of the test: several are greyed');
        for (const s of greyed) {
            const before = { logs: g.logs.length, turns: g.turns, state: g.state };
            g.tap(`Digit${s.n}`);
            assert.equal(g.logs.length, before.logs + 1, `${s.key}: one line`);
            assert.equal(g.logs[before.logs], GREYED_REASON_TEXT[s.reason], `${s.key}: the reason`);
            assert.equal(g.turns, before.turns, `${s.key}: no turn`);
            assert.equal(g.state, before.state, `${s.key}: nothing opened`);
        }
        assert.equal(g.hits.length, 0);
    });

    test('and a wheel press on the same node says the same thing', () => {
        const g = makeGame([foe(PX + 4, PY)]);
        const hit = arcSlots(g).find(s => s.key === 'hit');
        g.tap('Digit1');
        const viaArc = g.logs.pop();
        // the wheel: Space, Fight > Melee > Hit
        g.tap('Space'); g.tap('Space'); g.tap('Space');
        assert.equal(wm.selectedNode(g.wheel).key, 'hit');
        g.tap('Space');
        assert.equal(g.logs.pop(), viaArc);
        assert.equal(viaArc, GREYED_REASON_TEXT[hit.reason]);
    });
});

// ── same action as the wheel ───────────────────────────────────────────────────────────
// For each slot: the effect of its number, against the effect of reaching the same node on the
// wheel with keys and firing it. Recorded: who was hit and for how much, MP, turns, the log.
function effects(g) {
    return { hits: g.hits.map(h => ({ x: h.npc.x, y: h.npc.y, dmg: h.dmg, type: h.type })), mp: g.playerMp, turns: g.turns,
             logs: g.logs.filter(l => !/Bracing/.test(l) || true), state: g.state, buffs: JSON.stringify(g.buffs || null) };
}

function viaWheel(g, slot) {
    g.tap('Space');
    const spinTo = (key) => { for (let n = 0; n < 14 && wm.selectedNode(g.wheel).key !== key; n++) g.tap('ArrowRight'); assert.equal(wm.selectedNode(g.wheel).key, key); };
    const keys = [];
    let n = ROOT;
    for (const i of slot.path) { n = n.children[i]; keys.push(n.key); }
    keys.forEach((k, i) => { spinTo(k); g.tap('Space'); });
    if (g.wheel.aiming) g.tap('Space');
}
function viaArc(g, slot) {
    g.tap(`Digit${slot.n}`);
    if (g.wheel.aiming) g.tap('Space');
}

describe('the arc: every slot does what the wheel does', () => {
    const fresh = () => makeGame([foe(PX + 1, PY), foe(PX - 1, PY + 1)], { knownSpells: ['fireball', 'coneOfCold', 'boo'] });
    const keys = ['hit', 'cleave', 'spin', 'fireball', 'coneofcold', 'boo', 'defend'];
    for (const key of keys) {
        test(`${key}`, () => {
            const a = fresh(), b = fresh();
            const slot = arcSlots(a).find(s => s.key === key);
            assert.ok(slot && !slot.reason, `${key} should be usable here`);
            viaArc(a, slot);
            viaWheel(b, arcSlots(b).find(s => s.key === key));
            assert.deepEqual(effects(a), effects(b));
            assert.ok(a.turns >= 1, 'it did something');
        });
    }

    test('ranged (with a rock)', () => {
        const stack = { itemDef: { id: 'rock', name: 'Rock', useType: 'throw', range: 5, consumable: true, damage: 4 }, count: 3 };
        const mk = () => { const g = makeGame([foe(PX + 3, PY)]); g.inventory = [stack]; g.barSlot = () => 0; g._throwAt = (slot, tile) => { g.hits.push({ npc: { x: tile.x, y: tile.y }, dmg: 'throw', slot }); g.turns++; g.state = 'idle'; g._closeWheel(); }; return g; };
        const a = mk(), b = mk();
        viaArc(a, arcSlots(a).find(s => s.key === 'ranged'));
        viaWheel(b, arcSlots(b).find(s => s.key === 'ranged'));
        assert.deepEqual(effects(a), effects(b));
        assert.equal(a.hits.length, 1);
    });
});

// ── the real game: pointers ────────────────────────────────────────────────────────────
describe('the arc: click and tap', () => {
    beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
    afterEach(() => mock.timers.reset());

    test('a click on a slot runs it', () => {
        const g = makeGame();
        const defend = arcSlots(g).find(s => s.key === 'defend');
        g.canvas.fire('pointerdown', client(slotPt(defend.n)));
        assert.equal(g.turns, 1);
        assert.ok(g.logs.some(l => /Bracing/.test(l)));
    });

    test('a touch tap on a slot runs it too', () => {
        const g = makeGame();
        const defend = arcSlots(g).find(s => s.key === 'defend');
        g.canvas.fire('pointerdown', { ...client(slotPt(defend.n)), pointerType: 'touch' });
        g.canvas.fire('pointerup', { ...client(slotPt(defend.n)), pointerType: 'touch' });
        mock.timers.tick(1000);
        assert.equal(g.turns, 1, 'once, not twice');
        assert.equal(g.state, 'idle');
    });

    test('a click on a greyed slot logs its reason and spends no turn', () => {
        const g = makeGame([foe(PX + 4, PY)]);
        const hit = arcSlots(g).find(s => s.key === 'hit');
        assert.ok(hit.reason);
        g.canvas.fire('pointerdown', client(slotPt(hit.n)));
        assert.deepEqual(g.logs, [GREYED_REASON_TEXT[hit.reason]]);
        assert.equal(g.turns, 0);
        assert.equal(g.state, 'idle');
    });

    test('a click on a slot while aiming: the same slot fires, another switches', () => {
        const g = makeGame();
        g.tap('Digit1');
        const [hit, cleave] = arcSlots(g);
        g.canvas.fire('pointerdown', client(slotPt(cleave.n)));
        assert.equal(wm.selectedNode(g.wheel).key, 'cleave');
        g.canvas.fire('pointerdown', client(slotPt(cleave.n)));
        assert.ok(g.turns >= 1, 'committed');
        assert.equal(g.state, 'idle');
    });

    test('a click on a creature under a slot still hits it: the thing wins', () => {
        const slot4 = arcLayout(VP).slots[3];
        // the tile under the point just inside slot 4's left edge
        const pt = { x: slot4.x + slot4.w - 4, y: centre(slot4).y };
        const t = { x: PX + Math.floor((pt.x - VP.origin.x) / TILE_PX), y: PY + Math.floor((pt.y - VP.origin.y) / TILE_PX) };
        const beside = foe(PX + 1, PY);
        const far = foe(t.x, t.y);
        const g = makeGame([beside, far]);
        assert.equal(arcSlotAt(VP, arcSlots(g), pt), 4, 'the point is on slot 4');
        const spy = mock.method(g, '_arcPress');
        const acted = [];
        g._actOnTarget = (verb, target) => { acted.push({ verb: verb.key, npc: target.npc }); };
        g.canvas.fire('pointerdown', client(pt));
        assert.equal(spy.mock.callCount(), 0, 'the slot did not take it');
        assert.deepEqual(acted.map(a => a.verb), ['hit'], 'the default verb ran, as before the arc');
        assert.equal(acted[0].npc, far, 'on the creature under the slot');
    });

    test('a touch tap on a creature away from the arc still waits for the finger to lift (FX60)', () => {
        const g = makeGame();
        const beside = g.enemies[0];
        const pt = tilePt(PX + 1, PY);
        assert.equal(arcSlotAt(VP, arcSlots(g), pt), 0);
        g.canvas.fire('pointerdown', { ...client(pt), pointerType: 'touch' });
        assert.equal(beside.entity.hp, 100, 'nothing while the finger is down');
        mock.timers.tick(100);
        g.canvas.fire('pointerup', { ...client(pt), pointerType: 'touch' });
        assert.equal(beside.entity.hp, 90);
        assert.equal(g.turns, 1);
    });

    test('a touch long-press on a creature away from the arc still opens the options', () => {
        const g = makeGame();
        const pt = tilePt(PX + 1, PY);
        g.canvas.fire('pointerdown', { ...client(pt), pointerType: 'touch' });
        mock.timers.tick(450);
        assert.equal(g.state, 'target_list');
        assert.equal(g.enemies[0].entity.hp, 100);
    });

    test('right-click on a creature opens the full list, arc or no arc', () => {
        const g = makeGame();
        const pt = tilePt(PX + 1, PY);
        g.canvas.fire('contextmenu', { ...client(pt), button: 2 });
        assert.equal(g.state, 'target_list');
    });

    test('a mouse click on the creature beside you hits it (click as today)', () => {
        const g = makeGame();
        g.canvas.fire('pointerdown', client(tilePt(PX + 1, PY)));
        assert.equal(g.hits.length, 1);
        assert.equal(g.turns, 1);
    });

    test('outside a fight a click where a slot would be is just the world', () => {
        const g = makeGame([]);
        const walked = [];
        g._tapWalkTo = (tile) => { walked.push(tile); return true; };
        const spy = mock.method(g, '_arcPress');
        const pt = slotPt(4);
        g.canvas.fire('pointerdown', client(pt));
        assert.equal(spy.mock.callCount(), 0);
        assert.equal(walked.length, 1, 'it fell through to click-to-move');
        assert.equal(g.turns, 0);
    });

    test('aiming at a tile a slot covers: the arc steps aside and the tap lands on the tile', () => {
        const g = makeGame([foe(PX + 1, PY)]);
        const fireball = arcSlots(g).find(s => s.key === 'fireball');
        g.tap(`Digit${fireball.n}`);
        // put the reticle under slot 4
        const s4 = arcLayout(VP).slots[3];
        const pt = centre(s4);
        const t = { x: PX + Math.floor((pt.x - VP.origin.x) / TILE_PX), y: PY + Math.floor((pt.y - VP.origin.y) / TILE_PX) };
        g.wheel.reticle = t;
        assert.equal(arcFaded(VP, g), true);
        const spy = mock.method(g, '_arcPress');
        g.canvas.fire('pointerdown', client(pt));
        assert.equal(spy.mock.callCount(), 0, 'a faded arc catches nothing');
        assert.ok(g.playerMp < 100, 'the tap fired the spell at the reticle instead');
    });
});

// ── what it draws ──────────────────────────────────────────────────────────────────────
function recorder() {
    const calls = [];
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, lineWidth: 1 };
    const ctx = new Proxy(state, {
        get(t, k) { if (k in t) return t[k]; return (...a) => { calls.push({ fn: k, a, alpha: t.globalAlpha }); }; },
        set(t, k, v) { t[k] = v; return true; },
    });
    return { ctx, calls };
}
function rig() {
    const main = recorder();
    const drawn = [];
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx: main.ctx, canvas: { width: VP.backingW, height: VP.backingH }, viewport: VP, sprites: { uiPanel: null },
        font: { drawText: (ctx, text, x, y, o = {}) => drawn.push({ text, x, y, color: o.color, alpha: ctx.globalAlpha }) },
        _scrollX: 0, _scrollY: 0,
    });
    return { r, drawn, calls: main.calls };
}

describe('the arc: what it draws', () => {
    test('nothing when there is no fight', () => {
        const { r, drawn, calls } = rig();
        r._drawFightArc(bare());
        assert.equal(drawn.length, 0);
        assert.equal(calls.length, 0);
    });

    test('a number and a label for every slot, in a fight', () => {
        const { r, drawn } = rig();
        const g = bare({ enemies: [foe(PX + 3, PY)], knownSpells: ['fireball'] });
        r._drawFightArc(g);
        const t = drawn.map(d => d.text);
        for (const s of arcSlots(g)) {
            assert.ok(t.includes(String(s.n)), `number ${s.n}`);
        }
        assert.ok(t.some(x => x.startsWith('HIT')));
        assert.ok(t.some(x => x.startsWith('DEFEND')));
    });

    test('a greyed slot is still drawn, dimmer', () => {
        const { r, drawn } = rig();
        r._drawFightArc(bare({ enemies: [foe(PX + 4, PY)] }));
        const hit = drawn.find(d => d.text === 'HIT'), spin = drawn.find(d => d.text === 'SPIN');
        assert.ok(hit && spin, 'both drawn');
        assert.ok(hit.alpha < spin.alpha, `greyed ${hit.alpha} should be dimmer than ${spin.alpha}`);
    });

    test('the arc fades while the aim is on a tile it covers', () => {
        const mk = (tile) => {
            const g = bare({ state: 'radial_menu', enemies: [foe(PX + 1, PY)], knownSpells: ['fireball'] });
            g.wheel.aiming = true; g.wheel.path = arcSlots(g).find(s => s.key === 'ranged').path.slice(); g.wheel.reticle = tile;
            return g;
        };
        const s4 = centre(arcLayout(VP).slots[3]);
        const under = { x: PX + Math.floor((s4.x - VP.origin.x) / TILE_PX), y: PY + Math.floor((s4.y - VP.origin.y) / TILE_PX) };
        const a = rig(); a.r._drawFightArc(mk({ x: PX + 1, y: PY }));
        const b = rig(); b.r._drawFightArc(mk(under));
        const alphaOf = (rg) => rg.drawn.find(d => d.text === 'SPIN').alpha;
        assert.ok(alphaOf(b) < alphaOf(a), `faded ${alphaOf(b)} vs clear ${alphaOf(a)}`);
    });

    test('hidden under the wheel\'s open dial', () => {
        const { r, drawn } = rig();
        r._drawFightArc(bare({ state: 'radial_menu', enemies: [foe(PX + 3, PY)] }));
        assert.equal(drawn.length, 0);
    });
});
