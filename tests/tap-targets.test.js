// tap-targets.test.js — every tap target, measured in CSS px on two phones and
// the desktop (plans/tl1-tap-target-test.md).
//
// The walk reads only the pure layout functions main.js hit-tests against, so
// what it measures is what a finger has to land on. A target's size is the
// SHORTER side of its drawn rect, without HIT_SLOP (printed beside it for
// reference). Repeated targets (bag slots, offer rows) are one entry each,
// taking their smallest instance.
//
// Two pins:
//   - on each phone, the targets under 44 CSS px are a subset of KNOWN_SMALL,
//     and none of them is smaller than it is today: the list may only shrink;
//   - at 3440x1440 the whole table is pinned as it is today.
//
// Run `node --test tests/tap-targets.test.js` to see the tables.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeViewport } from '../game/viewport.js';
import {
    DOCK, HIT_SLOP, hudLayout, xmbBarLayout, throwRects,
    WHEEL_HUB_R, wheelRingR,
    HOTBAR_SLOT_W, HOTBAR_SLOT_H,
    MODAL_RECT, closeButtonRect, targetListRowRect, itemOverlayRowRect,
    DEVICE_TABS, deviceTabRect, deviceBodyRect, deviceBagSlotRects, inspectorActionRects,
    gearOptionRects, deviceEquipLayout, deviceRingsLayout,
    offerLayout,
} from '../game/layout.js';
import { UNLOCK_ORDER } from '../game/rings.js';

export const APPLE_MIN_CSS = 44;

export const SCREENS = Object.freeze({
    phone375: { cssW: 375, cssH: 812, dpr: 2 },
    phone390: { cssW: 390, cssH: 844, dpr: 3 },
    desktop:  { cssW: 3440, cssH: 1440, dpr: 1 },
});

// The viewport exactly as main.js builds it for the live canvas.
export function viewportFor(screen) {
    return computeViewport({ ...screen, dock: DOCK });
}

// An item bar with three columns, the first long enough to overflow its row so
// the ▲/▼ arrows exist. Sizes do not depend on what the items are.
function fakeBar() {
    const items = (n, p) => Array.from({ length: n }, (_, i) => ({ itemDef: { id: `${p}${i}` }, slot: i, count: 1 }));
    return { columns: [
        { key: 'a', label: 'A', items: items(12, 'a') },
        { key: 'b', label: 'B', items: items(2, 'b') },
        { key: 'c', label: 'C', items: items(1, 'c') },
    ] };
}

const MAX_WHEEL_DEPTH = 2;   // path.length 0..2: the deepest active ring is wheelRingR(2)

// Every tap target as { name, w, h } in LOGICAL px: HUD and world prompts in
// screen space, menus in the 608 menu box. Both convert to CSS the same way,
// because the menu box is drawn at the viewport's scale.
export function walkTargets(vp) {
    const out = [];
    const add = (name, rects) => { for (const r of [].concat(rects)) if (r) out.push({ name, w: r.w, h: r.h }); };

    // The dock and the item bar.
    const hud = hudLayout(vp);
    add('hud.opener', hud.opener);
    add('hud.log', hud.log);
    const lay = xmbBarLayout(fakeBar(), hud.bar, { colIndex: 0, itemIndex: 0 });
    assert.ok(lay.overflow, 'the fake bar must overflow so the arrows are measured');
    add('bar.chip', lay.chips);
    add('bar.cell', lay.items);
    add('bar.up', lay.up);
    add('bar.down', lay.down);

    // The wheel: the hub disc, and the compass band at each depth, from the
    // hub's edge to the active ring's outer edge (its short side is radial).
    add('wheel.hub', { w: 2 * WHEEL_HUB_R, h: 2 * WHEEL_HUB_R });
    for (let d = 0; d <= MAX_WHEEL_DEPTH; d++) {
        const outer = wheelRingR(d)[1];
        add(`wheel.band.d${d}`, { w: (Math.PI / 2) * (WHEEL_HUB_R + outer) / 2, h: outer - WHEEL_HUB_R });
    }

    // The throw prompt around the player's tile.
    add('world.throw', Object.values(throwRects(vp)));

    // Menus, in the 608 box.
    add('menu.close', closeButtonRect(MODAL_RECT));
    add('menu.targetList.row', [0, 1, 2].map(targetListRowRect));
    add('menu.itemOverlay.row', [0, 1, 2].map(itemOverlayRowRect));
    add('menu.hotbar.slot', { w: HOTBAR_SLOT_W, h: HOTBAR_SLOT_H });

    const body = deviceBodyRect();
    add('device.tab', DEVICE_TABS.map((_, i) => deviceTabRect(i)));
    add('device.bagSlot', deviceBagSlotRects(body));
    add('device.inspectorAction', inspectorActionRects(body));
    add('device.gearOption', gearOptionRects(body, 2));
    add('device.equipPlate', deviceEquipLayout(body).slots);
    add('device.ringSocket', deviceRingsLayout(body, { ringTier: UNLOCK_ORDER.length - 1, ringSlots: {} }).sockets);

    const L = offerLayout(MODAL_RECT);
    add('offer.row', [...L.yours, ...L.theirs]);
    add('offer.traySlot', [...L.giveTray, ...L.takeTray]);
    add('offer.button', L.button);
    return out;
}

const r2 = (v) => Math.round(v * 100) / 100;

// One row per target kind, in CSS px, keeping the smallest instance.
export function measure(screen) {
    const vp = viewportFor(screen);
    const per = vp.logicalPerCss;
    const rows = new Map();
    for (const t of walkTargets(vp)) {
        const w = t.w / per, h = t.h / per, min = Math.min(w, h);
        const prev = rows.get(t.name);
        if (!prev || min < prev.min) rows.set(t.name, { name: t.name, w, h, min, slop: min + (2 * HIT_SLOP) / per });
    }
    return [...rows.values()];
}

export function under44(screen) {
    return measure(screen).filter((r) => r.min < APPLE_MIN_CSS);
}

function table(label, screen) {
    const lines = [`${label} (${screen.cssW}x${screen.cssH} @${screen.dpr}x), CSS px, drawn / with slop:`];
    for (const r of measure(screen)) {
        const flag = r.min < APPLE_MIN_CSS ? 'UNDER 44' : 'ok';
        lines.push(`  ${r.name.padEnd(24)} ${String(r2(r.w)).padStart(7)} x ${String(r2(r.h)).padEnd(7)} min ${String(r2(r.min)).padStart(6)} / ${String(r2(r.slop)).padStart(6)}  ${flag}`);
    }
    return lines.join('\n');
}

// Every kind the walk must find, at every screen.
const EXPECTED = [
    'hud.opener', 'hud.log', 'bar.chip', 'bar.cell', 'bar.up', 'bar.down',
    'wheel.hub', 'wheel.band.d0', 'wheel.band.d1', 'wheel.band.d2', 'world.throw',
    'menu.close', 'menu.targetList.row', 'menu.itemOverlay.row', 'menu.hotbar.slot',
    'device.tab', 'device.bagSlot', 'device.inspectorAction', 'device.gearOption',
    'device.equipPlate', 'device.ringSocket',
    'offer.row', 'offer.traySlot', 'offer.button',
];

// Today's targets under 44 CSS px on each phone, with today's size. Later
// slices may delete entries (a target that reached 44) and may raise a size;
// they may not add an entry or lower one.
const TODAY_SMALL = {
    'hud.opener': 36,
    'hud.log': 42,
    'bar.chip': 10,
    'bar.cell': 16,
    'bar.up': 7,
    'bar.down': 7,
    'wheel.hub': 24,
    'wheel.band.d0': 16,
    'wheel.band.d1': 32,
    'world.throw': 16,
    'menu.close': 15,
    'menu.targetList.row': 13,
    'menu.itemOverlay.row': 13,
    'menu.hotbar.slot': 21,
    'device.tab': 15,
    'device.bagSlot': 19,
    'device.inspectorAction': 13,
    'device.gearOption': 13,
    'device.equipPlate': 19.94,
    'device.ringSocket': 17,
    'offer.row': 20,
    'offer.traySlot': 18,
    'offer.button': 20,
};
// Both phones come out at 2 logical px per CSS px today, so their lists match.
// They are kept apart so a slice can shorten one without the other.
const KNOWN_SMALL = {
    phone375: { ...TODAY_SMALL },
    phone390: { ...TODAY_SMALL },
};

// The whole table at 3440x1440, today, as [w, h] in CSS px: phone work must
// leave it alone.
const DESKTOP = {
    'hud.opener': [144, 144],
    'hud.log': [1360, 168],
    'bar.chip': [192, 40],
    'bar.cell': [64, 64],
    'bar.up': [36, 28],
    'bar.down': [36, 28],
    'wheel.hub': [96, 96],
    'wheel.band.d0': [125.66, 64],
    'wheel.band.d1': [175.93, 128],
    'wheel.band.d2': [226.19, 192],
    'world.throw': [64, 64],
    'menu.close': [60, 60],
    'menu.targetList.row': [456, 52],
    'menu.itemOverlay.row': [392, 52],
    'menu.hotbar.slot': [84, 84],
    'device.tab': [204.8, 60],
    'device.bagSlot': [76, 76],
    'device.inspectorAction': [192, 52],
    'device.gearOption': [400, 52],
    'device.equipPlate': [182.4, 79.75],
    'device.ringSocket': [80, 68],
    'offer.row': [528, 80],
    'offer.traySlot': [72, 72],
    'offer.button': [312, 80],
};

const EPS = 0.01;   // the pins are rounded to 2 places

describe('tap targets, in CSS px', () => {
    test('prints the tables', () => {
        console.log(['', table('phone375', SCREENS.phone375), '', table('phone390', SCREENS.phone390), '', table('desktop', SCREENS.desktop), ''].join('\n'));
    });

    for (const [key, screen] of Object.entries(SCREENS)) {
        test(`${key}: the walk finds every target kind, each with a real size`, () => {
            const rows = measure(screen);
            assert.ok(rows.length > 0, 'a walk that finds nothing must not pass');
            assert.deepEqual(rows.map((r) => r.name).sort(), [...EXPECTED].sort());
            for (const r of rows) {
                assert.ok(Number.isFinite(r.w) && r.w > 0 && Number.isFinite(r.h) && r.h > 0, `${r.name}: ${r.w}x${r.h}`);
            }
        });
    }

    test('both phones put the dock in two rows and keep the 608 menu box on screen', () => {
        for (const key of ['phone375', 'phone390']) {
            const vp = viewportFor(SCREENS[key]);
            assert.equal(vp.dockRows, 2, key);
            assert.ok(vp.menu.x + vp.menu.w <= vp.w && vp.menu.y + vp.menu.h <= vp.h, `${key}: menu box fits`);
        }
    });

    for (const key of ['phone375', 'phone390']) {
        test(`${key}: no target joins the under-44 list`, () => {
            const known = KNOWN_SMALL[key];
            const added = under44(SCREENS[key]).map((r) => r.name).filter((n) => !(n in known));
            assert.deepEqual(added, [], `new targets under ${APPLE_MIN_CSS} CSS px`);
        });

        test(`${key}: no target on the list gets smaller`, () => {
            const rows = new Map(measure(SCREENS[key]).map((r) => [r.name, r]));
            const known = KNOWN_SMALL[key];
            assert.ok(Object.keys(known).length > 0);
            for (const [name, pinned] of Object.entries(known)) {
                const r = rows.get(name);
                assert.ok(r, `${name} is pinned but no longer measured; take it off the list if it was removed`);
                assert.ok(r.min >= pinned - EPS, `${name}: ${r2(r.min)} CSS px, pinned at ${pinned}`);
            }
        });

        test(`${key}: a target that reached ${APPLE_MIN_CSS} is off the list`, () => {
            // Keeps the list honest: it names only what is still small.
            const small = new Set(under44(SCREENS[key]).map((r) => r.name));
            const stale = Object.keys(KNOWN_SMALL[key]).filter((n) => !small.has(n));
            assert.deepEqual(stale, [], 'these reached 44: delete them from KNOWN_SMALL');
        });
    }

    test('desktop at 3440x1440 is unchanged', () => {
        const got = Object.fromEntries(measure(SCREENS.desktop).map((r) => [r.name, [r2(r.w), r2(r.h)]]));
        assert.deepEqual(got, DESKTOP);
    });
});
