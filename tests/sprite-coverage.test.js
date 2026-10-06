// sprite-coverage.test.js — every spawned type has art, and co-located types
// do not share a cell.
//
// Nine types accumulated with no ENEMY_SPRITES entry and rendered as the flat
// #cc4433 fallback box on every run (see plans/visual-pass.md). Nothing caught
// it: content-validate.js never looked at sprites, and no test imported
// sprites.js at all. This is that missing check.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ENEMY_SPRITES, ITEM_SPRITES, spriteFrame } from '../game/sprites.js';
import { ALL_ITEM_IDS } from '../game/item-registry.js';
import { dirOf } from '../game/perception.js';

const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');

// `*-map.json` matches every real map.
const mapFiles = readdirSync(GAME_DIR)
    .filter(f => f.endsWith('-map.json'))
    .sort();

function loadMap(file) {
    return JSON.parse(readFileSync(join(GAME_DIR, file), 'utf8'));
}

// Types spawned at runtime rather than authored in a map JSON. Keep this list
// short and justified — each entry is a spawn site that a map sweep cannot see.
const DYNAMIC_SPAWNS = [
    { type: 'Lire', why: 'tricks.js "Hire Lire" summon, via main.js _spawnSummon' },
];

// Types knowingly left on the fallback box, with the reason. This list is the
// escape hatch that keeps the suite honest: a gap is either fixed or written
// down here, never merely unnoticed. Adding to it should feel expensive.
const KNOWN_UNSPRITED = {
    'Lire': 'no lion in Tiny Dungeon; every near-miss (rats, spiders, bare humanoid) reads worse than the fallback. Awaiting Caelan.',
};

describe('sprite coverage', () => {
    test('the map sweep actually found maps', () => {
        assert.ok(mapFiles.length >= 10, `only found ${mapFiles.length} map files`);
    });

    test('every type spawned in a map JSON has an ENEMY_SPRITES entry', () => {
        const missing = [];
        for (const file of mapFiles) {
            for (const e of loadMap(file).enemies || []) {
                if (e.type && !ENEMY_SPRITES[e.type] && !KNOWN_UNSPRITED[e.type]) {
                    missing.push(`${file}: ${e.type} (id ${e.id ?? '?'})`);
                }
            }
        }
        assert.deepEqual(missing, [], `types with no sprite:\n  ${missing.join('\n  ')}`);
    });

    test('every dynamically spawned type has an ENEMY_SPRITES entry', () => {
        for (const { type, why } of DYNAMIC_SPAWNS) {
            if (KNOWN_UNSPRITED[type]) continue;
            assert.ok(ENEMY_SPRITES[type], `${type} has no sprite (${why})`);
        }
    });

    test('the known-unsprited list has not gone stale', () => {
        for (const type of Object.keys(KNOWN_UNSPRITED)) {
            assert.ok(
                !ENEMY_SPRITES[type],
                `${type} now HAS a sprite — remove it from KNOWN_UNSPRITED`,
            );
        }
    });

    test('types that share a map do not share a cell', () => {
        // A type with `variants` (e.g. Violencian) occupies SEVERAL cells, not
        // one — any entity of that type could render as any of them, so every
        // variant cell counts toward the collision check. A clash on any one
        // of them is a real clash, same as for a plain single-cell entry.
        //
        // BASE cells only (animation pass §4). Violencian additionally carries
        // `dirCols`/`walkRows` (spriteFrame, sprites.js) so it also renders
        // across 3 more columns and 2 more rows per variant at draw time — but
        // a facing frame is not a distinct identity, so those cells deliberately
        // do NOT get enumerated into this check. Two characters that both
        // happen to be facing left are not a collision; this must stay reading
        // only `v.col`/`v.row` (the identity cell each variant is authored
        // with) rather than expanding through dirCols/walkRows. If a future
        // entry needs that expansion, that is a deliberate design change, not a
        // "fix" of this comment being out of date.
        const cellsFor = (s) => (s.variants?.length ? s.variants : [s]).map(v => `${s.sheet}:${v.col},${v.row}`);

        const collisions = [];
        for (const file of mapFiles) {
            const seen = new Map();   // "sheet:col,row" -> first type using it
            for (const e of loadMap(file).enemies || []) {
                const s = ENEMY_SPRITES[e.type];
                if (!s) continue;     // covered by the test above
                for (const key of cellsFor(s)) {
                    const prior = seen.get(key);
                    if (prior && prior !== e.type) {
                        collisions.push(`${file}: ${prior} and ${e.type} both use ${key}`);
                    } else {
                        seen.set(key, e.type);
                    }
                }
            }
        }
        assert.deepEqual(collisions, [], `co-located types sharing a cell:\n  ${collisions.join('\n  ')}`);
    });

    test('no ENEMY_SPRITES entry is orphaned', () => {
        const spawned = new Set(DYNAMIC_SPAWNS.map(d => d.type));
        for (const file of mapFiles) {
            for (const e of loadMap(file).enemies || []) if (e.type) spawned.add(e.type);
        }
        const orphans = Object.keys(ENEMY_SPRITES).filter(t => !spawned.has(t));
        assert.deepEqual(orphans, [], `sprites for types nothing spawns: ${orphans.join(', ')}`);
    });

    test('every sprite entry is well-formed', () => {
        for (const [type, s] of Object.entries(ENEMY_SPRITES)) {
            assert.ok(typeof s.sheet === 'string' && s.sheet, `${type}: no sheet`);
            assert.ok(Number.isInteger(s.col) && s.col >= 0, `${type}: bad col ${s.col}`);
            assert.ok(Number.isInteger(s.row) && s.row >= 0, `${type}: bad row ${s.row}`);
        }
    });
});

// ── Items ───────────────────────────────────────────────────────────────────
//
// ITEM_SPRITES uses PIXEL REGIONS ({sheet, x, y, w, h} via drawRegion), not the
// {sheet, col, row} shape ENEMY_SPRITES uses. Planning this pass, six item
// picks were drafted in the wrong shape and against cells that were already
// taken — by soap, bandage, hot_dog, mystery_meat and tunnel_mushroom. Nothing
// would have caught it. These tests are that check.

describe('item sprite coverage', () => {
    test('every ITEM_SPRITES entry uses the region shape, not the cell shape', () => {
        for (const [id, s] of Object.entries(ITEM_SPRITES)) {
            assert.ok(typeof s.sheet === 'string' && s.sheet, `${id}: no sheet`);
            assert.equal(s.col, undefined, `${id}: has col — that is the ENEMY_SPRITES shape, it will draw nothing`);
            assert.equal(s.row, undefined, `${id}: has row — that is the ENEMY_SPRITES shape, it will draw nothing`);
            for (const k of ['x', 'y', 'w', 'h']) {
                assert.ok(Number.isInteger(s[k]) && s[k] >= 0, `${id}: bad ${k} (${s[k]})`);
            }
        }
    });

    test('no two items share a cell', () => {
        const seen = new Map();
        const clashes = [];
        for (const [id, s] of Object.entries(ITEM_SPRITES)) {
            const key = `${s.sheet}:${s.x},${s.y}`;
            if (seen.has(key)) clashes.push(`${seen.get(key)} and ${id} both use ${key}`);
            else seen.set(key, id);
        }
        assert.deepEqual(clashes, [], `items sharing a cell:\n  ${clashes.join('\n  ')}`);
    });

    test('every ITEM_SPRITES id is a real item', () => {
        // ALL_ITEM_IDS is a Set (game/item-registry.js), not an array — .has(),
        // not .includes().
        const unknown = Object.keys(ITEM_SPRITES).filter(id => !ALL_ITEM_IDS.has(id));
        assert.deepEqual(unknown, [], `art for items that do not exist: ${unknown.join(', ')}`);
    });

    test('no poition falls through to the generic ? glyph', () => {
        // ALL_ITEM_IDS is a Set; spread to an array before filtering.
        const poitions = [...ALL_ITEM_IDS].filter(id => id.endsWith('_poition'));
        assert.ok(poitions.length >= 6, `only found ${poitions.length} poitions`);
        const bare = poitions.filter(id => !ITEM_SPRITES[id]);
        assert.deepEqual(bare, [], `poitions with no icon: ${bare.join(', ')}`);
    });
});

// ── Facing + walk-frame resolution (animation pass §4) ──────────────────────
//
// dirOf (perception.js) and spriteFrame (sprites.js) are both pure given
// explicit inputs — no clock, no DOM, no globals — so they're covered here
// with plain unit tests rather than only through a screenshot. Per the plan,
// this is worth more than a visual check when the renderer's rAF can't be
// observed.

describe('dirOf', () => {
    test('a vector picks the matching cardinal direction', () => {
        assert.equal(dirOf({ _lastDx: 0, _lastDy: -1 }), 'up');
        assert.equal(dirOf({ _lastDx: 0, _lastDy: 1 }), 'down');
        assert.equal(dirOf({ _lastDx: -1, _lastDy: 0 }), 'left');
        assert.equal(dirOf({ _lastDx: 1, _lastDy: 0 }), 'right');
    });

    test('a diagonal vector collapses to vertical, matching _faceOf (main.js)', () => {
        assert.equal(dirOf({ _lastDx: 1, _lastDy: -1 }), 'up');    // NE
        assert.equal(dirOf({ _lastDx: -1, _lastDy: -1 }), 'up');   // NW
        assert.equal(dirOf({ _lastDx: 1, _lastDy: 1 }), 'down');   // SE
        assert.equal(dirOf({ _lastDx: -1, _lastDy: 1 }), 'down');  // SW
    });

    test('the vector wins even over a stale/contradictory _faceLeft', () => {
        assert.equal(dirOf({ _lastDx: 1, _lastDy: 0, _faceLeft: true }), 'right');
    });

    test('falls back to _faceLeft when there is no vector', () => {
        assert.equal(dirOf({ _lastDx: 0, _lastDy: 0, _faceLeft: true }), 'left');
        assert.equal(dirOf({ _lastDx: 0, _lastDy: 0, _faceLeft: false }), 'down');
        assert.equal(dirOf({ _faceLeft: true }), 'left'); // no vector fields at all
    });

    test('falls back to a .facing string when there is neither a vector nor _faceLeft', () => {
        assert.equal(dirOf({ facing: 'right' }), 'right');
    });

    test('a bare entity with none of the three fields defaults to down', () => {
        assert.equal(dirOf({}), 'down');
        assert.equal(dirOf(undefined), 'down');
    });
});

describe('spriteFrame', () => {
    // Violencian is the one entry carrying dirCols/walkRows; Pike is a plain
    // {sheet,col,row,static} entry with neither — the fixture the analogous
    // spriteVariant test ("an entry with no variants is returned unchanged")
    // uses for the same reason.
    const info = ENEMY_SPRITES['Violencian'];
    const plain = ENEMY_SPRITES['Pike'];

    test('an entry with no dirCols is returned unchanged, not copied', () => {
        assert.equal(plain.dirCols, undefined, 'test fixture assumption: Pike has no dirCols');
        const result = spriteFrame(plain, { id: 'anything' }, {});
        assert.equal(result, plain, 'expected the exact same object back, not a copy');
    });

    test('each of the four directions resolves to its measured column', () => {
        // Measured against tools/contact_rpgUrban.png (see the ENEMY_SPRITES
        // comment): 23 left, 24 down, 25 up, 26 right.
        const up    = spriteFrame(info, { _lastDx: 0, _lastDy: -1 }, {});
        const down  = spriteFrame(info, { _lastDx: 0, _lastDy: 1 }, {});
        const left  = spriteFrame(info, { _lastDx: -1, _lastDy: 0 }, {});
        const right = spriteFrame(info, { _lastDx: 1, _lastDy: 0 }, {});
        assert.equal(up.col, 25);
        assert.equal(down.col, 24);
        assert.equal(left.col, 23);
        assert.equal(right.col, 26);
        // Facing must not perturb which character (row) is drawn.
        for (const frame of [up, down, left, right]) assert.equal(frame.row, info.row);
    });

    test('mid-step, the walk frame advances with slide progress', () => {
        const early = spriteFrame(info, { _lastDx: 0, _lastDy: 1 }, { animating: true, progress: 0 });
        const late  = spriteFrame(info, { _lastDx: 0, _lastDy: 1 }, { animating: true, progress: 0.99 });
        assert.notEqual(early.row, info.row, 'mid-step should leave the resting row');
        assert.notEqual(late.row, info.row, 'mid-step should leave the resting row');
        assert.notEqual(early.row, late.row, 'the two stride frames must differ across the slide');
    });

    test('at rest, the walk frame alternates on the desynced idle tick (two-frame minimum)', () => {
        const a = spriteFrame(info, { _lastDx: 0, _lastDy: 1 }, { animating: false, idleTick: 0, phase: 0 });
        const b = spriteFrame(info, { _lastDx: 0, _lastDy: 1 }, { animating: false, idleTick: 1, phase: 0 });
        assert.notEqual(a.row, b.row, 'idle frame never advances — desync/idle tick is not reaching spriteFrame');
    });

    test('is pure — identical explicit inputs yield identical output on repeat calls', () => {
        const entity = { _lastDx: -1, _lastDy: 0 };
        const anim = { animating: true, progress: 0.4 };
        const first = spriteFrame(info, entity, anim);
        for (let i = 0; i < 5; i++) {
            const again = spriteFrame(info, entity, anim);
            assert.equal(again.col, first.col);
            assert.equal(again.row, first.row);
        }
    });
});
