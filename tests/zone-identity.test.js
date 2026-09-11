// zone-identity.test.js — five zones that look like five places
// (plans/zone-identity.md). Pins the specific defects that pass fixed, so a
// later map or sprite edit cannot quietly put them back.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TILES, TILE_BY_ID } from '../game/data.js';
import * as sprites from '../game/sprites.js';

const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');
const loadMap = file => JSON.parse(readFileSync(join(GAME_DIR, file), 'utf8'));

// ── Item 2's bar: a zone is done when it no longer shares a cell ───────────
//
// Two different tile ids that draw the same pixels are either one tile (merge
// them) or one zone wearing another's look. Sewer and Factory drew from the
// same cells until Item 2; this keeps any such pair from creeping back. Each
// accepted share is written down with its reason — adding one should feel
// expensive.

const KNOWN_SHARED_CELLS = {
    'tinyTown(9,3)': "FENCE / IRON_FENCE — no iron railing exists in any bundled sheet (verified twice), so the graveyard borrows Town's wood fence",
    'tinyTown(1,2)': "ROAD / CIRCUS_GROUND — open: the carnival's ground is Town's road, 892 of its 1,276 cells. Awaiting a call on a ground of its own (zone-identity.md, Item 3 findings)",
};

function tilesByCell() {
    const all = { ...sprites.TILE_SPRITE_MAP, ...sprites.TOWN_TILE_SPRITE_MAP, ...sprites.ZONE_TILE_SPRITE_MAP };
    const byCell = new Map();
    for (const [id, ref] of Object.entries(all)) {
        if (!ref) continue;                                   // null = deliberate flat fallback
        for (const r of ref.quad ?? [ref]) {
            const key = `${r.sheet}(${r.col},${r.row})`;
            byCell.set(key, [...(byCell.get(key) ?? []), TILE_BY_ID[id]?.name ?? id]);
        }
    }
    return byCell;
}

describe('no two tiles share a picture', () => {
    test('every sprite cell draws one tile id, or its share is written down', () => {
        const shared = [...tilesByCell()]
            .filter(([key, names]) => names.length > 1 && !KNOWN_SHARED_CELLS[key])
            .map(([key, names]) => `${key}: ${names.join(' and ')}`);
        assert.deepEqual(shared, [], `tile ids drawing the same cell:\n  ${shared.join('\n  ')}`);
    });

    test('the known-shared list has not gone stale', () => {
        const byCell = tilesByCell();
        for (const key of Object.keys(KNOWN_SHARED_CELLS)) {
            assert.ok((byCell.get(key)?.length ?? 0) > 1, `${key} is no longer shared — remove it from KNOWN_SHARED_CELLS`);
        }
    });
});

// ── Item 3: the graveyard ──────────────────────────────────────────────────
//
// Was: one tinyDungeon cross, placed as a TILE across all 96 grave cells, so
// every grave in the zone was the same picture. Now each grave is a prop with
// its own silhouette from the re-outlined roguelikeSheet strip.

describe('graveyard', () => {
    const map = loadMap('graveyard-map.json');
    const graves = (map.props || []).filter(p => p.type.startsWith('gravestone'));

    test('graves are props, drawn from at least eight silhouettes', () => {
        const kinds = new Set(graves.map(g => g.type));
        assert.ok(kinds.size >= 8, `graves use ${kinds.size} silhouette(s): ${[...kinds].join(', ') || 'none'}`);
    });

    test('every grave is solid — they were obstacles as tiles and still are', () => {
        const passable = graves.filter(g => g.solid === false).map(g => `(${g.x}, ${g.y})`);
        assert.deepEqual(passable, []);
    });
});

// ── Town: streetlights stand up ─────────────────────────────────────────────
//
// Was: STREETLIGHT, a one-cell tile drawing rpgUrban's squat lamp-with-a-red-
// lens, which read as a parking meter. rpgUrban's real streetlights are two
// cells tall and never fit a tile; as a 1x2 prop (the tree's shape) they do,
// and the player walks behind the lamp head.

describe('town streetlights', () => {
    const map = loadMap('town-map.json');
    const lamps = (map.props || []).filter(p => p.type === 'streetlight');

    test('streetlights are tall props', () => {
        assert.ok(lamps.length > 0, 'no streetlight props in Town');
        assert.equal(sprites.PROP_SPRITES.streetlight?.hTiles, 2, 'a streetlight should stand two tiles tall');
    });

    test('the one-cell lamp tile is retired', () => {
        assert.equal(TILES.STREETLIGHT, undefined);
    });
});

// ── Item 3, circus bonus: tents ────────────────────────────────────────────
//
// Was: TENT_STRIPE, red roof shingles standing in for a tent, over 344 cells.
// A tent is a 2x2 picture, so a tent tile draws the quadrant its cell's
// parity picks — which only works if every tent sits on even coordinates as
// one whole 2x2 of a single colour. That is what this pins.

describe('carnival tents', () => {
    const map = loadMap('circus-map.json');
    const tentIds = ['TENT_GREEN', 'TENT_TAN'].map(k => TILES[k]?.id);
    const at = (x, y) => (x >= 0 && y >= 0 && x < map.width && y < map.height) ? map.tiles[y * map.width + x] : -1;

    test('both tent colours exist as tiles and the carnival places both', () => {
        assert.ok(tentIds.every(id => Number.isInteger(id)), 'TILES.TENT_GREEN / TILES.TENT_TAN are not defined');
        for (const id of tentIds) assert.ok(map.tiles.includes(id), `tent id ${id} is placed nowhere in the carnival`);
    });

    test('every tent cell belongs to one whole, even-aligned 2x2 tent', () => {
        const broken = [];
        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const id = at(x, y);
                if (!tentIds.includes(id)) continue;
                // The other three cells of this cell's 2x2 block (by parity).
                const mates = [[x ^ 1, y], [x, y ^ 1], [x ^ 1, y ^ 1]];
                if (mates.some(([mx, my]) => at(mx, my) !== id)) broken.push(`(${x}, ${y})`);
            }
        }
        assert.deepEqual(broken, [], `tent cells that are not part of a whole tent: ${broken.join(' ')}`);
    });

    test('a tent tile resolves to the quadrant its cell parity picks', () => {
        assert.equal(typeof sprites.tileFrame, 'function', 'sprites.js exports no tileFrame(ref, x, y)');
        const ref = sprites.ZONE_TILE_SPRITE_MAP[TILES.TENT_GREEN?.id];
        assert.ok(ref, 'TENT_GREEN has no sprite entry');
        const O = sprites.OUTLINED_SPRITES;
        assert.equal(sprites.tileFrame(ref, 10, 4).col, O.tentGreenTL);
        assert.equal(sprites.tileFrame(ref, 11, 4).col, O.tentGreenTR);
        assert.equal(sprites.tileFrame(ref, 10, 5).col, O.tentGreenBL);
        assert.equal(sprites.tileFrame(ref, 11, 5).col, O.tentGreenBR);
    });

    test('tents stand on carnival ground, so their transparent corners do not show the void', () => {
        for (const id of tentIds) {
            assert.equal(sprites.ZONE_TILE_SPRITE_MAP[id]?.under, TILES.CIRCUS_GROUND.id, `tent id ${id} draws nothing beneath it`);
        }
    });
});
