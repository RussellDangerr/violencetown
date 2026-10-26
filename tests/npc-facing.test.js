// npc-facing.test.js — the named town NPCs face where they are going (DS1).
//
// They borrow the RPG Urban people's four-way walking frames, the same way the
// Violencian crowd does. These tests walk each one a step in every direction
// through the real step path (pathing.js stepEntity) and check the cell
// spriteFrame hands the renderer.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_SPRITES, spriteFrame } from '../game/sprites.js';
import { stepEntity } from '../game/pathing.js';

const NAMED_TOWN_NPCS = ['Vendor', 'Stranger', 'Bootlegger', 'Banker', 'Operator', 'Cook'];

// Measured against tools/contact_rpgUrban.png (see ENEMY_SPRITES).
const URBAN_COLS = { up: 25, down: 24, left: 23, right: 26 };
const URBAN_ROWS = 18;   // the sheet's height in cells; six people, three rows each

const STEPS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function walk(dir) {
    const npc = { id: 'walker', x: 5, y: 5 };
    const [dx, dy] = STEPS[dir];
    stepEntity(npc, npc.x + dx, npc.y + dy, 150);
    return npc;
}

describe('named town NPCs face their travel', () => {
    for (const type of NAMED_TOWN_NPCS) {
        const info = ENEMY_SPRITES[type];

        test(`${type} draws an RPG Urban person with four-way walking frames`, () => {
            assert.ok(info, `${type} has no ENEMY_SPRITES entry`);
            assert.equal(info.sheet, 'rpgUrban');
            assert.deepEqual(info.dirCols, [URBAN_COLS.up, URBAN_COLS.down, URBAN_COLS.left, URBAN_COLS.right]);
            assert.equal(info.walkRows, 3);
        });

        test(`${type}'s base cell is a person's standing, down-facing pose`, () => {
            assert.equal(info.col, URBAN_COLS.down, 'the base cell must be the down-facing column');
            assert.equal(info.row % 3, 0, 'the base row must start a person, not land mid walk cycle');
            assert.ok(info.row + info.walkRows <= URBAN_ROWS, 'the walk cycle runs off the sheet');
        });

        test(`${type} faces each of the four ways it steps`, () => {
            for (const dir of Object.keys(STEPS)) {
                const frame = spriteFrame(info, walk(dir), { animating: true, progress: 0.5 });
                assert.equal(frame.col, URBAN_COLS[dir], `${type} stepping ${dir} drew col ${frame.col}`);
                assert.equal(frame.sheet, 'rpgUrban');
                // A facing never swaps the person: the row stays in this NPC's own block.
                assert.ok(frame.row > info.row && frame.row < info.row + info.walkRows,
                    `${type} stepping ${dir} left its own walk cycle (row ${frame.row})`);
            }
        });

        test(`${type} at rest keeps the way it last walked`, () => {
            const npc = walk('up');
            const rest = spriteFrame(info, npc, { animating: false, idleTick: 0, phase: 0 });
            assert.equal(rest.col, URBAN_COLS.up);
            assert.equal(rest.row, info.row, 'at rest on tick 0 the NPC stands on its base row');
        });
    }

    test('no two named town NPCs share a look', () => {
        const seen = new Map();
        for (const type of NAMED_TOWN_NPCS) {
            const key = `${ENEMY_SPRITES[type].sheet}:${ENEMY_SPRITES[type].row}`;
            assert.ok(!seen.has(key), `${type} and ${seen.get(key)} draw the same person (${key})`);
            seen.set(key, type);
        }
    });

    test('the crowd keeps at least one look of its own', () => {
        const { variants } = ENEMY_SPRITES['Violencian'];
        assert.ok(variants.length >= 1, 'the Violencian crowd has no looks left');
    });
});
