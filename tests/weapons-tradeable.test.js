// weapons-tradeable.test.js — Task 7. Weapons carry the fields the offer
// screen renders, price on both sides of a trade, and no longer vanish when
// taken off the ground unresolved.
//
// _takeItemAt is a Game method, and Game isn't exported — main.js touches
// `document` at module-evaluation time (the boot() call at the bottom), so
// the whole file throws on import under Node (save-roundtrip.test.js hit the
// same wall and documents it). liveMethod() below works around that without
// a bare regex check on the source text: it extracts the CURRENT method body
// straight out of main.js and turns it into a real, callable function closed
// over the handful of free-variable bindings the body reads outside `this`.
// Calling it against a stub `this` runs the actual production logic — not a
// hand-copied duplicate of it — so a future edit to the real method is what
// this test exercises, not a paraphrase of what it used to do.
//
// A prior version of the ground-take test here anchored on a bare
// `src.indexOf('_takeItemAt(')`, which matches the CALL SITE two methods
// earlier, not the definition — most of its 1400-char budget was spent on an
// unrelated method, and the regex-based assertions it did reach passed for
// several mutants that fully restored the original silent-delete bug. This
// version replaces that with the behavioral tests below.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WEAPONS } from '../game/weapons.js';
import { ITEMS, itemTier } from '../game/items.js';
import { sellPrice, buyPrice } from '../game/trade.js';
import { audio } from '../game/audio.js';
import { xmbCategoryOf, XMB_LABELS } from '../game/xmb.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

// Extract a class method's live source by its exact `name(params) {`
// signature (unique — a call site never repeats the parameter NAMES, only a
// definition does) and slice to its own closing brace: a method body in this
// file closes on `\n    }` at the 4-space class-member indent. Returns a real
// function closed over `freeVars`, the free (non-`this`) identifiers the body
// reads — pass in anything the OLD, buggy shape of the method might reference
// too (e.g. ITEMS), not just what the current fix uses, so a regression back
// to that shape still runs far enough for the assertions below to catch it,
// rather than merely throwing ReferenceError because a name was withheld.
function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const freeNames = Object.keys(freeVars);
    const factory = new Function(...freeNames, `return function ${body}`);
    return factory(...freeNames.map(n => freeVars[n]));
}

// A stub `this` carrying exactly the state _takeItemAt reads/writes.
function stubGame(overrides = {}) {
    return {
        groundItems: [],
        _collectedItems: new Set(),
        equipment: {},
        _mapUrl: 'test-map',
        logs: [],
        _log(msg, category) { this.logs.push({ msg, category }); },
        _resolveItemDef(id) { return WEAPONS[id] || ITEMS[id] || null; },
        _addToInventory(def) { (this.inventory ??= []).push(def); return true; },
        ...overrides,
    };
}

// The calibrated baseValue/tier per weapon (Step 3). Pinned exactly, not just
// "> 0" — a flattened baseValue (e.g. every weapon set to 1) satisfies a bare
// positivity check but would still pass buy/sell; this is what actually
// catches a calibration regression.
const EXPECTED = {
    wooden_sword: { baseValue: 8,  tier: 'green' },
    gator_tail:   { baseValue: 18, tier: 'blue' },
    lion_whip:    { baseValue: 26, tier: 'purple' },
    fearmur:      { baseValue: 28, tier: 'purple' },
    ray_gun:      { baseValue: 45, tier: 'purple' },
};

describe('weapons are first-class tradeable items', () => {
    test('every weapon carries the fields the offer screen renders, at its calibrated value', () => {
        assert.deepEqual(Object.keys(WEAPONS).sort(), Object.keys(EXPECTED).sort(),
            'WEAPONS and EXPECTED have drifted apart — a weapon was added/removed without updating the calibration pin');
        for (const [id, def] of Object.entries(WEAPONS)) {
            assert.equal(typeof def.description, 'string', `${id} has no description`);
            assert.ok(def.description.length > 20, `${id} description is too short to be real`);
            assert.equal(typeof def.name, 'string', `${id} has no name`);
            assert.equal(def.baseValue, EXPECTED[id].baseValue, `${id} baseValue drifted from its calibrated value`);
        }
    });

    test('every weapon prices on both sides of a trade', () => {
        for (const [id, def] of Object.entries(WEAPONS)) {
            assert.ok(sellPrice(def, 0) > 0, `${id} cannot be sold`);
            assert.ok(buyPrice(def, 0) > 0, `${id} cannot be bought`);
        }
    });

    test('every weapon resolves to its calibrated rarity tier', () => {
        for (const [id, def] of Object.entries(WEAPONS)) {
            assert.equal(itemTier(def).key, EXPECTED[id].tier, `${id} tier drifted from its calibrated value`);
        }
    });

    test('no weapon id collides with an item id', () => {
        for (const id of Object.keys(WEAPONS)) {
            assert.equal(ITEMS[id], undefined,
                `${id} exists in both registries — _resolveItemDef would hide one`);
        }
    });
});

describe('_takeItemAt — the ground-take path no longer swallows unresolvable items', () => {
    const takeItemAt = liveMethod('_takeItemAt', 'x, y', { audio, xmbCategoryOf, XMB_LABELS, ITEMS, WEAPONS });

    test('a weapon on the floor resolves and lands in the bag when its slot is taken', () => {
        const g = stubGame({
            groundItems: [{ type: 'lion_whip', x: 3, y: 4 }],
            equipment: { weapon: WEAPONS.wooden_sword },   // slot occupied -> bag, not auto-equip
        });
        takeItemAt.call(g, 3, 4);
        assert.deepEqual(g.groundItems, [], 'lion_whip did not leave the floor');
        assert.ok(g.inventory && g.inventory.includes(WEAPONS.lion_whip), 'lion_whip never reached the bag');
        assert.equal(g.logs.length, 1);
        assert.doesNotMatch(g.logs[0].msg, /won't come loose/);
    });

    test('a weapon on the floor auto-equips into a free slot', () => {
        const g = stubGame({ groundItems: [{ type: 'fearmur', x: 5, y: 5 }] });
        takeItemAt.call(g, 5, 5);
        assert.equal(g.equipment.weapon, WEAPONS.fearmur);
        assert.deepEqual(g.groundItems, []);
    });

    test('an unresolvable id stays on the floor and logs a line, instead of being deleted', () => {
        const g = stubGame({ groundItems: [{ type: 'not_a_real_item_xyz', x: 7, y: 7 }] });
        takeItemAt.call(g, 7, 7);
        assert.equal(g.groundItems.length, 1, 'the unresolvable item was removed from the floor');
        assert.equal(g.groundItems[0].type, 'not_a_real_item_xyz');
        assert.equal(g.logs.length, 1, 'expected exactly one log line');
        assert.match(g.logs[0].msg, /won't come loose/);
    });
});

// _takeItemAt's bare-ITEMS shape had two siblings that hit the same wall
// without the destructive splice: a quest reward or dialogue gift of a
// weapon silently failed (_grantItem), and an examinable granting one fell
// through to plain examine text instead of handing it over
// (_grantFromExaminable). Same liveMethod technique, same reasoning: both
// still take ITEMS as a free var so a regression to the old shape runs
// (and is caught by the assertions), not just ReferenceErrors.
describe('_grantItem — quest/dialogue gifts resolve WEAPONS too', () => {
    const grantItem = liveMethod('_grantItem', 'id, msg', { ITEMS, WEAPONS });

    test('granting a weapon id succeeds and lands in the bag', () => {
        const g = stubGame({ events: [] });
        g.emitGameEvent = (type, payload) => g.events.push({ type, payload });
        g._render = () => {};
        const ok = grantItem.call(g, 'gator_tail', '[You are given a Gator Tail.]');
        assert.equal(ok, true);
        assert.ok(g.inventory && g.inventory.includes(WEAPONS.gator_tail));
        assert.deepEqual(g.events, [{ type: 'item_pickup', payload: { id: 'gator_tail' } }]);
    });

    test('an unresolvable id is refused, not silently swallowed', () => {
        const g = stubGame();
        g.emitGameEvent = () => { throw new Error('should not fire on a refused grant'); };
        g._render = () => { throw new Error('should not render on a refused grant'); };
        const ok = grantItem.call(g, 'not_a_real_item_xyz');
        assert.equal(ok, false);
        assert.equal(g.inventory, undefined, 'nothing should have reached the bag');
    });
});

describe('_grantFromExaminable — an examinable granting a weapon resolves it', () => {
    const grantFromExaminable = liveMethod('_grantFromExaminable', 'target', { audio, ITEMS, WEAPONS });

    test('a weapon-granting examinable adds it to the bag once', () => {
        const g = stubGame();
        const target = { id: 'whip_rack', x: 2, y: 2, grants: 'lion_whip', text: '[You take the whip.]' };
        const handled = grantFromExaminable.call(g, target);
        assert.equal(handled, true);
        assert.ok(g.inventory && g.inventory.includes(WEAPONS.lion_whip));
        assert.ok(g._collectedItems.has('test-map|2|2|lion_whip'));
    });

    test('a second examine after taking it shows spentText, not a re-grant', () => {
        const g = stubGame();
        const target = { id: 'whip_rack', x: 2, y: 2, grants: 'lion_whip', text: '[You take the whip.]', spentText: '[The rack is bare.]' };
        grantFromExaminable.call(g, target);
        const before = g.inventory.length;
        grantFromExaminable.call(g, target);
        assert.equal(g.inventory.length, before, 'a second examine must not grant a second copy');
        assert.equal(g.logs.at(-1).msg, '[The rack is bare.]');
    });

    test('an unresolvable grants id falls through to plain examine text, not a crash', () => {
        const g = stubGame();
        const target = { id: 'mystery_crate', x: 9, y: 9, grants: 'not_a_real_item_xyz', text: '[A locked crate.]' };
        const handled = grantFromExaminable.call(g, target);
        assert.equal(handled, true);
        assert.equal(g.inventory, undefined);
        assert.equal(g.logs.length, 1);
        assert.equal(g.logs[0].msg, '[A locked crate.]');
    });
});
