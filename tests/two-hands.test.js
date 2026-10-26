// two-hands.test.js — left and right replace the weapon slot
// (plans/ws3-two-hands-left-right.md). The right hand keeps the key `weapon`;
// `left` is the other hand; a two-hander is the same def in both.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { holdInHands, settleHands, resolveUse, unequipItem, HANDS } from '../game/items.js';
import { WEAPONS, WEAPON_TIERS, WEAPON_CLASSES, weaponClassOf } from '../game/weapons.js';
import { resolveItemDef } from '../game/item-registry.js';
import { serialize, migrate, loadInto, SAVE_VERSION } from '../game/save.js';
import { playerPanel, SLOT_ORDER } from '../game/fight-panels.js';
import { QuestEngine } from '../game/quests.js';

// main.js touches `document` at import, so its _handsOf is lifted from source,
// as the other main.js tests do, and run for real.
const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const handsBody = /_handsOf\(def\) \{ (return [^\n]*?;) \}/.exec(mainSrc);
assert.ok(handsBody, '_handsOf not found in main.js');
const handsOf = new Function('weaponClassOf', `return function (def) { ${handsBody[1]} }`)(weaponClassOf);

const SWORD = WEAPONS.wooden_sword;           // a one-hander (class sword)
const WHIP = WEAPONS.lion_whip;               // another one-hander
const GREAT = WEAPON_TIERS.great_sword[0];    // a two-hander (class great_sword)
const AXE2 = WEAPON_TIERS.battle_axe[0];      // another two-hander

const hands = (weapon = SWORD, left = null) => ({ weapon, left, top: null, bottom: null, front: null, back: null, sides: null });

describe('how many hands a weapon takes', () => {
    test('the class says it: every class reads back its own hands', () => {
        for (const [id, c] of Object.entries(WEAPON_CLASSES)) {
            assert.equal(handsOf(WEAPON_TIERS[id][0]), c.hands, id);
        }
        assert.equal(handsOf(GREAT), 2);
        assert.equal(handsOf(SWORD), 1);
    });

    test('no class, or not a weapon at all, is one hand', () => {
        assert.equal(handsOf({ id: 'pipe' }), 1);
        assert.equal(handsOf({ id: 'x', weaponClass: 'no_such_class' }), 1);
        assert.equal(handsOf(null), 1);
    });

    test('the two hands are the right (key weapon) and the left', () => {
        assert.deepEqual([...HANDS], ['weapon', 'left']);
    });
});

describe('holdInHands — the rule', () => {
    test('a one-hander goes in the right hand and pushes out what was there', () => {
        const eq = hands(SWORD);
        assert.deepEqual(holdInHands(eq, WHIP, handsOf), [SWORD]);
        assert.equal(eq.weapon, WHIP);
        assert.equal(eq.left, null);
    });

    test('a one-hander can go in the left hand and leaves the right alone', () => {
        const eq = hands(SWORD);
        assert.deepEqual(holdInHands(eq, WHIP, handsOf, 'left'), []);
        assert.equal(eq.weapon, SWORD);
        assert.equal(eq.left, WHIP);
    });

    test('a two-hander fills both hands and pushes out both', () => {
        const eq = hands(SWORD, WHIP);
        assert.deepEqual(holdInHands(eq, GREAT, handsOf), [SWORD, WHIP]);
        assert.equal(eq.weapon, GREAT);
        assert.equal(eq.left, GREAT);
    });

    for (const hand of ['weapon', 'left']) {
        test(`a one-hander into a held two-hander (${hand === 'weapon' ? 'right' : 'left'} hand) frees both`, () => {
            const eq = hands(GREAT, GREAT);
            assert.deepEqual(holdInHands(eq, SWORD, handsOf, hand), [GREAT], 'the two-hander comes out once');
            const other = hand === 'weapon' ? 'left' : 'weapon';
            assert.equal(eq[hand], SWORD);
            assert.equal(eq[other], null);
        });
    }

    test('a two-hander over a two-hander swaps it out once', () => {
        const eq = hands(GREAT, GREAT);
        assert.deepEqual(holdInHands(eq, AXE2, handsOf), [GREAT]);
        assert.equal(eq.weapon, AXE2);
        assert.equal(eq.left, AXE2);
    });

    test('the same one-hander in both hands is two one-handers, not a two-hander', () => {
        const eq = hands(SWORD, SWORD);
        assert.deepEqual(holdInHands(eq, WHIP, handsOf), [SWORD]);
        assert.equal(eq.weapon, WHIP);
        assert.equal(eq.left, SWORD, 'the left hand keeps its own sword');
    });

    test('with no hands rule, everything is one-handed (the old single slot)', () => {
        const eq = hands(SWORD);
        assert.deepEqual(holdInHands(eq, GREAT), [SWORD]);
        assert.equal(eq.weapon, GREAT);
        assert.equal(eq.left, null);
    });
});

describe('settleHands — a loaded pair obeys the rule', () => {
    test('a two-hander in the right hand fills the left', () => {
        const eq = settleHands(hands(GREAT, WHIP), handsOf);
        assert.equal(eq.left, GREAT);
    });
    test('a two-hander only in the left hand is a pair no equip makes; the right hand stays', () => {
        const eq = settleHands(hands(SWORD, GREAT), handsOf);
        assert.equal(eq.weapon, SWORD);
        assert.equal(eq.left, null);
    });
    test('a missing left hand reads as empty', () => {
        const eq = settleHands({ weapon: SWORD }, handsOf);
        assert.equal(eq.left, null);
    });
    test('two one-handers are left as they are', () => {
        const eq = settleHands(hands(SWORD, WHIP), handsOf);
        assert.equal(eq.weapon, SWORD);
        assert.equal(eq.left, WHIP);
    });
});

// The Use → Equip path (main.js routes the bag's Equip through resolveUse).
function bagGame(eq) {
    const bag = [];
    return {
        equipment: eq, tempEquips: [], bag,
        _handsOf: handsOf,
        _addToInventory(def) { bag.push(def); return true; },
    };
}

describe('equipping a weapon from the bag', () => {
    test('a one-hander replaces the right hand and the old weapon goes back in the bag, as before', () => {
        const g = bagGame(hands(SWORD));
        const msg = resolveUse(g, WHIP, null);
        assert.equal(g.equipment.weapon, WHIP);
        assert.equal(g.equipment.left, null);
        assert.deepEqual(g.bag, [SWORD]);
        assert.equal(msg, `[Equipped ${WHIP.name} — ${SWORD.name} back in your bag]`);
    });

    test('a two-hander takes both hands and bags both', () => {
        const g = bagGame(hands(SWORD, WHIP));
        resolveUse(g, GREAT, null);
        assert.equal(g.equipment.weapon, GREAT);
        assert.equal(g.equipment.left, GREAT);
        assert.deepEqual(g.bag, [SWORD, WHIP]);
    });

    test('a one-hander into a held two-hander frees both, and the two-hander is bagged once', () => {
        const g = bagGame(hands(GREAT, GREAT));
        resolveUse(g, SWORD, null);
        assert.equal(g.equipment.weapon, SWORD);
        assert.equal(g.equipment.left, null);
        assert.deepEqual(g.bag, [GREAT]);
    });

    test('a two-hander\'s left hand never comes off on its own', () => {
        const g = bagGame(hands(GREAT, GREAT));
        assert.equal(unequipItem(g, 'left'), null);
        assert.equal(g.equipment.left, GREAT);
        assert.deepEqual(g.bag, []);
    });

    test('a one-hander in the left hand can be put away', () => {
        const g = bagGame(hands(SWORD, WHIP));
        assert.match(unequipItem(g, 'left'), /Unequipped/);
        assert.equal(g.equipment.left, null);
        assert.deepEqual(g.bag, [WHIP]);
    });
});

// ── Saves ────────────────────────────────────────────────────────────────────
const TIER_DEFS = Object.fromEntries(Object.values(WEAPON_TIERS).flat().map(d => [d.id, d]));

function blankGame() {
    const g = {
        rng: { getState: () => 0, setState() {} }, turn: 0,
        playerX: 0, playerY: 0, playerHp: 100, playerMaxHp: 100, playerMp: 100, playerMaxMp: 100,
        facing: 'down', gold: 0,
        equipment: hands(SWORD), tempEquips: [], buffs: [], inventory: [],
        groundItems: [], containers: [], enemies: [], _tileDiffs: [],
        _log() {}, _render() {},
        _handsOf: handsOf,
        _resolveItemDef(id) { return resolveItemDef(id) || TIER_DEFS[id] || null; },
        async _loadMap(url) {
            this.map = { url, width: 10, height: 10, isInBounds: () => true };
            this.playerX = 1; this.playerY = 1;
        },
        setTile() {},
    };
    g.questEngine = new QuestEngine(g);
    return g;
}

const v1Save = (weapon) => ({
    version: 1, mapUrl: 'town-map.json',
    player: { x: 2, y: 2, equipment: { weapon, top: null, bottom: null, front: null, back: null, sides: null } },
});

describe('saves carry both hands', () => {
    beforeEach(() => {
        globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    });

    test('the save format is version 2', () => {
        assert.equal(SAVE_VERSION, 2);
        assert.equal(serialize(blankGame()).version, 2);
    });

    test('migrate gives a version-1 save an empty left hand and keeps its weapon', () => {
        const r = migrate(v1Save('fearmur'));
        assert.equal(r.player.equipment.weapon, 'fearmur');
        assert.equal(r.player.equipment.left, null);
    });

    test('an old save loads with its weapon in the right hand', async () => {
        const g = blankGame();
        await loadInto(g, v1Save('fearmur'));
        assert.equal(g.equipment.weapon, WEAPONS.fearmur);
        assert.equal(g.equipment.left, null);
    });

    test('an old save holding a two-hander loads it in both hands', async () => {
        const g = blankGame();
        await loadInto(g, v1Save(GREAT.id));
        assert.equal(g.equipment.weapon, GREAT);
        assert.equal(g.equipment.left, GREAT);
    });

    test('both hands survive a save and a load', async () => {
        const src = blankGame();
        src.equipment = hands(SWORD, WHIP);
        const blob = JSON.parse(JSON.stringify(serialize(src)));
        assert.equal(blob.player.equipment.weapon, SWORD.id);
        assert.equal(blob.player.equipment.left, WHIP.id);
        const dst = blankGame();
        await loadInto(dst, blob);
        assert.equal(dst.equipment.weapon, SWORD);
        assert.equal(dst.equipment.left, WHIP);
    });

    test('a held two-hander survives a save and a load in both hands', async () => {
        const src = blankGame();
        src.equipment = hands(GREAT, GREAT);
        const dst = blankGame();
        await loadInto(dst, JSON.parse(JSON.stringify(serialize(src))));
        assert.equal(dst.equipment.weapon, GREAT);
        assert.equal(dst.equipment.left, GREAT);
    });
});

describe('every fresh body starts with two hands', () => {
    test('the new-game, restart and respawn equipment all carry an empty left hand', () => {
        const fresh = mainSrc.match(/this\.equipment = \{[^}]*weapon: WEAPONS\.wooden_sword[^}]*\}/g) || [];
        assert.equal(fresh.length, 3, 'constructor, _fullReset and the respawn');
        for (const f of fresh) assert.match(f, /left: null/);
    });
});

describe('the fight gear panel shows both hands', () => {
    const panel = (eq) => Object.fromEntries(playerPanel({ equipment: eq }).slots.map(s => [s.key, s]));

    test('a row for each hand, leading the panel', () => {
        assert.deepEqual(SLOT_ORDER.slice(0, 2), ['weapon', 'left']);
        const p = panel(hands(SWORD, WHIP));
        assert.equal(p.weapon.name, SWORD.name);
        assert.equal(p.left.name, WHIP.name);
        assert.notEqual(p.weapon.label, p.left.label, 'the two hands read differently');
    });

    test('an empty left hand is still a row', () => {
        const p = panel(hands(SWORD));
        assert.equal(p.left.name, null);
        assert.ok(p.left.label);
    });

    test('a two-hander shows in both rows', () => {
        const p = panel(hands(GREAT, GREAT));
        assert.equal(p.weapon.name, GREAT.name);
        assert.equal(p.left.name, GREAT.name);
    });
});

// The YOU panel has a row per hand now, so it is one row taller than the six
// it was sized for (WS3R2: grow the panels one row). Drawn through the real
// renderer on a recording font: every line, with its own height and the
// panel's padding below it, has to land inside the panel's frame.
describe('the fight gear panel fits both hands', () => {
    globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
    const LH = 12, PAD = 6;   // _drawGearPanel's line height and padding
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });

    for (const [name, size] of [['3440x1440', [3440, 1440]], ['1920x1080', [1920, 1080]]]) {
        test(`${name}: the last row clears the bottom of the frame`, async () => {
            const { Renderer } = await import('../game/renderer.js');
            const { DOCK, fightPanelRects } = await import('../game/layout.js');
            const { computeViewport } = await import('../game/viewport.js');
            const vp = computeViewport({ cssW: size[0], cssH: size[1], dpr: 1, dock: DOCK });
            const drawn = [];
            const r = Object.assign(Object.create(Renderer.prototype), {
                ctx, viewport: vp, sprites: { uiPanel: null },
                font: { drawText: (c, text, x, y) => drawn.push({ text, x, y }) },
            });
            const R = fightPanelRects(vp).left;
            r._drawGearPanel(R, playerPanel({ equipment: hands(GREAT, GREAT) }));
            assert.equal(drawn.length, 1 + 2 * SLOT_ORDER.length, 'a header and two lines per slot');
            const last = Math.max(...drawn.map(d => d.y));
            assert.ok(last + LH + PAD <= R.y + R.h,
                `last line ends at ${last + LH + PAD}, frame ends at ${R.y + R.h}`);
        });
    }
});
