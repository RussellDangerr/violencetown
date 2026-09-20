// hud-layout.test.js — pure rect geometry helpers for the HUD non-overlap invariant.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rectsOverlap, expandRect } from '../game/layout.js';
import { HIT_SLOP, xmbBarPanelRect, hudInteractiveRects } from '../game/layout.js';

describe('rectsOverlap', () => {
    test('true when rects share area', () => {
        assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
    });
    test('false when disjoint on x', () => {
        assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }), false);
    });
    test('false when disjoint on y', () => {
        assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 20, w: 10, h: 10 }), false);
    });
    test('edge-touching (shared border, zero area) is NOT overlap', () => {
        assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
    });
});

describe('expandRect', () => {
    test('grows a rect by slop on every side', () => {
        assert.deepEqual(expandRect({ x: 10, y: 10, w: 20, h: 20 }, 6), { x: 4, y: 4, w: 32, h: 32 });
    });
});

describe('HUD non-overlap invariant', () => {
    test('xmbBarPanelRect worst-case matches the recon extent (n=3)', () => {
        const r = xmbBarPanelRect(3);
        assert.equal(r.x, 144);
        assert.equal(r.x + r.w, 464);
        assert.equal(r.y, 510);
        assert.equal(r.y + r.h, 592);
    });

    test('no two IDLE interactive HUD panels overlap under HIT_SLOP', () => {
        const rects = hudInteractiveRects('idle');
        for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
                const a = expandRect(rects[i].rect, HIT_SLOP);
                const b = expandRect(rects[j].rect, HIT_SLOP);
                assert.ok(!rectsOverlap(a, b),
                    `HUD panels ${rects[i].name} and ${rects[j].name} overlap (tap-ambiguous)`);
            }
        }
    });
});

import { hudLayout, throwRects, xmbBarLayout, XMB_ANCHOR_CLASSIC } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

describe('throw targets and the item bar anchor', () => {
    test("throwRects follow the player's tile", () => {
        const vp = computeViewport({ cssW: 1920, cssH: 1080, dpr: 1 });
        const r = throwRects(vp);
        const cx = vp.origin.x + 16, cy = vp.origin.y + 16;
        assert.equal(r.up.x + r.up.w / 2, cx);
        assert.equal(r.left.y + r.left.h / 2, cy);
        assert.ok(r.up.y + r.up.h <= cy - 16 && r.down.y >= cy + 16, 'the targets clear the player tile');
    });

    test('xmbBarLayout moves with its anchor', () => {
        const bar = { columns: [{ key: 'throw', label: 'THROW', items: [{ itemDef: { id: 'rock' }, count: 1 }] }] };
        const a = xmbBarLayout(bar), b = xmbBarLayout(bar, { cx: 1000, bottom: 700 });
        assert.deepEqual(xmbBarLayout(bar, XMB_ANCHOR_CLASSIC), a);
        assert.equal(b.chips[0].x - a.chips[0].x, 1000 - 304);
        assert.equal(b.current.y - a.current.y, 700 - 588);
    });
});

describe('hudLayout (fill): pinned to the corners', () => {
    const screens = {
        '1080p': computeViewport({ cssW: 1920, cssH: 1080, dpr: 1 }),
        "Caelan's ultrawide": computeViewport({ cssW: 3440, cssH: 1440, dpr: 1 }),
        'phone upright': computeViewport({ cssW: 390, cssH: 844, dpr: 3 }),
    };
    const WHEEL_REACH = 126;   // the open wheel's widest reach from its hub
    const wheelBox = (hud) => ({ x: hud.wheel.cx - WHEEL_REACH, y: hud.wheel.cy - WHEEL_REACH, w: 2 * WHEEL_REACH, h: 2 * WHEEL_REACH });
    const onScreen = (r, vp) => r.x >= 0 && r.y >= 0 && r.x + r.w <= vp.w && r.y + r.h <= vp.h;

    for (const [name, vp] of Object.entries(screens)) {
        test(`${name}: no two idle panels overlap under HIT_SLOP`, () => {
            const rects = hudInteractiveRects('idle', vp);
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
                assert.ok(!rectsOverlap(expandRect(rects[i].rect, HIT_SLOP), expandRect(rects[j].rect, HIT_SLOP)),
                    `${rects[i].name} and ${rects[j].name} overlap`);
            }
        });

        test(`${name}: every piece is on screen`, () => {
            const hud = hudLayout(vp);
            assert.ok(onScreen({ ...hud.hp, w: 170, h: 90 }, vp), 'HP panel');
            assert.ok(onScreen(hud.log, vp), 'quest log');
            assert.ok(onScreen(xmbBarPanelRect(3, hud.bar), vp), 'item bar');
            assert.ok(onScreen(wheelBox(hud), vp), 'the open wheel');
        });

        test(`${name}: the item bar is centred, and the open wheel stays off it`, () => {
            const hud = hudLayout(vp);
            assert.equal(hud.bar.cx, vp.w / 2);
            assert.ok(!rectsOverlap(wheelBox(hud), xmbBarPanelRect(3, hud.bar)));
        });

        test(`${name}: the buff bar stops short of the page buttons`, () => {
            const hud = hudLayout(vp);
            assert.ok(hud.buffsRight <= vp.w - 6 - 60 * vp.logicalPerCss);
            assert.equal(hud.strip, vp.h);
        });
    }

    test('on a wide screen the log and the item bar share one line', () => {
        const hud = hudLayout(screens['1080p']);
        assert.equal(hud.log.y + hud.log.h, xmbBarPanelRect(3, hud.bar).y + xmbBarPanelRect(3, hud.bar).h);
    });
});

import { DOCK, DIAL_MAX_R, dialRadius, wheelTopMarks, hitHud, dialColumnLeft, dialRect } from '../game/layout.js';
import { ROOT } from '../game/wheel-model.js';

describe('the dock', () => {
    const withDock = (cssW, cssH, dpr) => computeViewport({ cssW, cssH, dpr, dock: DOCK });
    const screens = {
        '1080p': withDock(1920, 1080, 1),
        "Caelan's ultrawide": withDock(3440, 1440, 1),
        'phone upright': withDock(390, 844, 3),
        'a squarish window': withDock(1100, 1000, 1),
    };

    for (const [name, vp] of Object.entries(screens)) {
        test(`${name}: the log, the item bar and the opener never overlap under HIT_SLOP`, () => {
            const rects = hudInteractiveRects('idle', vp);
            assert.deepEqual(rects.map((r) => r.name), ['questlog', 'xmb', 'opener']);
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
                assert.ok(!rectsOverlap(expandRect(rects[i].rect, HIT_SLOP), expandRect(rects[j].rect, HIT_SLOP)),
                    `${rects[i].name} and ${rects[j].name} overlap`);
            }
        });

        test(`${name}: they all sit inside the dock, and the hint strips rest on its top edge`, () => {
            const hud = hudLayout(vp);
            const inDock = (r) => r.x >= 0 && r.x + r.w <= vp.w && r.y >= hud.dock.y && r.y + r.h <= vp.h;
            assert.ok(inDock(hud.log), 'log');
            assert.ok(inDock(xmbBarPanelRect(3, hud.bar)), 'item bar');
            assert.ok(inDock(hud.opener), 'opener');
            assert.equal(hud.dock.y, vp.h - vp.dockH);
            assert.equal(hud.strip, hud.dock.y);
        });

        test(`${name}: the biggest dial fits across the screen, and the deepest BACK tile ends in the dock`, () => {
            const hud = hudLayout(vp);
            assert.ok(hud.wheel.cx - DIAL_MAX_R >= 0 && hud.wheel.cx + DIAL_MAX_R <= vp.w);
            assert.ok(hud.wheel.cy + 120 <= vp.h - 8 && hud.wheel.cy + 120 >= hud.dock.y);
        });
    }

    test('one row on a wide screen: the log reaches to the item bar', () => {
        const vp = screens['1080p'], hud = hudLayout(vp);
        assert.equal(vp.dockRows, 1);
        assert.equal(hud.log.lines, 3);
        assert.equal(hud.log.x + hud.log.w + 12, xmbBarPanelRect(3, hud.bar).x);
    });

    test("two rows on an upright phone: the log runs up to the dial's column", () => {
        // It spanned the whole dock until the dial was given a reserved column
        // (plans/combat-hud.md stage 2) — which is what it used to be drawn over.
        const vp = screens['phone upright'], hud = hudLayout(vp);
        assert.equal(vp.dockRows, 2);
        assert.equal(hud.log.x, 8);
        assert.equal(hud.log.x + hud.log.w + 12, dialColumnLeft(vp.w));
        assert.ok(hud.log.w < vp.w - 16, 'no longer the full width of the dock');
    });

    test('the dial covers the wheel at every depth, with room for FIRE at a leaf', () => {
        // The real wheel's measured reach above its hub (plans/screen-fill.md): 103, 135, 135.
        assert.equal(dialRadius(1, true), 88 + 14 + 12);
        assert.equal(dialRadius(2, true), 120 + 14 + 12);
        assert.equal(dialRadius(3, false), 120 + 30 + 12);
        assert.ok(dialRadius(1, true) > 103 && dialRadius(2, true) > 135 && dialRadius(3, false) > 135);
        assert.equal(DIAL_MAX_R, dialRadius(3, false));
    });

    test('the FIRE cue never sits under the pointer', () => {
        for (let r = 50; r <= 160; r++) {
            const m = wheelTopMarks(r);
            assert.ok(m.cueTop - 12 >= m.pointerTop, `outermost ring ${r}`);
        }
    });

    test('hitHud finds the opener and the log, and nothing in the world', () => {
        const hud = hudLayout(screens['1080p']);
        const mid = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
        assert.equal(hitHud(hud, mid(hud.opener)), 'opener');
        assert.equal(hitHud(hud, mid(hud.log)), 'log');
        assert.equal(hitHud(hud, { x: 640, y: 300 }), null);
    });

    test("the dock's bare chrome is the dock, not the world drawn under it", () => {
        // The world's tiles run on under the dock, so a tap on the dock's
        // empty space must not reach tap-to-move or a target there.
        for (const vp of Object.values(screens)) {
            const hud = hudLayout(vp);
            assert.equal(hitHud(hud, { x: vp.w - 2, y: hud.dock.y + 1 }), 'dock');
            assert.equal(hitHud(hud, { x: vp.w - 2, y: vp.h - 2 }), 'dock');
            assert.equal(hitHud(hud, { x: vp.w / 2, y: hud.dock.y - 20 }), null, 'just above the dock is the world');
        }
        const corners = hudLayout(computeViewport({ cssW: 1920, cssH: 1080, dpr: 1 }));   // no dock
        assert.equal(hitHud(corners, { x: 640, y: 715 }), null);
    });
});

// ── The open wheel's dial belongs to the invariant (plans/combat-hud.md stage 2) ──
//
// hudInteractiveRects only ever knew 'idle', so the dial — drawn in
// 'radial_menu' — was never checked against the log it lands on. On a two-row
// dock the log is full-width and the dial covered its right-hand third.
describe('the open wheel is in the non-overlap invariant', () => {
    const withDock = (cssW, cssH, dpr) => computeViewport({ cssW, cssH, dpr, dock: DOCK });
    const screens = {
        '1080p':               withDock(1920, 1080, 1),
        "Caelan's ultrawide":  withDock(3440, 1440, 1),
        'phone upright':       withDock(390, 844, 3),
        'a squarish window':   withDock(1100, 1000, 1),
        'narrow and tall':     withDock(900, 1200, 1),
        'just under one row':  withDock(980, 800, 1),
    };

    for (const [name, vp] of Object.entries(screens)) {
        test(`${name}: the open dial is one of the panels the invariant knows`, () => {
            const names = hudInteractiveRects('radial_menu', vp).map((r) => r.name);
            assert.ok(names.includes('dial'), `radial_menu panels were ${JSON.stringify(names)}`);
        });

        test(`${name}: nothing overlaps the open dial under HIT_SLOP`, () => {
            const rects = hudInteractiveRects('radial_menu', vp);
            assert.ok(rects.length >= 2, 'need the dial and at least one neighbour to compare');
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
                assert.ok(!rectsOverlap(expandRect(rects[i].rect, HIT_SLOP), expandRect(rects[j].rect, HIT_SLOP)),
                    `${rects[i].name} and ${rects[j].name} overlap`);
            }
        });
    }

    test('the log survives the narrowest viewport the tile rule allows', () => {
        // MIN_TILES keeps the short side at >= 20 tiles (640 logical px), so the
        // dial's column can never eat the whole dock. Pinned because reserving
        // that column is subtraction, and subtraction can go negative.
        for (const [name, vp] of Object.entries(screens)) {
            const hud = hudLayout(vp);
            assert.ok(hud.log.w > 0, `${name}: log width ${hud.log.w}`);
            assert.ok(hud.log.x + hud.log.w <= dialColumnLeft(vp.w), `${name}: log runs into the dial column`);
            assert.ok(vp.w >= 640, `${name}: viewport narrower than the tile rule allows`);
        }
    });

    test('the dial fits the space reserved for it at every node actually in the wheel', () => {
        // DIAL_MAX_R reserves dialRadius(3,false)=162 and the deepest live node
        // needs exactly that — zero headroom. Give any depth-3 leaf a child and
        // the dial silently needs 178. This is the tripwire for that.
        let worst = 0, where = '';
        (function walk(n, d, trail) {
            const kids = n.children || [];
            if (d > 0) {
                const r = dialRadius(d, kids.length > 0);
                if (r > worst) { worst = r; where = trail; }
            }
            kids.forEach((c) => walk(c, d + 1, trail ? `${trail} > ${c.label}` : c.label));
        })(ROOT, 0, '');
        assert.ok(worst <= DIAL_MAX_R, `${where} needs a dial of ${worst}, but only ${DIAL_MAX_R} is reserved`);
    });
});

// ── The dock's two faces (plans/combat-hud.md stage 3) ───────────────────────
//
// A fight swaps what the dock CONTAINS, never where its pieces sit. The dock
// reflowing as a fight starts would move the log under the player's eye at the
// worst possible moment, so every rect is pinned identical across the faces and
// only the log's contents change.
describe("the dock's two faces", () => {
    const withDock = (cssW, cssH, dpr) => computeViewport({ cssW, cssH, dpr, dock: DOCK });
    const screens = {
        '1080p':              withDock(1920, 1080, 1),
        "Caelan's ultrawide": withDock(3440, 1440, 1),
        'phone upright':      withDock(390, 844, 3),
        'narrow and tall':    withDock(900, 1200, 1),
    };

    for (const [name, vp] of Object.entries(screens)) {
        test(`${name}: a fight does not move a single dock rect`, () => {
            const town = hudLayout(vp, { fight: false });
            const fight = hudLayout(vp, { fight: true });
            assert.deepEqual(fight.dock, town.dock, 'the dock itself');
            assert.deepEqual(fight.wheel, town.wheel, 'the dial hub');
            assert.deepEqual(fight.opener, town.opener, 'the opener');
            assert.equal(fight.bar.cx, town.bar.cx, 'the item bar');
            assert.equal(fight.bar.bottom, town.bar.bottom, 'the item bar');
            assert.equal(fight.strip, town.strip, 'the strip line the hints rest on');
            const box = (r) => ({ x: r.x, y: r.y, w: r.w, h: r.h });
            assert.deepEqual(box(fight.log), box(town.log), 'the log panel');
        });

        test(`${name}: the faces differ only in what the log shows`, () => {
            const town = hudLayout(vp, { fight: false });
            const fight = hudLayout(vp, { fight: true });
            assert.equal(town.log.face, 'quest');
            assert.equal(fight.log.face, 'combat');
            assert.ok(fight.log.lines > town.log.lines,
                `the fight face drops the objective, so it fits more feed: ${fight.log.lines} vs ${town.log.lines}`);
        });
    }

    test('no options means the town face, so every existing caller is unchanged', () => {
        const vp = screens['1080p'];
        assert.deepEqual(hudLayout(vp), hudLayout(vp, { fight: false }));
        assert.equal(hudLayout(vp).log.face, 'quest');
    });

    test('the dial keeps its column on the fight face too', () => {
        for (const vp of Object.values(screens)) {
            const fight = hudLayout(vp, { fight: true });
            assert.ok(fight.log.x + fight.log.w <= dialColumnLeft(vp.w));
            assert.ok(!rectsOverlap(expandRect(dialRect(fight), HIT_SLOP), expandRect(fight.log, HIT_SLOP)));
        }
    });
});
