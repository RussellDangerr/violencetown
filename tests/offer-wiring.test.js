// offer-wiring.test.js — Task 12. Opening, closing and deriving the offer
// screen's state.
//
// main.js touches `document` at module-evaluation time, so the whole file
// throws on import under Node. liveMethod() (the same technique as
// weapons-tradeable.test.js, and the same reasoning) lifts the CURRENT method
// body straight out of the source and turns it into a real callable closed over
// the free variables it reads — so these tests exercise the production logic,
// not a paraphrase of it.
//
// STATE and BUYBACK_MS are module-scope consts in main.js and are NOT exported.
// liveConst() lifts them out of the same source rather than hand-copying them,
// so a renamed state or a retuned window fails here instead of silently drifting
// the test away from the code.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS } from '../game/items.js';
import { resolveItemDef } from '../game/item-registry.js';
import { addToInventory } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, MAX_STACK } from '../game/data.js';
import {
    emptyOffer, commitBlocker, stage, unstage, settledGold, offerBalance, resolveOffer, sameEntry,
} from '../game/offer.js';
import { transferGold, sellPrice, buyPrice } from '../game/trade.js';
import {
    applyDispositionDelta, previewGive, applyGive, reactToTransaction,
} from '../game/give-action.js';
import { isHostile } from '../game/ai.js';
import { dispositionCeil } from '../game/disposition-curves.js';
import {
    MODAL_RECT, HIT_SLOP, offerLayout, offerRowIndexAt, offerTraySlotAt, OFFER_ROWS_VISIBLE,
    OFFER_TRAY_SLOTS,
} from '../game/layout.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

// See weapons-tradeable.test.js for the full rationale. 'use strict' matters:
// a class body is strict by default but a bare `new Function` body is sloppy,
// so an assignment to an undeclared variable — a hard error in the real method —
// would silently create a global and pass.
function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const freeNames = Object.keys(freeVars);
    const factory = new Function(...freeNames, `'use strict'; return function ${body}`);
    return factory(...freeNames.map(n => freeVars[n]));
}

// Lift a module-scope `const NAME = <expr>;` out of main.js and evaluate it.
// Object literals close on a line-start `};`, scalars on the first `;`.
// The declarations in main.js are column-aligned, so the gap around `=` is any
// run of spaces, not one.
function liveConst(name) {
    const decl = new RegExp(`\\nconst ${name}\\s*=\\s*`);
    const m = decl.exec(mainSrc);
    assert.ok(m, `const ${name} not found in main.js`);
    const at = m.index;
    const from = at + m[0].length;
    const objEnd = mainSrc.indexOf('\n};', from);
    const lineEnd = mainSrc.indexOf(';', from);
    const isObj = mainSrc[from] === '{';
    const expr = isObj ? mainSrc.slice(from, objEnd + 2) : mainSrc.slice(from, lineEnd + 1);
    return new Function(`'use strict'; return ${expr}`)();
}

const STATE = liveConst('STATE');
const BUYBACK_MS = liveConst('BUYBACK_MS');

// Sanity: if these ever stop being what the rest of the file assumes, every
// assertion below turns into a tautology, so pin them here rather than trusting.
test('the lifted module constants are the real ones', () => {
    assert.equal(STATE.TRADE, 'trade');
    assert.equal(STATE.IDLE, 'idle');
    assert.equal(BUYBACK_MS, 5 * 60 * 1000);
});

// ── stubs ───────────────────────────────────────────────────────────────────

const audio = { played: [], playSfx(n) { this.played.push(n); } };

const openOffer = liveMethod('_openOffer', 'npc', { STATE, BUYBACK_MS, audio, emptyOffer });
const closeOffer = liveMethod('_closeOffer', '', { STATE, audio });
const tapOffer = liveMethod('_tapOffer', 'pt',
    { MODAL_RECT, HIT_SLOP, offerLayout, offerRowIndexAt, offerTraySlotAt, audio, OFFER_ROWS_VISIBLE });
const offerActivate = liveMethod('_offerActivate', 'zone, index',
    { stage, unstage, settledGold, audio, sameEntry, OFFER_TRAY_SLOTS });
const canStageGive = liveMethod('_canStageGive', 'entry');
const commitOffer = liveMethod('_commitOffer', '');
const pointInRect = liveMethod('_pointInRect', 'p, r, slop = 0');
const containerEntries = liveMethod('_containerEntries', 'container');
const containerStock = liveMethod('_containerStock', 'container');
const takeFromContainer = liveMethod('_takeFromContainer', 'npc, at');
const removeFromSlot = liveMethod('_removeFromSlot', 'slot');
const buybackRecord = liveMethod('_buybackRecord', 'npc, itemId, kind, price');
const buybackLive = liveMethod('_buybackLive', 'npc', { BUYBACK_MS });
const buybackList = liveMethod('_buybackList', 'npc');
const buybackConsume = liveMethod('_buybackConsume', 'npc, itemId');
const resettle = liveMethod('_resettle', 'npc', { settledGold });
const goldTray = liveMethod('_goldTray', '', { settledGold });
const toggleGold = liveMethod('_toggleOfferGold', 'npc', { settledGold });
const scrollBy = liveMethod('_offerScrollBy', 'side, delta', { OFFER_ROWS_VISIBLE });
const takeFitsBag = liveMethod('_offerTakeFitsBag', 'taken', { INVENTORY_SIZE, MAX_STACK });
const logOffer = liveMethod('_logOffer', 'npc, R, { given, taken, gold }', { dispositionCeil });
const commitOfferFull = liveMethod('_commitOffer', '',
    { resolveOffer, transferGold, sellPrice, buyPrice, applyDispositionDelta, isHostile, emptyOffer,
      audio, reactToTransaction });
const theirsList = liveMethod('_offerTheirsList', '');
const yoursList = liveMethod('_offerYoursList', '');
const stagedCount = liveMethod('_stagedCount', 'side, entry');
const offerSelection = liveMethod('_offerSelection', '');
const offerBlocker = liveMethod('_offerBlocker', '', { commitBlocker });

function stubGame(overrides = {}) {
    audio.played = [];
    return {
        // Every lifted method is installed on the stub, so a method that calls a
        // sibling (_tapOffer → _closeOffer, _offerSelection → _offerYoursList)
        // reaches the REAL one. Stubbing those out would let the production call
        // chain rot untested — which is how a stubbed _resolveItemDef once let a
        // gutted resolver survive the whole suite.
        _openOffer: openOffer,
        _closeOffer: closeOffer,
        _tapOffer: tapOffer,
        _offerTheirsList: theirsList,
        _offerYoursList: yoursList,
        _stagedCount: stagedCount,
        _offerSelection: offerSelection,
        _offerBlocker: offerBlocker,
        _offerActivate: offerActivate,
        _canStageGive: canStageGive,
        _commitOffer: commitOffer,
        state: STATE.IDLE,
        gold: 100,
        // A real bag, not []: addToInventory walks cfg.size slots and needs the
        // holes to exist. Tests that want specific contents pass `inventory`.
        inventory: new Array(INVENTORY_SIZE).fill(null),
        logs: [],
        renders: 0,
        resumed: 0,
        timerStarts: 0,
        timerStops: 0,
        _offerNpc: null,
        _offer: null,
        _offerCursor: null,
        _tradeTimer: null,
        _log(msg, cat) { this.logs.push({ msg, cat }); },
        _render() { this.renders++; },
        _resumeHeldWalk() { this.resumed++; },
        _startTradeTimer() { this.timerStarts++; },
        _stopTradeTimer() { this.timerStops++; },
        _resolveItemDef(id) { return resolveItemDef(id); },
        _containerEntries: containerEntries,
        _containerStock: containerStock,
        _takeFromContainer: takeFromContainer,
        _removeFromSlot: removeFromSlot,
        _buybackRecord: buybackRecord,
        _logOffer: logOffer,
        events: [],
        emitGameEvent(name, payload) { this.events.push({ name, payload }); },
        // THE REAL ONES. These were stubbed `return true` and `return []`, and
        // that is exactly why a green 730-test suite could not see either of the
        // two economy exploits this file now covers: every commit test ran
        // against a bag that never fills and a vendor with no buyback shelf.
        // Same class as the hand-written 2-arg _pointInRect that silently
        // dropped `slop` and blinded every hit-test assertion.
        //
        // `got` is kept as a convenience mirror of what actually landed, but it
        // is now written only when addToInventory really accepted the item.
        _addToInventory(def) {
            const ok = addToInventory(this.inventory, def,
                { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK });
            if (ok) (this.got ||= []).push(def.id);
            return ok;
        },
        _offerTakeFitsBag: takeFitsBag,
        _buybackConsume: buybackConsume,
        _resettle: resettle,
        _goldTray: goldTray,
        _toggleOfferGold: toggleGold,
        _offerScrollBy: scrollBy,
        _buybackLive: buybackLive,
        _buybackList: buybackList,
        // The REAL one, lifted. A hand-written two-arg stub silently dropped the
        // `slop` argument, which made every hit-test assertion here blind to slop
        // bugs -- two mutants that reintroduced HIT_SLOP scanning survived the
        // whole suite because of it. main._pointInRect is also CLOSED on the far
        // edge (`<=`) where layout._ptInRect is half-open, and that difference is
        // load-bearing.
        _pointInRect: pointInRect,
        ...overrides,
    };
}

// Three points inside the panel that hit NO interactive rect, even expanded by
// HIT_SLOP: the header band, the column gutter, and below the commit row. Pinned
// as dead space by a test of their own.
const DEAD_SPACE = [
    { x: MODAL_RECT.x + 1, y: MODAL_RECT.y + 1 },
    { x: MODAL_RECT.x + MODAL_RECT.w / 2, y: MODAL_RECT.y + MODAL_RECT.h / 2 },
    { x: MODAL_RECT.x + MODAL_RECT.w - 1, y: MODAL_RECT.y + MODAL_RECT.h - 1 },
];
const this_inPanel = (pt) =>
    pt.x >= MODAL_RECT.x && pt.x < MODAL_RECT.x + MODAL_RECT.w &&
    pt.y >= MODAL_RECT.y && pt.y < MODAL_RECT.y + MODAL_RECT.h;

const alive = { isAlive: () => true };
const dead = { isAlive: () => false };
const puck = () => ({ type: 'puck', vendor: true, disposition: 40, gold: 200, entity: alive, stock: ['soap', 'rock'] });
const friend = () => ({ type: 'gus', disposition: 10, entity: alive });
const chestShim = (contents = ['rock', 'soap']) => ({
    type: 'chest', vendor: true, bribeable: false, disposition: 100,
    _container: { type: 'chest', contents }, stock: contents, entity: alive,
});

// ── _openOffer ──────────────────────────────────────────────────────────────

describe('_openOffer', () => {
    test('refuses unless the game is IDLE', () => {
        // KEEP the gate: the [E] branch reaches _openOffer with no IDLE
        // assignment of its own and is live in DEAD and ENDING.
        for (const s of [STATE.DEAD, STATE.ENDING, STATE.DIALOGUE, STATE.TRADE, STATE.RADIAL_MENU]) {
            const g = stubGame({ state: s });
            openOffer.call(g, puck());
            assert.equal(g.state, s, `opened from ${s}`);
            assert.equal(g._offerNpc, null);
        }
    });

    test('refuses a missing, entity-less or dead partner', () => {
        for (const npc of [null, undefined, {}, { entity: null }, { entity: dead }]) {
            const g = stubGame();
            openOffer.call(g, npc);
            assert.equal(g.state, STATE.IDLE);
            assert.equal(g._offerNpc, null);
        }
    });

    test('opens with a fresh basket the renderer can read', () => {
        const g = stubGame();
        const npc = puck();
        openOffer.call(g, npc);
        assert.equal(g.state, STATE.TRADE);
        assert.equal(g._offerNpc, npc);
        // _drawOfferLists reads _offer.scroll.theirs / .yours unguarded, and the
        // trays read .give / .take. All four must exist on the first frame.
        assert.deepEqual(g._offer.give, []);
        assert.deepEqual(g._offer.take, []);
        assert.equal(g._offer.gold, 0);
        assert.deepEqual(g._offer.scroll, { theirs: 0, yours: 0 });
        assert.equal(g._offer.selection, null);
        assert.deepEqual(g._offerCursor, { side: 'yours', index: 0 });
        assert.equal(g.renders, 1, 'must re-render — that is what publishes the close-chip hit-zone');
    });

    test('a second open does not inherit the first basket', () => {
        const g = stubGame();
        openOffer.call(g, puck());
        g._offer.give.push({ def: ITEMS.rock, count: 3 });
        g._offer.gold = 40;
        g.state = STATE.IDLE;
        openOffer.call(g, friend());
        assert.deepEqual(g._offer.give, []);
        assert.equal(g._offer.gold, 0);
    });

    test('a vendor gets a buyback ledger and the countdown timer', () => {
        const g = stubGame();
        const npc = puck();
        openOffer.call(g, npc);
        assert.ok(npc._buyback, 'no ledger locked');
        assert.deepEqual(npc._buyback.entries, {});
        assert.equal(g.timerStarts, 1);
    });

    test('a CONTAINER gets neither, even though its shim is vendor:true', () => {
        // The single subtlest line in the method. A bare `if (npc.vendor)` would
        // newly spin a 1s setInterval and lock a buyback ledger for every wooden
        // crate — neither of which _openContainer ever did.
        const g = stubGame();
        const shim = chestShim();
        openOffer.call(g, shim);
        assert.equal(shim._buyback, undefined, 'a chest locked a buyback ledger');
        assert.equal(g.timerStarts, 0, 'a chest started the countdown timer');
        assert.equal(g.state, STATE.TRADE);
    });

    test('a non-vendor NPC gets neither', () => {
        const g = stubGame();
        const npc = friend();
        openOffer.call(g, npc);
        assert.equal(npc._buyback, undefined);
        assert.equal(g.timerStarts, 0);
    });

    test('a live buyback ledger survives a close and re-open; an expired one is re-locked', () => {
        const g = stubGame();
        const npc = puck();
        openOffer.call(g, npc);
        npc._buyback.entries.soap = { rebuy: [9] };
        const lockedAt = npc._buyback.openedAt;

        g.state = STATE.IDLE;
        openOffer.call(g, npc);
        assert.equal(npc._buyback.openedAt, lockedAt, 'a live ledger was thrown away');
        assert.deepEqual(npc._buyback.entries.soap, { rebuy: [9] });

        npc._buyback.openedAt = lockedAt - BUYBACK_MS - 1;
        g.state = STATE.IDLE;
        openOffer.call(g, npc);
        assert.deepEqual(npc._buyback.entries, {}, 'an expired ledger was not re-locked');
    });

    test('the log line says which of the three shapes opened, and names the container', () => {
        const vg = stubGame(); openOffer.call(vg, puck());
        assert.match(vg.logs[0].msg, /puck opens the till/);

        const fg = stubGame(); openOffer.call(fg, friend());
        assert.match(fg.logs[0].msg, /open your satchel to gus/);

        // Not a generic "[You lift the lid.]" — the line must still say WHAT the
        // player opened, as _openContainer's did.
        const cg = stubGame(); openOffer.call(cg, chestShim());
        assert.match(cg.logs[0].msg, /pry open the chest/);
    });

    test('plays the open cue', () => {
        const g = stubGame();
        openOffer.call(g, puck());
        assert.deepEqual(audio.played, ['menu-open']);
    });
});

// ── _closeOffer ─────────────────────────────────────────────────────────────

describe('_closeOffer', () => {
    test('discards the basket and returns to IDLE', () => {
        const g = stubGame();
        openOffer.call(g, puck());
        g._offer.give.push({ def: ITEMS.rock, count: 2 });
        closeOffer.call(g);
        assert.equal(g.state, STATE.IDLE);
        assert.equal(g._offerNpc, null);
        assert.equal(g._offer, null);
        assert.equal(g._offerCursor, null);
        assert.equal(g.timerStops, 1);
        assert.equal(g.resumed, 1, 'a walk held through the menu must keep going');
    });

    test('clears the basket even when the state has already moved on', () => {
        // _closeTrade guards on state FIRST, which is why _tradeCursor stays
        // dirty forever. Callers that set IDLE before closing (the pattern the
        // wheel and _fireResolver use) would otherwise strand a live basket and
        // a reference to an NPC.
        const g = stubGame();
        openOffer.call(g, puck());
        g.state = STATE.IDLE;
        closeOffer.call(g);
        assert.equal(g._offerNpc, null, 'a basket survived a close from a non-TRADE state');
        assert.equal(g._offer, null);
        assert.equal(g._offerCursor, null);
    });

    test('does not stop a timer or resume walking when it was not the open screen', () => {
        const g = stubGame({ state: STATE.DIALOGUE });
        closeOffer.call(g);
        assert.equal(g.state, STATE.DIALOGUE, 'clobbered another menu’s state');
        assert.equal(g.timerStops, 0);
        assert.equal(g.resumed, 0);
    });

    test('plays the cancel cue', () => {
        const g = stubGame();
        openOffer.call(g, puck());
        audio.played.length = 0;
        closeOffer.call(g);
        assert.deepEqual(audio.played, ['menu-cancel']);
    });
});

// ── _tapOffer ───────────────────────────────────────────────────────────────

describe('_tapOffer', () => {
    test('a tap OUTSIDE the panel closes, like every other modal', () => {
        const g = stubGame();
        openOffer.call(g, puck());
        tapOffer.call(g, { x: MODAL_RECT.x - 5, y: MODAL_RECT.y - 5 });
        assert.equal(g.state, STATE.IDLE);
        assert.equal(g._offerNpc, null);
    });

    test('a tap INSIDE the panel does NOT close the screen', () => {
        // The regression this method exists to prevent: _tapTrade opens with
        // `if (!this._tradeNpc) { this._closeTrade(); return; }`, and _tradeNpc
        // is permanently null once the entry points are repointed — so routing
        // offer taps there closed the screen on the first click, through a
        // closer that leaves _offerNpc / _offer alive.
        const g = stubGame();
        openOffer.call(g, puck());
        for (const pt of DEAD_SPACE) {
            tapOffer.call(g, pt);
            assert.equal(g.state, STATE.TRADE, `tap at ${pt.x},${pt.y} closed the screen`);
            assert.ok(g._offerNpc, 'the partner was dropped');
        }
    });

    test('the dead-space points this suite taps really are dead space', () => {
        // Guards the test above from quietly becoming a tautology. The panel
        // centre sits in the 16px column gutter with only 2px of clearance from
        // each column once HIT_SLOP is applied — widen the slop or narrow the
        // gutter and it would start landing on a row, at which point "a tap
        // inside does not close" would be testing a row activation instead.
        const L = offerLayout(MODAL_RECT);
        const groups = [L.theirs, L.yours, L.giveTray, L.takeTray, [L.button]];
        const near = (pt, r) => pt.x >= r.x - HIT_SLOP && pt.x < r.x + r.w + HIT_SLOP &&
                                pt.y >= r.y - HIT_SLOP && pt.y < r.y + r.h + HIT_SLOP;
        for (const pt of DEAD_SPACE) {
            assert.ok(this_inPanel(pt), `${pt.x},${pt.y} is not even inside the panel`);
            for (const rects of groups) {
                for (const r of rects) {
                    assert.ok(!near(pt, r),
                        `${pt.x},${pt.y} now lands on an interactive rect ${JSON.stringify(r)}`);
                }
            }
        }
    });
});

// ── the derived lists ───────────────────────────────────────────────────────

describe('the derived lists', () => {
    test('_offerYoursList keeps counts and slot indices, and skips holes', () => {
        const g = stubGame({
            inventory: [
                { itemDef: ITEMS.rock, count: 9 },
                null,
                { itemDef: ITEMS.soap, count: 1 },
            ],
        });
        const out = yoursList.call(g);
        assert.equal(out.length, 2, 'an empty slot became a row');
        // `max` is the staging ceiling and equals the stack: you cannot hand over
        // ten rocks from a slot holding nine.
        assert.deepEqual(out[0], { def: ITEMS.rock, count: 9, max: 9, slot: 0 });
        // slot 2, not 1 — the index must survive the hole, or staging edits the
        // wrong bag slot.
        assert.equal(out[1].slot, 2);
    });

    test('_offerTheirsList is empty with no partner', () => {
        assert.deepEqual(theirsList.call(stubGame()), []);
    });

    test('_offerTheirsList reads a container by contents, tagged so staging can find it', () => {
        const g = stubGame();
        const shim = chestShim(['rock', 'soap']);
        g._offerNpc = shim;
        const out = theirsList.call(g);
        assert.equal(out.length, 2);
        assert.equal(out[0].source, 'contents');
        assert.equal(out[0].index, 0);
        assert.equal(out[0].count, 1, 'one contents index is one unit');
        assert.equal(out[1].def, ITEMS.soap);
    });

    test('_offerTheirsList drops unresolvable ids AND keeps the real contents index', () => {
        // The index is what the commit splices by. _containerStock filters, so a
        // position in ITS output is not a position in chest.contents -- taking by
        // the former removes the wrong item from any chest holding an
        // unresolvable entry. Here soap is contents[2], not stock[1].
        const g = stubGame();
        g._offerNpc = chestShim(['rock', 'not_a_real_item', 'soap']);
        const out = theirsList.call(g);
        assert.equal(out.length, 2);
        assert.deepEqual(out.map(e => e.def.id), ['rock', 'soap']);
        assert.deepEqual(out.map(e => e.index), [0, 2],
            'the row index is a position in the FILTERED list, not in chest.contents');
    });

    test('taking from a chest with an unresolvable entry removes the right item', () => {
        const g = stubGame();
        const shim = chestShim(['rock', 'not_a_real_item', 'soap']);
        g._offerNpc = shim;
        const soap = theirsList.call(g).find(e => e.def.id === 'soap');
        takeFromContainer.call(g, shim, soap.index);
        assert.deepEqual(shim._container.contents, ['rock', 'not_a_real_item'],
            'the wrong entry was spliced out of the chest');
    });

    test('_offerTheirsList reads a vendor by stock, and appends the buyback shelf', () => {
        const g = stubGame({ _buybackList: () => [{ itemId: 'soap' }] });
        g._offerNpc = puck();
        const out = theirsList.call(g);
        assert.deepEqual(out.map(e => e.source), ['stock', 'stock', 'buyback']);
        assert.equal(out[2].boughtBack, true);
    });

    test('_offerTheirsList gives a plain NPC nothing to take', () => {
        const g = stubGame();
        g._offerNpc = friend();
        assert.deepEqual(theirsList.call(g), []);
    });
});

// ── _stagedCount / _offerSelection / _offerBlocker ──────────────────────────

describe('the row accessors', () => {
    test('_stagedCount is 0 with no basket and with an empty one', () => {
        const g = stubGame();
        assert.equal(stagedCount.call(g, 'give', { def: ITEMS.rock, slot: 0 }), 0);
        openOffer.call(g, puck());
        assert.equal(stagedCount.call(g, 'give', { def: ITEMS.rock, slot: 0 }), 0);
    });

    test('_stagedCount matches a bag row by SLOT, not just by def', () => {
        // Two slots can hold the same item; matching on def alone would light up
        // both rows and stage the wrong one.
        const g = stubGame();
        openOffer.call(g, puck());
        g._offer.give.push({ def: ITEMS.rock, count: 2, slot: 3 });
        assert.equal(stagedCount.call(g, 'give', { def: ITEMS.rock, slot: 3 }), 2);
        assert.equal(stagedCount.call(g, 'give', { def: ITEMS.rock, slot: 0 }), 0);
    });

    test('_stagedCount matches a partner row by source AND index', () => {
        const g = stubGame();
        openOffer.call(g, chestShim());
        g._offer.take.push({ def: ITEMS.rock, count: 1, source: 'contents', index: 4 });
        assert.equal(stagedCount.call(g, 'take', { def: ITEMS.rock, source: 'contents', index: 4 }), 1);
        assert.equal(stagedCount.call(g, 'take', { def: ITEMS.rock, source: 'contents', index: 0 }), 0);
        assert.equal(stagedCount.call(g, 'take', { def: ITEMS.rock, source: 'stock', index: 4 }), 0);
    });

    test('_offerSelection is null with nothing picked and resolves a picked row', () => {
        // The bag and the stock must hold DIFFERENT items, or swapping the two
        // sides of the ternary returns the same def and the test cannot tell.
        // Puck's stock is ['soap', 'rock']; the bag is a bandage.
        const g = stubGame({ inventory: [{ itemDef: ITEMS.bandage, count: 1 }] });
        openOffer.call(g, puck());
        assert.equal(offerSelection.call(g), null);

        g._offer.selection = { side: 'yours', index: 0 };
        assert.equal(offerSelection.call(g).def, ITEMS.bandage, 'the yours side read the partner');

        g._offer.selection = { side: 'theirs', index: 0 };
        assert.equal(offerSelection.call(g).def, ITEMS.soap, 'the theirs side read the bag');

        // a stale index must not throw or hand back a hole
        g._offer.selection = { side: 'yours', index: 99 };
        assert.equal(offerSelection.call(g), null);
    });

    test('_offerBlocker refuses with no partner and reports an empty basket', () => {
        const g = stubGame();
        assert.equal(offerBlocker.call(g), 'NOTHING STAGED');
        openOffer.call(g, puck());
        assert.equal(offerBlocker.call(g), 'NOTHING STAGED');
    });

    test('a chest hands over free loot without a blocker', () => {
        const g = stubGame();
        openOffer.call(g, chestShim());
        // Taking loot for nothing is a deficit on paper. commitBlocker reads
        // `npc._container` off the shim itself, so the shortchange arm never
        // arms and the take is clean.
        g._offer.take.push({ def: ITEMS.soap, count: 1, source: 'contents', index: 0 });
        assert.equal(offerBlocker.call(g), null, 'a chest refused to hand over free loot');
    });

    test('gold is a FINITE number of coins before it ever reaches the ledger', () => {
        // `Math.trunc(g || 0)` looks like it sanitizes, and for NaN it does by
        // accident (NaN is falsy). Infinity is not falsy: it survives to become
        // an Infinity balance and then a NaN `unspent` the ledger prints as
        // "NaN GP". A string '1e400' coerces the same way.
        const g = stubGame();
        openOffer.call(g, puck());
        for (const bad of [Infinity, -Infinity, NaN, '1e400', '  ']) {
            g._offer.gold = bad;
            assert.equal(offerBlocker.call(g), 'NOTHING STAGED',
                `gold ${String(bad)} staged something`);
        }
    });

    test('_offerBlocker passes the real wallets through', () => {
        const g = stubGame({ gold: 5 });
        const npc = puck();
        openOffer.call(g, npc);
        g._offer.gold = 40;
        assert.match(offerBlocker.call(g), /YOU'RE 35 GP SHORT/);
        g.gold = 500; g._offer.gold = -1000;
        assert.match(offerBlocker.call(g), /THEIR TILL IS 800 GP SHORT/);
    });
});

// -- staging (Task 13) ------------------------------------------------------

describe('_offerActivate - staging', () => {
    const withBag = (...stacks) => stubGame({ inventory: stacks });

    test('staging a satchel row moves it into the give tray', () => {
        const g = withBag({ itemDef: ITEMS.soap, count: 2 });
        openOffer.call(g, puck());
        offerActivate.call(g, 'yours', 0);
        assert.equal(g._offer.give.length, 1);
        assert.equal(g._offer.give[0].def, ITEMS.soap);
        assert.equal(g._offer.give[0].count, 1);
        assert.deepEqual(g._offer.selection, { side: 'yours', index: 0 });
    });

    test('A BAG ROW CANNOT BE STAGED PAST WHAT THE PLAYER OWNS', () => {
        // The exploit this closes: with no ceiling, stage() defaults to Infinity,
        // so five clicks on a two-stack of soap stages five. Task 14's commit
        // would pay out for all five while _removeFromSlot silently no-ops on the
        // emptied slot -- minting gold, repeatably and silently.
        const g = withBag({ itemDef: ITEMS.soap, count: 2 });
        openOffer.call(g, puck());
        for (let i = 0; i < 5; i++) offerActivate.call(g, 'yours', 0);
        assert.equal(g._offer.give[0].count, 2, 'staged more soap than the player owns');
        assert.match(g.logs.at(-1).msg, /all the .*Soap.* you have/i,
            'the refusal was silent - every refusal is stated on the row');
    });

    test('a CHEST row is one unit and cannot be staged twice', () => {
        const g = stubGame();
        openOffer.call(g, chestShim(['rock', 'soap']));
        offerActivate.call(g, 'theirs', 0);
        offerActivate.call(g, 'theirs', 0);
        assert.equal(g._offer.take[0].count, 1, 'a single chest slot was duplicated');
    });

    test('a VENDOR stock row has no ceiling - supply is infinite', () => {
        const g = stubGame();
        openOffer.call(g, puck());
        for (let i = 0; i < 4; i++) offerActivate.call(g, 'theirs', 0);
        assert.equal(g._offer.take[0].count, 4);
    });

    test('the gold re-settles on every stage, so an ordinary purchase reads zero', () => {
        const g = stubGame();
        const npc = puck();
        openOffer.call(g, npc);
        offerActivate.call(g, 'theirs', 0);
        assert.ok(g._offer.gold > 0, 'the player is paying, so gold must be positive');
        assert.equal(offerBalance(npc, g._offer).balance, 0,
            'an untouched purchase must settle to a zero balance');
    });

    test('un-staging from a tray re-settles too', () => {
        const g = stubGame();
        const npc = puck();
        openOffer.call(g, npc);
        offerActivate.call(g, 'theirs', 0);
        const paid = g._offer.gold;
        assert.ok(paid > 0);
        offerActivate.call(g, 'takeTray', 0);
        assert.equal(g._offer.take.length, 0);
        assert.equal(g._offer.gold, 0, 'gold stayed at ' + paid + ' after the item left the tray');
    });

    test('a chest refuses the give side and says so', () => {
        const g = stubGame({ inventory: [{ itemDef: ITEMS.soap, count: 1 }] });
        openOffer.call(g, chestShim());
        offerActivate.call(g, 'yours', 0);
        assert.equal(g._offer.give.length, 0);
        assert.match(g.logs.at(-1).msg, /isn't interested/);
    });

    test('A TRAY NEVER TAKES MORE ENTRIES THAN IT CAN DRAW', () => {
        // The tray draws OFFER_TRAY_SLOTS slots and the gold chip claims one, so
        // it holds at most SLOTS-1 distinct entries. Past that the extra drew
        // nowhere yet still counted in the ledger and the commit -- and a
        // tray-slot tap being the only unstage affordance, it could not be taken
        // back except by discarding the whole basket.
        const inv = new Array(INVENTORY_SIZE).fill(null);
        const ids = ['rock','soap','bandage','hot_dog','pipe','fire_bottle','foil_hat','sludge_sack'];
        ids.forEach((id, i) => { inv[i] = { itemDef: ITEMS[id], count: 1 }; });
        const g = stubGame({ inventory: inv });
        openOffer.call(g, puck());
        for (let i = 0; i < ids.length; i++) offerActivate.call(g, 'yours', i);
        assert.ok(g._offer.give.length <= OFFER_TRAY_SLOTS - 1,
            `${g._offer.give.length} entries staged into ${OFFER_TRAY_SLOTS} slots`);
        assert.match(g.logs.at(-1).msg, /tray is full/i, 'the refusal was silent');
    });

    test('a full tray still accepts MORE of something already in it', () => {
        const inv = new Array(INVENTORY_SIZE).fill(null);
        ['rock','soap','bandage','hot_dog','pipe'].forEach((id, i) => {
            inv[i] = { itemDef: ITEMS[id], count: 5 };
        });
        const g = stubGame({ inventory: inv });
        openOffer.call(g, puck());
        for (let i = 0; i < 5; i++) offerActivate.call(g, 'yours', i);
        assert.equal(g._offer.give.length, OFFER_TRAY_SLOTS - 1, 'setup: tray at capacity');
        offerActivate.call(g, 'yours', 0);                     // a second rock
        assert.equal(g._offer.give[0].count, 2, 'topping up an existing row was refused');
    });

    test('a dead activation zone is a no-op, not a throw', () => {
        const g = stubGame();
        openOffer.call(g, puck());
        offerActivate.call(g, 'yours', 99);
        offerActivate.call(g, 'nonsense', 0);
        assert.deepEqual(g._offer.give, []);
        assert.deepEqual(g._offer.take, []);
    });

    test('staging preserves scroll and selection without re-attaching them', () => {
        // stage() returns { ...o, [side]: list }, so the other fields ride along.
        // An earlier draft re-attached scroll/selection by hand; that was
        // redundant, and this is what makes it safe to have dropped.
        const g = stubGame({ inventory: [{ itemDef: ITEMS.rock, count: 3 }] });
        openOffer.call(g, puck());
        g._offer.scroll.yours = 4;
        offerActivate.call(g, 'yours', 0);
        assert.ok(g._offer.scroll, 'staging dropped scroll entirely - the screen would blank');
        assert.equal(g._offer.scroll.yours, 4, 'staging lost the scroll position');
    });
});

describe('the keyboard cursor is visible and in range', () => {
    const many = (n) => {
        const inv = new Array(INVENTORY_SIZE).fill(null);
        const ids = ['rock','soap','bandage','hot_dog','pipe'];
        for (let i = 0; i < n; i++) inv[i] = { itemDef: ITEMS[ids[i % 5]], count: 1 };
        return inv;
    };

    test('SWITCHING SIDE CLAMPS THE SHARED INDEX INTO THE NEW LIST', () => {
        // Arrow to row 11 of the bag, press Right onto a 2-row vendor: the
        // cursor used to stay at 11, and Space then resolved list[11] to
        // undefined and returned before even re-rendering -- no sound, no log,
        // nine ArrowUps to recover. Tab reset the index; the arrows did not.
        //
        // A SOURCE PIN: the clamp lives in a closure inside the keydown switch,
        // which liveMethod cannot lift. It asserts the shape, not the effect.
        assert.ok(/const toSide = \(side\) => \{/.test(mainSrc),
            'the side switch no longer goes through one clamping helper');
        assert.ok(/c\.index = Math\.max\(0, Math\.min\(len - 1, c\.index\)\)/.test(mainSrc),
            'switching side no longer clamps the shared index');
        // Scope the search to the offer screen's own keydown block — every one
        // of these codes is handled several times over in main.js, and an
        // unscoped indexOf finds the movement handler instead.
        const from = mainSrc.indexOf('TRADE: the unified offer screen');
        assert.ok(from > 0, 'the offer screen keydown block is gone');
        const block = mainSrc.slice(from, mainSrc.indexOf('_offerActivate(c.side, c.index)', from));
        for (const key of ['ArrowLeft', 'ArrowRight', 'Tab']) {
            const at = block.indexOf(`e.code === '${key}'`);
            assert.ok(at > 0, `${key} is not handled in the offer block`);
            assert.ok(block.slice(at, at + 120).includes('toSide('),
                `${key} does not route through the clamping helper`);
        }
    });

    test('the arrows move the SELECTION, so the description strip follows', () => {
        const g = stubGame({ inventory: many(10) });
        openOffer.call(g, puck());
        assert.equal(g._offer.selection, null);
        // _offerActivate is what a tap uses; the arrows now write selection too,
        // which is asserted at the source since the key block is not liftable.
        assert.ok(/this\._offer\.selection = \{ side: c\.side, index: i \}/.test(mainSrc),
            'the arrow keys no longer move the selection');
    });

    test('the column draws a focus ring on the selected row', () => {
        const rendererSrc = readFileSync(fileURLToPath(new URL('../game/renderer.js', import.meta.url)), 'utf8');
        assert.ok(/cursorIndex = -1/.test(rendererSrc), 'the column takes no cursor');
        assert.ok(/scroll \+ i === cursorIndex/.test(rendererSrc), 'nothing draws the cursor row');
    });
});

describe('_canStageGive', () => {
    test('an ordinary item stages', () => {
        const g = stubGame(); g._offerNpc = puck();
        assert.equal(canStageGive.call(g, { def: ITEMS.soap }), true);
    });

    test('a quest item is refused in the house words', () => {
        const g = stubGame({ questEngine: { expectsDelivery: () => false } });
        g._offerNpc = puck();
        const quest = Object.values(ITEMS).find(d => d.questItem);
        assert.ok(quest, 'no quest item in ITEMS to test with');
        assert.equal(canStageGive.call(g, { def: quest }), false);
        assert.match(g.logs.at(-1).msg, /Best hold onto that/);
    });

    test('THE SANCTIONED DELIVERY IS ALLOWED THROUGH', () => {
        // The gate an earlier draft got wrong. It also refused anything with a
        // falsy baseValue -- and all three such defs in the game are quest items,
        // so that clause could only ever fire on the one case this clause lets
        // through: the delivery the quest is actually asking for.
        const g = stubGame({ questEngine: { expectsDelivery: () => true } });
        g._offerNpc = puck();
        const quest = Object.values(ITEMS).find(d => d.questItem && !d.baseValue);
        assert.ok(quest, 'no zero-value quest item to test with');
        assert.equal(canStageGive.call(g, { def: quest }), true,
            'the gate blocked a delivery the quest expects');
    });

    test('a zero-value item is not refused for being worthless', () => {
        const g = stubGame({ questEngine: { expectsDelivery: () => true } });
        g._offerNpc = { type: 'gus', disposition: 10, entity: alive };
        const quest = Object.values(ITEMS).find(d => d.questItem && !d.baseValue);
        assert.equal(canStageGive.call(g, { def: quest }), true);
    });
});

describe('_tapOffer - routing through the layout helpers', () => {
    test('a tap 3px into a row stages THAT row, not the one above it', () => {
        // The whole reason _tapOffer calls offerRowIndexAt instead of scanning
        // with HIT_SLOP. Rows tile edge to edge, so a slop-expanded row 0
        // swallows the top 7px of row 1 -- 48 of 260 scanned y-values resolve to
        // the wrong row under the hand-rolled version.
        const g = stubGame();
        openOffer.call(g, puck());
        const L = offerLayout(MODAL_RECT);
        const r1 = L.theirs[1];
        tapOffer.call(g, { x: r1.x + 5, y: r1.y + 3 });
        assert.equal(g._offer.selection.index, 1,
            'a tap just inside row 1 activated a different row');
    });

    test('the scroll offset is folded in, so a scrolled list stages the right item', () => {
        const g = stubGame();
        openOffer.call(g, puck());
        g._offer.scroll.theirs = 1;
        const L = offerLayout(MODAL_RECT);
        tapOffer.call(g, { x: L.theirs[0].x + 5, y: L.theirs[0].y + 5 });
        assert.equal(g._offer.selection.index, 1, 'the scroll offset was ignored');
    });

    test('a tap in the 6px tray gap un-stages nothing rather than guessing a neighbour', () => {
        // Something must ALREADY be in the tray for this to discriminate: a gap
        // tap that wrongly resolves to slot 0 calls unstage(0), and unstage on an
        // empty tray is a no-op, so an empty-tray version of this test passes
        // whether the bug is present or not.
        const g = stubGame({ inventory: [{ itemDef: ITEMS.soap, count: 2 }] });
        openOffer.call(g, puck());
        offerActivate.call(g, 'yours', 0);
        offerActivate.call(g, 'yours', 0);
        assert.equal(g._offer.give[0].count, 2, 'setup failed to stage two soap');

        const L = offerLayout(MODAL_RECT);
        const slot0 = L.giveTray[0];
        const gap = { x: slot0.x + slot0.w + 3, y: slot0.y + 5 };
        assert.ok(gap.x < L.giveTray[1].x, 'the probe point is not actually in the gap');
        tapOffer.call(g, gap);
        assert.equal(g._offer.give[0].count, 2,
            'a tap in the gap un-staged from the slot to its left');
        assert.equal(g.state, STATE.TRADE, 'a gap tap closed the screen');
    });

    test('a tap on the commit button routes to the commit zone', () => {
        const g = stubGame();
        openOffer.call(g, puck());
        const L = offerLayout(MODAL_RECT);
        tapOffer.call(g, { x: L.button.x + L.button.w / 2, y: L.button.y + L.button.h / 2 });
        assert.match(g.logs.at(-1).msg, /NOTHING STAGED/);
    });
});

// -- committing (Task 14) ---------------------------------------------------

describe('_commitOffer', () => {
    // The real _commitOffer, not the seam stub.
    const commit = commitOfferFull;

    const vendor = (over = {}) => Object.assign(
        { id: 'puck', type: 'puck', vendor: true, disposition: 40, gold: 200, entity: alive,
          stock: ['bandage', 'soap'], values: { soap: 4 }, behavior: ['IDLE'] }, over);

    test('a blocked offer changes nothing and says why', () => {
        const g = stubGame({ gold: 5 });
        const npc = vendor();
        openOffer.call(g, npc);
        g._offer.gold = 40;                       // more than the player has
        commit.call(g);
        assert.equal(g.gold, 5, 'gold moved on a blocked offer');
        assert.equal(npc.gold, 200);
        assert.match(g.logs.at(-1).msg, /GP SHORT/);
        assert.ok(g._offer.take !== null, 'the basket was cleared by a refusal');
    });

    test('a purchase moves gold one way and the item the other', () => {
        const g = stubGame({ gold: 100 });
        const npc = vendor();
        openOffer.call(g, npc);
        offerActivate.call(g, 'theirs', 0);        // buy a bandage
        const price = g._offer.gold;
        assert.ok(price > 0);
        commit.call(g);
        assert.equal(g.gold, 100 - price, 'the player did not pay');
        assert.equal(npc.gold, 200 + price, 'the vendor was not paid');
        assert.deepEqual(g.got, ['bandage'], 'the item never reached the bag');
        assert.deepEqual(g._offer.take, [], 'the basket survived the commit');
    });

    test('a sale moves gold the other way and empties the slot', () => {
        const g = stubGame({ gold: 10, inventory: [{ itemDef: ITEMS.soap, count: 1 }] });
        const npc = vendor();
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        const owed = -g._offer.gold;
        assert.ok(owed > 0, 'the vendor owes nothing for a sale');
        commit.call(g);
        assert.equal(g.gold, 10 + owed);
        assert.equal(npc.gold, 200 - owed);
        assert.equal(g.inventory[0], null, 'the sold item stayed in the bag');
    });

    test('GIVING FROM TWO SLOTS REMOVES BOTH - highest slot first', () => {
        // Splicing low-to-high would shift the slot of the one still to go.
        const g = stubGame({ inventory: [
            { itemDef: ITEMS.soap, count: 1 }, null, { itemDef: ITEMS.rock, count: 1 },
        ] });
        const npc = vendor();
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        offerActivate.call(g, 'yours', 1);
        assert.equal(g._offer.give.length, 2, 'setup failed to stage both');
        commit.call(g);
        assert.equal(g.inventory[0], null, 'slot 0 survived');
        assert.equal(g.inventory[2], null, 'slot 2 survived');
    });

    test('TAKING TWO CHEST ROWS REMOVES BOTH - highest contents index first', () => {
        const g = stubGame();
        const shim = chestShim(['rock', 'soap', 'bandage']);
        openOffer.call(g, shim);
        offerActivate.call(g, 'theirs', 0);        // contents[0] rock
        offerActivate.call(g, 'theirs', 2);        // contents[2] bandage
        commit.call(g);
        assert.deepEqual(shim._container.contents, ['soap'],
            'ascending splices shifted the second index and took the wrong item');
    });

    test('every hand-off emits item_given, or a delivery quest soft-locks', () => {
        const g = stubGame({ inventory: [{ itemDef: ITEMS.soap, count: 2 }] });
        const npc = vendor();
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        offerActivate.call(g, 'yours', 0);
        commit.call(g);
        const given = g.events.filter(e => e.name === 'item_given');
        assert.equal(given.length, 2, 'one event per unit handed over');
        assert.deepEqual(given[0].payload, { npc: 'puck', item: 'soap' });
    });

    test('a surplus moves disposition and a straight trade does not', () => {
        const g = stubGame({ inventory: [{ itemDef: ITEMS.soap, count: 2 }] });
        const npc = vendor();
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        offerActivate.call(g, 'yours', 0);
        g._offer.gold = 0;                         // refuse the payout: a gift
        const before = npc.disposition;
        commit.call(g);
        assert.ok(npc.disposition > before, 'a gift moved no disposition');

        const g2 = stubGame({ gold: 100 });
        const npc2 = vendor();
        openOffer.call(g2, npc2);
        offerActivate.call(g2, 'theirs', 0);       // settled purchase
        commit.call(g2);
        assert.equal(npc2.disposition, 40, 'a settled trade moved disposition');
    });

    test('the basket is emptied and a still-valid scroll survives', () => {
        // A vendor's stock is infinite, so its list does not shrink and the
        // player's place in it must be kept. (The satchel is the case that CAN
        // shrink -- see the re-clamp test.)
        const inv = new Array(INVENTORY_SIZE).fill(null);
        const g = stubGame({ gold: 500, inventory: inv });
        const npc = vendor();
        npc.stock = ['bandage','soap','rock','pipe','hot_dog','bandage','soap','rock','pipe'];
        openOffer.call(g, npc);
        g._offer.scroll.theirs = 3;
        offerActivate.call(g, 'theirs', 3);
        commit.call(g);
        assert.deepEqual(g._offer.give, []);
        assert.deepEqual(g._offer.take, []);
        assert.equal(g._offer.gold, 0);
        assert.equal(g._offer.selection, null);
        assert.equal(g._offer.scroll.theirs, 3, 'a valid scroll jumped back to the top');
    });

    test('a partner turned hostile by the deal does not keep the screen open', () => {
        const g = stubGame({ gold: 100 });
        // isHostile reads `allegiance`, not the behavior whitelist -- a fixture
        // setting behavior:['HOSTILE'] is not hostile to this code at all.
        const npc = vendor({ allegiance: 'hostile' });
        openOffer.call(g, npc);
        offerActivate.call(g, 'theirs', 0);
        commit.call(g);
        assert.equal(g.state, STATE.IDLE, 'left standing in a hostile partner\u2019s window');
        assert.equal(g._offerNpc, null);
    });
});

describe('_logOffer - the sentences the unspent fields were kept for', () => {
    const npc = () => ({ type: 'puck', disposition: 40 });
    const lines = (R, parts) => {
        const g = stubGame();
        logOffer.call(g, npc(), R, parts);
        return g.logs.map(l => l.msg);
    };
    const R0 = { points: 0, projected: 40, fromGold: 0, fromItems: 0,
                 itemUnspent: 0, goldUnspent: 0, goldRefusedPoints: 0 };
    const none = { given: [], taken: [], gold: 0 };

    test('a purchase reads as a purchase', () => {
        const out = lines({ ...R0 }, { given: [], taken: [{ count: 1 }], gold: 30 });
        assert.match(out[0], /You hand puck 30 GP for 1 item\./);
    });

    test('a gift names the disposition it bought', () => {
        const out = lines({ ...R0, points: 16 }, { given: [{ count: 2 }], taken: [], gold: 0 });
        assert.match(out[0], /You hand puck 2 items\. Disposition \+16\./);
    });

    test('a bad deal says they remember', () => {
        const out = lines({ ...R0, points: -15 }, { given: [{ count: 1 }], taken: [{ count: 1 }], gold: 0 });
        assert.match(out[0], /take it, and remember\. Disposition -15/);
    });

    test('GOLD THAT BOUGHT NOTHING IS SAID OUT LOUD', () => {
        // The condition is "money changed hands and bought no goodwill at all",
        // NOT goldUnspent > 0 -- goodwill rounds down, so a remainder is left
        // over on almost every offer and would fire this on a normal purchase.
        const out = lines({ ...R0, fromGold: 0, goldUnspent: 12 }, { given: [], taken: [], gold: 12 });
        assert.match(out.at(-1), /pockets the gold\. It buys nothing he wants\./);
    });

    test('a rounding remainder says nothing - the surplus bought something', () => {
        // Measured against the live model: a 40 GP bribe with room left leaves
        // goldUnspent 1.1 and a two-soap gift leaves itemUnspent 0.68. Firing on
        // `unspent > 0` alone would narrate both.
        const gold = lines({ ...R0, fromGold: 10, goldUnspent: 1.1, points: 10 },
                           { given: [], taken: [], gold: 40 });
        assert.equal(gold.length, 1, `extra sentence: ${gold.slice(1).join(' | ')}`);
        const item = lines({ ...R0, fromItems: 4, itemUnspent: 0.68, points: 4 },
                           { given: [{ count: 2 }], taken: [], gold: 0 });
        assert.equal(item.length, 1, `extra sentence: ${item.slice(1).join(' | ')}`);
    });

    test('AN ORDINARY SETTLED PURCHASE SAYS NOTHING EXTRA', () => {
        // The false positive this condition shipped with once: the gold in a
        // settled purchase is the PRICE, not a surplus, and a settled buy has
        // goldUnspent 0. Testing the raw gold instead narrated every purchase.
        const out = lines({ ...R0, fromGold: 0, goldUnspent: 0, points: 0 },
                          { given: [], taken: [{ count: 1 }], gold: 37 });
        assert.equal(out.length, 1, `narrated a plain purchase: ${out.slice(1).join(' | ')}`);
    });

    test('A GIFT WITH NO ROOM LEFT IS SAID OUT LOUD', () => {
        // At the ceiling the whole item surplus goes unspent and buys 0 points.
        const out = lines({ ...R0, itemUnspent: 20, fromItems: 0, points: 0 },
                          { given: [{ count: 3 }], taken: [], gold: 0 });
        assert.match(out.at(-1), /already as fond of you as he can be/);
    });

    test('a gift with room left does NOT claim they are already as fond as they can be', () => {
        // The line this test exists for: it fired on a merchant sitting at 76 of
        // 100, because itemUnspent is a rounding remainder on nearly every gift.
        const out = lines({ ...R0, itemUnspent: 0.68, fromItems: 4, points: 16 },
                          { given: [{ count: 2 }], taken: [], gold: 0 });
        assert.equal(out.length, 1,
            `claimed a full heart with room left: ${out.slice(1).join(' | ')}`);
    });

    test('GOLD REFUSED AT THE CEILING IS ITS OWN SENTENCE', () => {
        // Distinct from having no room at all: they would still warm to a GIFT,
        // just not to money. Fusing the two would say the wrong thing.
        const out = lines({ ...R0, goldRefusedPoints: 3, goldUnspent: 40 }, none);
        assert.match(out.at(-1), /buys nothing more\. Some things aren't for sale\./);
        assert.ok(!out.some(l => /pockets the gold/.test(l)),
            'both gold sentences fired for one offer');
    });

    test('a chest is TAKEN FROM, not handed things', () => {
        const g = stubGame();
        logOffer.call(g, { type: 'crate', disposition: 100, _container: {} },
            { ...R0, projected: 100 }, { given: [], taken: [{ count: 2 }], gold: 0 });
        assert.match(g.logs[0].msg, /You take 2 items from the crate\./);
        assert.ok(!/You hand/.test(g.logs[0].msg));
    });

    test('a clean deal says nothing extra', () => {
        const out = lines({ ...R0 }, { given: [{ count: 1 }], taken: [], gold: 0 });
        assert.equal(out.length, 1);
    });

    test('an untracked partner has no surplus to convert, so says nothing extra', () => {
        const g = stubGame();
        logOffer.call(g, { type: 'stranger', disposition: null },
            { ...R0, itemUnspent: 0, fromItems: 0 }, { given: [{ count: 1 }], taken: [], gold: 0 });
        assert.equal(g.logs.length, 1);
    });
});

describe('the disposition ceiling is the NPC own, across all three writers', () => {
    const king = () => ({ type: 'Fungus King', disposition: -80, flipThreshold: 200,
                          bribeable: true, values: { soap: 20 }, behavior: ['HOSTILE'] });
    const ordinary = () => ({ type: 'puck', disposition: 60, flipThreshold: 0,
                              bribeable: true, values: { soap: 4 } });

    test('the ceiling is the threshold when the threshold is above 100', () => {
        assert.equal(dispositionCeil(king()), 200);
        assert.equal(dispositionCeil(ordinary()), 100);
    });

    test('THE FUNGUS KING CAN REACH HIS OWN THRESHOLD - on the knife edge', () => {
        // dispositionCeil IS his flipThreshold and the flip test is >=, so the
        // headroom of exactly 280 from -80 is load-bearing. One point short must
        // not flip him.
        const k = king();
        const r = applyDispositionDelta(k, 280);
        assert.equal(k.disposition, 200);
        assert.equal(r.flipped, true, 'exactly 280 failed to flip the King');

        const k2 = king();
        applyDispositionDelta(k2, 279);
        assert.equal(k2.disposition, 199);
        assert.ok(!k2._wasFlipped, '279 flipped him a point early');
    });

    test('previewGive is clamped too - it was the unclamped writer', () => {
        // previewGive had no clamp at all, so a gift could push an ordinary NPC
        // past 100 into a range no band, no meter and no flip test can see.
        // applyGive writes preview.newDisposition straight through.
        const p = ordinary();
        p.disposition = 95;
        const big = previewGive({ id: 'soap' }, p);       // soap:4 x SHIFT
        assert.ok(big.newDisposition <= 100, `previewGive returned ${big.newDisposition}`);

        const k = king();
        k.disposition = 150;
        const kp = previewGive({ id: 'soap' }, k);
        assert.ok(kp.newDisposition > 100,
            'the King was clamped to 100 by a preview that should use his own ceiling');
        assert.ok(kp.newDisposition <= 200);
    });

    test('applyGive respects the ceiling through the same preview', () => {
        const p = ordinary();
        p.disposition = 99;
        for (let i = 0; i < 5; i++) applyGive({ id: 'soap', name: '[Soap]' }, p);
        assert.equal(p.disposition, 100, 'gifting carried an ordinary NPC past 100');
    });

    test('an ordinary NPC still stops at 100, and at -100', () => {
        const a = ordinary(); applyDispositionDelta(a, 500);
        assert.equal(a.disposition, 100);
        const b = ordinary(); applyDispositionDelta(b, -500);
        assert.equal(b.disposition, -100);
    });
});

describe('a bribery-immune NPC: the model is the only authority', () => {
    // TWO READINGS OF `bribeable: false` LIVE IN THE CODEBASE, and reconciling
    // them is Caelan's call, not Claude's:
    //   disposition-curves.js — "gold buys no affection at all, but gifts still
    //     land" (pinned deliberately, "gifts stay the clever path")
    //   give-action.js:80     — applyGive returns accepted:false for ANY item,
    //     "bribery-immune NPCs reject all offerings"
    //
    // An earlier pass added a commitBlocker refusal on the give-action reading,
    // which made the METER and the BUTTON disagree: resolveOffer projected +25
    // and two band changes for an offer the button refused. That rule is gone.
    // The model now decides alone, so what the player is shown is what happens
    // — and gold to such a partner is accepted, buys nothing, and _logOffer
    // says so, which is not the silent +0 decision #13 forbids.
    const immune = { type: 'Ghost Fungus', disposition: 0, bribeable: false, gold: 50 };
    const ctx = { playerGold: 100, npcGold: 50 };

    test('gold buys nothing from them, and is not refused', () => {
        const bribe = { give: [], take: [], gold: 60 };
        assert.equal(commitBlocker(immune, bribe, ctx), null);
        assert.equal(resolveOffer(immune, bribe).fromGold, 0, 'gold bought affection');
    });

    test('a gift still lands, per disposition-curves', () => {
        const gift = { give: [{ def: ITEMS.soap, count: 1 }], take: [], gold: 0 };
        assert.equal(commitBlocker(immune, gift, ctx), null);
        assert.ok(resolveOffer(immune, gift).fromItems > 0, 'the gift bought nothing');
    });

    test('WHAT THE METER PROJECTS IS WHAT THE BUTTON ALLOWS', () => {
        // The invariant offer.js's header claims and the removed rule broke.
        for (const o of [
            { give: [], take: [], gold: 60 },
            { give: [{ def: ITEMS.soap, count: 2 }], take: [], gold: 0 },
            { give: [{ def: ITEMS.soap, count: 1 }], take: [], gold: 30 },
        ]) {
            const R = resolveOffer(immune, o);
            const blocked = commitBlocker(immune, o, ctx);
            assert.ok(!(R.points > 0 && blocked),
                `projected +${R.points} while the button said "${blocked}"`);
        }
    });

    test('an ordinary NPC still accepts a gift', () => {
        const ok = { type: 'puck', disposition: 40, bribeable: true, gold: 50 };
        const gift = { give: [{ def: ITEMS.soap, count: 1 }], take: [], gold: 0 };
        assert.equal(commitBlocker(ok, gift, ctx), null);
    });
});

// ── the open partner holds still ──────────────────────────────────

describe('disposition decay and the open offer screen', () => {
    const tickDecay = liveMethod('_tickDispositionDecay', '',
        { DISPOSITION_DECAY_STEP: liveConst('DISPOSITION_DECAY_STEP') });

    const townsfolk = () => ([
        { type: 'a', disposition: 40, restingDisposition: 0, entity: alive },
        { type: 'b', disposition: -30, restingDisposition: 0, entity: alive },
        { type: 'c', disposition: 40, restingDisposition: 0, entity: alive },
    ]);

    test('the rest of the town keeps drifting toward resting', () => {
        const g = stubGame({ enemies: townsfolk() });
        tickDecay.call(g);
        assert.deepEqual(g.enemies.map(e => e.disposition), [39, -29, 39]);
    });

    test('the partner whose screen is OPEN holds still', () => {
        // Caelan's call: the world stays alive while you shop, but the prices in
        // front of you and whether MAKE THE OFFER is armed cannot move under
        // your hands while you are deciding.
        const g = stubGame({ enemies: townsfolk() });
        g._offerNpc = g.enemies[1];
        tickDecay.call(g);
        assert.deepEqual(g.enemies.map(e => e.disposition), [39, -30, 39],
            'the open partner drifted, or the rest of the town froze with it');
    });

    test('with no screen open nothing is exempt', () => {
        const g = stubGame({ enemies: townsfolk(), _offerNpc: null });
        tickDecay.call(g);
        assert.deepEqual(g.enemies.map(e => e.disposition), [39, -29, 39]);
    });

    test('an ally is still exempt, and the exemption is not what freezes the partner', () => {
        const es = townsfolk();
        es[0]._ally = true;
        const g = stubGame({ enemies: es });
        g._offerNpc = es[2];
        tickDecay.call(g);
        assert.deepEqual(es.map(e => e.disposition), [40, -29, 40]);
    });
});

// -- the give spine (Task 17) -----------------------------------------------
//
// The retired give path routed every hand-off through reactToTransaction, which
// owns the special cases the barter model cannot express. _commitOffer replaced
// that path and did not inherit it, so these were silently dead on the new
// screen until Task 17 -- and nothing failed, because nothing tested them.

// -- the economy holds (review findings 1-3) --------------------------------
//
// Every test here failed when it was written. They are the three ways the
// commit path could mint or destroy value, all found by a max-effort review
// after the branch was called done, and all invisible to the suite until the
// _addToInventory and _buybackList stubs above became the real functions.

describe('a full bag never costs the player anything', () => {
    const commit = commitOfferFull;
    const vendor = () => ({ id: 'puck', type: 'puck', vendor: true, disposition: 40, gold: 200,
                            entity: alive, stock: ['bandage'], values: {}, behavior: ['IDLE'] });
    // 50 distinct defs would be ideal; 50 full stacks of one is equivalent for
    // addToInventory, which only merges below maxStack.
    const fullBag = () => new Array(INVENTORY_SIZE).fill(null)
        .map(() => ({ itemDef: ITEMS.rock, count: MAX_STACK }));

    test('the bag really is full', () => {
        const inv = fullBag();
        assert.equal(addToInventory(inv, ITEMS.bandage,
            { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK }), false);
    });

    test('BUYING INTO A FULL BAG DOES NOT TAKE THE GOLD', () => {
        const g = stubGame({ gold: 500, inventory: fullBag() });
        const npc = vendor();
        openOffer.call(g, npc);
        offerActivate.call(g, 'theirs', 0);
        commit.call(g);
        assert.equal(g.gold, 500, 'the player paid for goods they never received');
        assert.equal(npc.gold, 200, 'the vendor was paid for goods they still have');
    });

    test('TAKING INTO A FULL BAG DOES NOT DESTROY THE CHEST CONTENTS', () => {
        // The worse half: there is no gold trail, the item just leaves the world.
        const g = stubGame({ inventory: fullBag() });
        const shim = chestShim(['rock', 'soap']);
        openOffer.call(g, shim);
        offerActivate.call(g, 'theirs', 1);
        commit.call(g);
        assert.deepEqual(shim._container.contents, ['rock', 'soap'],
            'the chest was emptied into a bag that refused the item');
    });

    test('the refusal is spoken, not silent', () => {
        const g = stubGame({ gold: 500, inventory: fullBag() });
        openOffer.call(g, vendor());
        offerActivate.call(g, 'theirs', 0);
        commit.call(g);
        assert.match(g.logs.at(-1).msg, /bag is full/i,
            `no refusal line: ${g.logs.at(-1).msg}`);
    });

    test('a partly-full bag still completes normally', () => {
        const inv = new Array(INVENTORY_SIZE).fill(null);
        inv[0] = { itemDef: ITEMS.rock, count: 1 };
        const g = stubGame({ gold: 500, inventory: inv });
        const npc = vendor();
        openOffer.call(g, npc);
        offerActivate.call(g, 'theirs', 0);
        const price = g._offer.gold;
        commit.call(g);
        assert.equal(g.gold, 500 - price);
        assert.ok(g.inventory.some(sl => sl && sl.itemDef.id === 'bandage'), 'the bandage never landed');
    });
});

describe('the buyback shelf is an undo, not a duplicator', () => {
    const commit = commitOfferFull;
    const withLedger = (g, npc) => {
        // Sell one soap the ordinary way, which is what stocks the shelf.
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        commit.call(g);
    };
    const vendor = () => ({ id: 'puck', type: 'puck', vendor: true, disposition: 40, gold: 500,
                            entity: alive, stock: [], values: {}, behavior: ['IDLE'] });
    const bag = (n = 1) => {
        const inv = new Array(INVENTORY_SIZE).fill(null);
        inv[0] = { itemDef: ITEMS.soap, count: n };
        return inv;
    };

    test('selling puts one credit on the shelf', () => {
        const g = stubGame({ gold: 100, inventory: bag() });
        const npc = vendor();
        withLedger(g, npc);
        assert.ok(npc._buyback, 'no ledger');
        assert.deepEqual(npc._buyback.entries.soap.rebuy.length, 1);
        assert.equal(theirsList.call(g).filter(e => e.source === 'buyback').length, 1);
    });

    test('BUYING BACK CONSUMES THE CREDIT — THE SHELF EMPTIES', () => {
        const g = stubGame({ gold: 100, inventory: bag() });
        const npc = vendor();
        withLedger(g, npc);
        g.state = STATE.IDLE; openOffer.call(g, npc);
        const row = theirsList.call(g).findIndex(e => e.source === 'buyback');
        assert.ok(row >= 0, 'setup: no buyback row');
        offerActivate.call(g, 'theirs', row);
        commit.call(g);
        assert.equal(npc._buyback.entries.soap.rebuy.length, 0,
            'the credit survived the re-buy — the row can be bought again');
        g.state = STATE.IDLE; openOffer.call(g, npc);
        assert.equal(theirsList.call(g).filter(e => e.source === 'buyback').length, 0,
            'the shelf still offers a row whose credit is spent');
    });

    test('ONE SOLD ITEM CANNOT BECOME FOUR', () => {
        const g = stubGame({ gold: 1000, inventory: bag() });
        const npc = vendor();
        withLedger(g, npc);
        for (let i = 0; i < 4; i++) {
            g.state = STATE.IDLE; openOffer.call(g, npc);
            const row = theirsList.call(g).findIndex(e => e.source === 'buyback');
            if (row < 0) break;
            offerActivate.call(g, 'theirs', row);
            commit.call(g);
        }
        const soap = g.inventory.reduce((n, sl) => n + (sl && sl.itemDef.id === 'soap' ? sl.count : 0), 0);
        assert.equal(soap, 1, `one sold soap came back as ${soap}`);
    });

    test('AN UNDO COSTS WHAT YOU WERE PAID, NOT THE MARKET RATE', () => {
        const g = stubGame({ gold: 1000, inventory: bag() });
        const npc = vendor();
        withLedger(g, npc);
        const paidToPlayer = 1000 - g.gold;     // negative: the player GAINED
        const afterSale = g.gold;
        g.state = STATE.IDLE; openOffer.call(g, npc);
        const row = theirsList.call(g).findIndex(e => e.source === 'buyback');
        offerActivate.call(g, 'theirs', row);
        commit.call(g);
        const cost = afterSale - g.gold;
        assert.equal(cost, -paidToPlayer,
            `sold for ${-paidToPlayer}, bought back for ${cost} — main.js:101 promises they match`);
    });

    test('a gift to a vendor does not become permanent re-purchasable stock', () => {
        const g = stubGame({ gold: 100, inventory: bag() });
        const npc = vendor();
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        g._offer.gold = 0;                       // an outright gift
        commit.call(g);
        const shelf = (npc._buyback && npc._buyback.entries.soap)
            ? npc._buyback.entries.soap.rebuy.length : 0;
        assert.equal(shelf, 0, 'a gift minted a buyback credit — the vendor can now resell it forever');
    });
});

// -- generosity is reachable (review finding 3) -----------------------------
//
// The balance auto-settles to zero as you stage; the spec's whole model then
// says "the player DELIBERATELY drags it off zero". That control was never
// built, so _offer.gold could only ever hold settledGold's answer, every offer
// committed at balance 0, R.points was always 0, and applyDispositionDelta
// never fired. Above the trade floor the entire goodwill/resentment system --
// the centrepiece of the feature -- was unreachable.
//
// It was invisible because the browser demo of it set _offer.gold = 0 from the
// console first, which no player can do.

describe('the player can refuse the settled gold', () => {
    const commit = commitOfferFull;
    const puckish = () => ({ id: 'puck', type: 'puck', vendor: true, disposition: 40, gold: 400,
                             entity: alive, stock: ['bandage'], values: { soap: 4 }, behavior: ['IDLE'] });
    const withSoap = (n = 2) => {
        const inv = new Array(INVENTORY_SIZE).fill(null);
        inv[0] = { itemDef: ITEMS.soap, count: n };
        return inv;
    };

    test('staging a sale settles the gold, as before', () => {
        const g = stubGame({ gold: 100, inventory: withSoap() });
        openOffer.call(g, puckish());
        offerActivate.call(g, 'yours', 0);
        assert.ok(g._offer.gold < 0, 'the vendor should owe the player for a sale');
    });

    test('TAPPING THE GOLD CHIP REFUSES THE PAYMENT, TURNING A SALE INTO A GIFT', () => {
        const g = stubGame({ gold: 100, inventory: withSoap() });
        const npc = puckish();
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        // the chip sits in whichever tray the sign puts it -- for a sale, take.
        offerActivate.call(g, 'takeTray', g._offer.take.length);
        assert.equal(g._offer.gold, 0, 'the payment was not refused');
        const R = resolveOffer(npc, g._offer);
        assert.ok(R.points > 0, `a refused payment should buy goodwill, got ${R.points}`);
    });

    test('AND THE GIFT ACTUALLY MOVES DISPOSITION ON COMMIT', () => {
        const g = stubGame({ gold: 100, inventory: withSoap() });
        const npc = puckish();
        const before = npc.disposition;
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        offerActivate.call(g, 'takeTray', g._offer.take.length);
        commit.call(g);
        assert.ok(npc.disposition > before,
            `a gift committed at disposition ${before} -> ${npc.disposition}`);
    });

    test('a refused payment survives staging another item', () => {
        // Settling is the default; once the player has decided otherwise, a
        // later stage must not silently re-settle over their choice.
        const g = stubGame({ gold: 100, inventory: withSoap(3) });
        openOffer.call(g, puckish());
        offerActivate.call(g, 'yours', 0);
        offerActivate.call(g, 'takeTray', g._offer.take.length);
        assert.equal(g._offer.gold, 0);
        offerActivate.call(g, 'yours', 0);           // a second soap
        assert.equal(g._offer.gold, 0, 'staging re-settled over the player\u2019s decision');
        assert.equal(g._offer.give[0].count, 2);
    });

    test('tapping again restores the settled amount', () => {
        const g = stubGame({ gold: 100, inventory: withSoap() });
        const npc = puckish();
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        const settled = g._offer.gold;
        offerActivate.call(g, 'takeTray', g._offer.take.length);
        assert.equal(g._offer.gold, 0);
        offerActivate.call(g, 'takeTray', g._offer.take.length);
        assert.equal(g._offer.gold, settled, 'the toggle does not come back');
    });

    test('refusing to PAY is the same gesture, and reads as a lowball', () => {
        const g = stubGame({ gold: 500, inventory: new Array(INVENTORY_SIZE).fill(null) });
        const npc = puckish();
        openOffer.call(g, npc);
        offerActivate.call(g, 'theirs', 0);          // buy a bandage; gold settles positive
        assert.ok(g._offer.gold > 0);
        offerActivate.call(g, 'giveTray', g._offer.give.length);
        assert.equal(g._offer.gold, 0, 'the payment was not withheld');
        const R = resolveOffer(npc, g._offer);
        assert.ok(R.points < 0, `taking without paying should cost disposition, got ${R.points}`);
    });

    test('the chip is not a tray slot — it never unstages an item', () => {
        const g = stubGame({ gold: 100, inventory: withSoap() });
        openOffer.call(g, puckish());
        offerActivate.call(g, 'yours', 0);
        const before = g._offer.give[0].count;
        offerActivate.call(g, 'takeTray', g._offer.take.length);
        assert.equal(g._offer.give[0].count, before, 'tapping the coin unstaged an item');
    });
});

// -- the bag is reachable on touch (review finding 4) -----------------------
//
// The spec's opening complaint about the OLD screen was "only 15 of 50 bag
// slots are reachable". The new one drew a proportional scrollbar thumb and
// gave it no pointer path at all: _tapOffer only READ scroll, the wheel handler
// was gated to STATE.DIALOGUE, and there was no drag. On touch, rows 7-50 had
// no way to be reached -- the exact defect the feature was written to fix.

describe('the whole bag is reachable with a pointer', () => {
    const bigBag = () => {
        const inv = new Array(INVENTORY_SIZE).fill(null);
        const ids = ['rock', 'soap', 'bandage', 'hot_dog', 'pipe'];
        for (let i = 0; i < 40; i++) inv[i] = { itemDef: ITEMS[ids[i % ids.length]], count: 1 };
        return inv;
    };
    const vendor = () => ({ id: 'p', type: 'p', vendor: true, disposition: 40, gold: 400,
                            entity: alive, stock: [], values: {}, behavior: ['IDLE'] });
    const open = () => {
        const g = stubGame({ gold: 100, inventory: bigBag() });
        openOffer.call(g, vendor());
        return g;
    };

    test('the bag really does overflow the visible rows', () => {
        const g = open();
        assert.ok(yoursList.call(g).length > OFFER_ROWS_VISIBLE,
            'setup: the bag must be longer than the viewport');
    });

    test('A TAP ON THE SCROLL TRACK PAGES THE LIST', () => {
        const g = open();
        const L = offerLayout(MODAL_RECT);
        const tr = L.yoursScrollTrack;
        assert.equal(g._offer.scroll.yours, 0);
        tapOffer.call(g, { x: tr.x + 1, y: tr.y + tr.h - 4 });   // low on the track = down
        assert.ok(g._offer.scroll.yours > 0, 'a tap low on the track did not page down');
    });

    test('and pages back up', () => {
        const g = open();
        const L = offerLayout(MODAL_RECT);
        const tr = L.yoursScrollTrack;
        tapOffer.call(g, { x: tr.x + 1, y: tr.y + tr.h - 4 });
        const down = g._offer.scroll.yours;
        tapOffer.call(g, { x: tr.x + 1, y: tr.y + 2 });          // high on the track = up
        assert.ok(g._offer.scroll.yours < down, 'a tap high on the track did not page up');
    });

    test('paging reaches the last row and stops there', () => {
        const g = open();
        const L = offerLayout(MODAL_RECT);
        const tr = L.yoursScrollTrack;
        const len = yoursList.call(g).length;
        for (let i = 0; i < 40; i++) tapOffer.call(g, { x: tr.x + 1, y: tr.y + tr.h - 4 });
        assert.equal(g._offer.scroll.yours, len - OFFER_ROWS_VISIBLE,
            'scroll did not stop at the last full page');
        for (let i = 0; i < 40; i++) tapOffer.call(g, { x: tr.x + 1, y: tr.y + 2 });
        assert.equal(g._offer.scroll.yours, 0, 'scroll did not stop at the top');
    });

    test('the partner column scrolls on its own track', () => {
        const g = stubGame({ gold: 100, inventory: new Array(INVENTORY_SIZE).fill(null) });
        const npc = vendor();
        npc.stock = ['rock','soap','bandage','hot_dog','pipe','rock','soap','bandage'];
        openOffer.call(g, npc);
        const L = offerLayout(MODAL_RECT);
        const tr = L.theirsScrollTrack;
        tapOffer.call(g, { x: tr.x + 1, y: tr.y + tr.h - 4 });
        assert.ok(g._offer.scroll.theirs > 0, 'their column did not scroll');
        assert.equal(g._offer.scroll.yours, 0, 'their track scrolled the satchel');
    });

    test('a track tap never stages or closes', () => {
        const g = open();
        const L = offerLayout(MODAL_RECT);
        const tr = L.yoursScrollTrack;
        tapOffer.call(g, { x: tr.x + 1, y: tr.y + tr.h - 4 });
        assert.deepEqual(g._offer.give, [], 'a scroll tap staged an item');
        assert.equal(g.state, STATE.TRADE, 'a scroll tap closed the screen');
    });

    test('A COMMIT RE-CLAMPS A COLUMN WHOSE LIST JUST SHRANK', () => {
        // Sell most of the bag from the bottom of a scrolled list: the list gets
        // shorter than the scroll offset, and every visible row draws EMPTY over
        // a bag that still holds items.
        const inv = new Array(INVENTORY_SIZE).fill(null);
        for (let i = 0; i < 12; i++) inv[i] = { itemDef: ITEMS.rock, count: 1 };
        const g = stubGame({ gold: 100, inventory: inv });
        const npc = { id: 'p', type: 'p', vendor: true, disposition: 40, gold: 900,
                      entity: alive, stock: [], values: {}, behavior: ['IDLE'] };
        openOffer.call(g, npc);
        g._offer.scroll.yours = 6;
        for (let i = 0; i < 8; i++) offerActivate.call(g, 'yours', 6 + (i % 6));
        commitOfferFull.call(g);
        const len = yoursList.call(g).length;
        assert.ok(g._offer.scroll.yours <= Math.max(0, len - OFFER_ROWS_VISIBLE),
            `scroll ${g._offer.scroll.yours} is past the end of a ${len}-row list`);
        const shown = yoursList.call(g).slice(g._offer.scroll.yours, g._offer.scroll.yours + OFFER_ROWS_VISIBLE);
        assert.ok(len === 0 || shown.length > 0, 'the column drew empty over a bag that still has items');
    });

    test('a short list has no scroll and the track ignores taps', () => {
        const inv = new Array(INVENTORY_SIZE).fill(null);
        inv[0] = { itemDef: ITEMS.rock, count: 1 };
        const g = stubGame({ gold: 100, inventory: inv });
        openOffer.call(g, vendor());
        const L = offerLayout(MODAL_RECT);
        const tr = L.yoursScrollTrack;
        tapOffer.call(g, { x: tr.x + 1, y: tr.y + tr.h - 4 });
        assert.equal(g._offer.scroll.yours, 0, 'a one-row list scrolled');
    });
});

describe('the give spine survives the unified screen', () => {
    const commit = commitOfferFull;
    const fare = () => Object.values(ITEMS).find(d => d.sewerFare);
    // The penalty is a flat base plus whatever credit the item WOULD have
    // earned, so the starting disposition decides whether it crosses -threshold.
    // At 20 a townsperson lands on -20 and stays merely disgusted; the trap
    // needs them to reach -30.
    const dweller = () => ({ id: 'e1', type: 'Violet Fungus', sewerDweller: true, vendor: false,
                             disposition: -30, flipThreshold: 25, bribeable: true,
                             values: { [fare().id]: 3 }, gold: 10, giftLog: [],
                             hp: 25, entity: alive });
    const townie = () => ({ id: 't1', type: 'Violencian', vendor: false, disposition: 0,
                            flipThreshold: 30, bribeable: true, values: {}, gold: 10,
                            giftLog: [], hp: 30, entity: alive });

    test('there IS a sewer-fare item to test with', () => {
        assert.ok(fare(), 'no sewerFare item in ITEMS');
    });

    test('a townsperson merely disgusted by it does NOT turn - the trap has a threshold', () => {
        const g = stubGame({ inventory: [{ itemDef: fare(), count: 1 }] });
        const npc = townie();
        npc.disposition = 20;                    // -40 lands on -20, short of -30
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        g._offer.gold = 0;
        commit.call(g);
        assert.ok(!isHostile(npc), 'the trap fired below its own threshold');
        assert.equal(npc.disposition, -20, 'the penalty did not land');
    });

    test('SEWER FARE FED TO A NON-DWELLER TURNS THEM HOSTILE AND CLOSES THE SCREEN', () => {
        // The trap the spec names, which could not fire at all while the spine
        // was bypassed: the model priced a tunnel mushroom like any other snack
        // and converted it to goodwill.
        const f = fare();
        const g = stubGame({ inventory: [{ itemDef: f, count: 1 }] });
        const npc = townie();
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        g._offer.gold = 0;
        commit.call(g);
        assert.ok(isHostile(npc), 'feeding a townsperson sewer fare left them friendly');
        assert.equal(g.state, STATE.IDLE, 'left standing in a hostile partner\u2019s window');
        assert.equal(g._offerNpc, null, 'the basket survived a partner turning on you');
    });

    test('the same item is MEDICINE to a dweller, and does not turn them', () => {
        const f = fare();
        const g = stubGame({ inventory: [{ itemDef: f, count: 1 }] });
        const npc = dweller();
        const before = npc.disposition;
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        g._offer.gold = 0;
        commit.call(g);
        assert.ok(!isHostile(npc), 'a sewer dweller turned on you for feeding it its own food');
        assert.ok(npc.disposition > before, 'medicine bought no goodwill');
    });

    test('an ordinary gift still settles through the offer model', () => {
        const g = stubGame({ inventory: [{ itemDef: ITEMS.soap, count: 2 }] });
        const npc = townie();
        npc.values = { soap: 4 };
        const before = npc.disposition;
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        offerActivate.call(g, 'yours', 0);
        g._offer.gold = 0;
        commit.call(g);
        assert.ok(npc.disposition > before,
            `an ordinary gift moved nothing: ${before} -> ${npc.disposition}`);
        assert.ok(!isHostile(npc));
    });

    test('every hand-off is remembered in giftLog', () => {
        const g = stubGame({ inventory: [{ itemDef: ITEMS.soap, count: 2 }] });
        const npc = townie();
        npc.values = { soap: 4 };
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        offerActivate.call(g, 'yours', 0);
        g._offer.gold = 0;
        commit.call(g);
        assert.equal(npc.giftLog.length, 2, `giftLog: ${JSON.stringify(npc.giftLog)}`);
        assert.deepEqual(npc.giftLog[0], { type: 'give', itemId: 'soap', gold: null });
    });

    test('EVERY UNIT OF FARE IS ACCOUNTED FOR, not just the first', () => {
        // The give loop removes e.count units; a single `find` + one reaction
        // meant two of three sludge sacks vanished with no effect and no log.
        const f = Object.values(ITEMS).find(d => d.sewerFare);
        const inv = new Array(INVENTORY_SIZE).fill(null);
        inv[0] = { itemDef: f, count: 3 };
        const g = stubGame({ inventory: inv });
        const npc = townie();
        npc.disposition = 20;                    // -40 per unit; turns on the first
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        offerActivate.call(g, 'yours', 0);
        offerActivate.call(g, 'yours', 0);
        assert.equal(g._offer.give[0].count, 3, 'setup: three staged');
        g._offer.gold = 0;
        commit.call(g);
        // Either they turned partway through (and the rest is moot) or every
        // unit landed -- what must NOT happen is one reaction for three items.
        const fareEntries = npc.giftLog.filter(e => e.itemId === f.id).length;
        assert.ok(isHostile(npc) || fareEntries === 3,
            `three units handed over, ${fareEntries} accounted for, hostile=${isHostile(npc)}`);
    });

    test('A MIXED OFFER STILL PRINTS ITS LEDGER LINE', () => {
        // Suppressing _logOffer whenever any fare was present meant a basket of
        // gold and goods moved in full and printed only the poisoning.
        const f = Object.values(ITEMS).find(d => d.sewerFare);
        const inv = new Array(INVENTORY_SIZE).fill(null);
        inv[0] = { itemDef: f, count: 1 };
        inv[1] = { itemDef: ITEMS.soap, count: 1 };
        const g = stubGame({ gold: 200, inventory: inv });
        const npc = townie();
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        offerActivate.call(g, 'yours', 1);
        g._offer.gold = 0;
        commit.call(g);
        assert.ok(g.logs.some(l => /You hand/.test(l.msg)),
            `no ledger line for a mixed offer: ${g.logs.map(l => l.msg).join(' | ')}`);
    });

    test('the fare is logged ONCE, not by both writers', () => {
        // reactToTransaction writes its own giftLog entry, so recording the fare
        // row in _commitOffer too logged one sludge sack twice.
        const f = Object.values(ITEMS).find(d => d.sewerFare);
        const g = stubGame({ inventory: [{ itemDef: f, count: 1 }] });
        const npc = townie();
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        g._offer.gold = 0;
        commit.call(g);
        const fareEntries = npc.giftLog.filter(e => e.itemId === f.id);
        assert.equal(fareEntries.length, 1, `logged twice: ${JSON.stringify(npc.giftLog)}`);
    });

    test('an ordinary item beside the fare is still logged', () => {
        const f = Object.values(ITEMS).find(d => d.sewerFare);
        const g = stubGame({ inventory: [{ itemDef: f, count: 1 }, { itemDef: ITEMS.soap, count: 1 }] });
        const npc = townie();
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        offerActivate.call(g, 'yours', 1);
        g._offer.gold = 0;
        commit.call(g);
        assert.ok(npc.giftLog.some(e => e.itemId === 'soap'), JSON.stringify(npc.giftLog));
        assert.equal(npc.giftLog.filter(e => e.itemId === f.id).length, 1);
    });

    test('gold handed over is remembered too', () => {
        const g = stubGame({ gold: 100 });
        const npc = townie();
        openOffer.call(g, npc);
        g._offer.gold = 25;
        commit.call(g);
        assert.ok(npc.giftLog.some(e => e.gold === 25), `giftLog: ${JSON.stringify(npc.giftLog)}`);
    });
});

describe('a de-vendored NPC has no till to browse', () => {
    test('being struck clears the stock with the flag', () => {
        // The offer screen lists npc.stock without gating on npc.vendor, so a
        // de-vendored NPC keeping their stock keeps a browsable till.
        const harmed = liveMethod('_onEntityHarmed', 'target, { kind = \'attack\' } = {}',
            { isHostile });
        const g = stubGame();
        const npc = { type: 'Merchant', vendor: true, stock: ['soap', 'bandage'],
                      disposition: 40, entity: alive, allegiance: 'neutral' };
        harmed.call(g, npc, {});
        assert.equal(npc.vendor, false);
        assert.equal(npc.stock, null, 'a struck vendor kept a stock nobody can buy from');
    });

    test('A VENDOR POISONED INTO HOSTILITY LOSES THEIR TILL TOO', () => {
        // The other de-vendoring site, in give-action.js. Feeding a shopkeeper
        // sewer fare turns them on you -- and if their stock survived that, the
        // offer screen would still list a till they no longer keep.
        const f = Object.values(ITEMS).find(d => d.sewerFare);
        const g = stubGame({ inventory: [{ itemDef: f, count: 1 }] });
        const npc = { id: 'v1', type: 'Merchant', vendor: true, stock: ['soap', 'bandage'],
                      disposition: 0, flipThreshold: 30, bribeable: true, values: {},
                      gold: 50, giftLog: [], hp: 30, entity: alive };
        openOffer.call(g, npc);
        offerActivate.call(g, 'yours', 0);
        g._offer.gold = 0;
        commitOfferFull.call(g);
        assert.ok(isHostile(npc), 'the poisoned vendor stayed friendly');
        assert.equal(npc.vendor, false);
        assert.equal(npc.stock, null, 'a poisoned vendor kept a till nobody can shop at');
    });

    test('and an emptied stock shows no rows', () => {
        const g = stubGame();
        g._offerNpc = { type: 'Merchant', vendor: false, stock: null, disposition: 40, entity: alive };
        assert.deepEqual(theirsList.call(g), []);
    });
});

// ── reaching a chest at all (Task 16) ─────────────────────────────

describe('_targetAt resolves containers', () => {
    const targetAt = liveMethod('_targetAt', 'x, y');
    const world = (over = {}) => stubGame({
        enemies: [], groundItems: [], examinables: [], containers: [],
        map: { getTile: () => 0, isWalkable: () => true },
        ...over,
    });
    const crate = { type: 'crate', x: 6, y: 5, contents: ['rock'] };

    test('a chest tile is a target — it was not one before, so touch could not open it', () => {
        const g = world({ containers: [crate] });
        const t = targetAt.call(g, 6, 5);
        assert.ok(t, 'a chest tile still resolves to nothing');
        assert.equal(t.container, crate);
    });

    test('bare ground is still not a target', () => {
        assert.equal(targetAt.call(world(), 6, 5), null);
    });

    test('the container rides alongside an NPC rather than replacing them', () => {
        const npc = { x: 6, y: 5, entity: alive, type: 'gus' };
        const t = targetAt.call(world({ containers: [crate], enemies: [npc] }), 6, 5);
        assert.equal(t.npc, npc);
        assert.equal(t.container, crate);
    });

    test('a chest somewhere else is not picked up', () => {
        const t = targetAt.call(world({ containers: [crate] }), 9, 9);
        assert.equal(t, null);
    });

    test('the Open verb actually opens the container', () => {
        // A source pin: _fireResolver is a large switch with a dozen free
        // variables, so lifting it whole to exercise one case costs more than it
        // proves. The behaviour was verified in the live game -- tapping a crate
        // opens the offer screen on its shim.
        assert.ok(/case 'open':\s+if \(t\.container\) this\._openContainer\(t\.container\);/.test(mainSrc),
            "the 'open' verb no longer reaches _openContainer");
    });
});

// ── the wiring itself, asserted against the source ──────────────────────────
//
// These are source-level because the paths they protect live in a keydown
// switch and a pointer router that liveMethod cannot lift in isolation. They
// are narrow on purpose: each pins one edit the audit found the plan omitting.

describe('the wiring', () => {
    test('_openOffer is the only thing that enters STATE.TRADE', () => {
        const entries = mainSrc.match(/state = STATE\.TRADE/g) || [];
        // Exactly one now: _openOffer. The retired _openTrade was the second,
        // and Task 15 deleted it.
        assert.equal(entries.length, 1,
            'a path enters STATE.TRADE without going through _openOffer');
        assert.ok(/_openOffer\(shim\)/.test(mainSrc),
            '_openContainer no longer hands its shim to _openOffer');
        assert.ok(!/this\._tradeNpc = \{/.test(mainSrc),
            '_openContainer still builds its shim onto the retired _tradeNpc');
    });

    test('every close path out of the offer screen is _closeOffer', () => {
        // Four exits, not one: the TRADE keyboard block, the universal Cancel
        // hook, the pointer router, and RESTART.
        assert.ok(/KeyE' \|\| e\.code === 'Escape'\) \{ this\._closeOffer\(\)/.test(mainSrc),
            'the E / Escape key inside the trade block still calls _closeTrade');
        assert.ok(/case STATE\.TRADE:\s+this\._closeOffer\(\); return true;/.test(mainSrc),
            '_closeCurrentMenu still routes TRADE to _closeTrade');
        assert.ok(/state === STATE\.TRADE\) \{ this\._tapOffer\(pt\); return; \}/.test(mainSrc),
            'pointer events in TRADE still route to _tapTrade');
        assert.ok(/_fullReset\(\) \{[\s\S]{0,600}?this\._closeOffer\(\);/.test(mainSrc),
            'RESTART leaves the offer screen open and the basket alive');
    });

    test('no entry point still opens the retired trade window', () => {
        const calls = (mainSrc.match(/this\._openTrade\(/g) || []).length;
        assert.equal(calls, 0, `${calls} call site(s) still open the old trade window`);
    });

    test('the partner column prices a container at zero, not like a shop', () => {
        // offerBalance charges 0 for a container's contents. _drawOfferColumn
        // would otherwise price them at buyPrice(def, 100) -- the shim's benign
        // disposition -- putting a real number beside every row of loot the
        // ledger then hands over for nothing. A source pin because the price
        // function is a closure inside a canvas draw; the behaviour it protects
        // is checked by eye in the browser pass.
        const rendererSrc = readFileSync(fileURLToPath(new URL('../game/renderer.js', import.meta.url)), 'utf8');
        assert.ok(/npc\._container \? 0/.test(rendererSrc),
            'the partner column no longer prices a container at zero');
        // and a row carrying its own locked price still beats the market rate
        assert.ok(/entry && entry\.price != null \? entry\.price/.test(rendererSrc),
            'a buyback row no longer draws its locked price');
    });

    test('a REFUSED offer gets the ghost outline without the fill', () => {
        // Filled, the projection promises a consequence that is not going to
        // happen -- drawn identically whether they will take the bad deal or
        // have just refused it. A source pin: the fill is a canvas call inside
        // a draw method, and the behaviour it protects is checked by eye.
        const rendererSrc = readFileSync(fileURLToPath(new URL('../game/renderer.js', import.meta.url)), 'utf8');
        assert.ok(/const blocked = game\._offerBlocker \? !!game\._offerBlocker\(\) : false;/.test(rendererSrc),
            'the meter no longer asks whether the offer is blocked');
        assert.ok(/if \(!blocked\) \{[\s\S]{0,220}?ctx\.fillRect\(lo, mb\.y, hi - lo, mb\.h\);[\s\S]{0,40}?\}/.test(rendererSrc),
            'the ghost fill is no longer gated on the offer being unblocked');
    });

    test('the two goods columns sit above the tray each one stages into', () => {
        // Caelan's call: YOUR SATCHEL left over YOU GIVE, their goods right over
        // YOU TAKE, so neither staging motion crosses the panel.
        const L = offerLayout(MODAL_RECT);
        assert.equal(L.yours[0].x, L.giveTray[0].x, 'the satchel no longer sits above the give tray');
        assert.equal(L.theirs[0].x, L.takeTray[0].x, 'their goods no longer sit above the take tray');
        assert.ok(L.yours[0].x < L.theirs[0].x, 'the satchel is meant to be the LEFT column');
    });

    test('the renderer dispatches the offer screen, not the retired modal', () => {
        const rendererSrc = readFileSync(fileURLToPath(new URL('../game/renderer.js', import.meta.url)), 'utf8');
        assert.ok(/state === 'trade'\) this\._drawOfferScreen\(game\)/.test(rendererSrc),
            'renderFrame still draws _drawTradeModal for STATE.TRADE');
        // The close-chip stash must survive a throw inside any modal draw, or a
        // mid-draw exception takes the X chip and tap-outside down with it.
        const dispatchAt = rendererSrc.indexOf("this._drawOfferScreen(game)");
        const finallyAt = rendererSrc.indexOf('} finally {', dispatchAt);
        const stashAt = rendererSrc.indexOf('this._menuPanelRect = CLOSE_PANEL', dispatchAt);
        assert.ok(finallyAt > dispatchAt && stashAt > finallyAt,
            'the CLOSE_PANEL stash is no longer protected from a modal draw throwing');
    });
});
