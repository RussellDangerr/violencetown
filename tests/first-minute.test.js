// first-minute.test.js — the opening instruction has to be one a stranger can follow.
//
// A player reported three things about the first minute, and this pins the fix
// for the one a test can reach. The game told them "Your car won't start -
// examine it (E)". They pressed E where they spawned and got "[Road.]", because
// E reads the tile you FACE and the car is eight tiles away. The one instruction
// the game gives could not be followed as written, and "Road." gave no clue that
// the key had worked but was pointed at the wrong tile.
//
// Two changes, both pinned here:
//   - the objective says to GO, and still fits a phone;
//   - E on anything else, while a quest stage waits on an examine, says where
//     the real target is (examine.js questExamineHint).
//
// The wheel's key cue and Defend's move to Fight are pinned elsewhere
// (renderer is verified in the browser; wheel-model.test.js pins Defend).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { QUESTS } from '../game/quests.js';
import { questExamineHint } from '../game/examine.js';

// The HUD truncates an objective at floor(innerW / 8) chars and appends '~'.
// Measured on an emulated 375x812 phone: log panel 398px wide, 24px of padding,
// so floor(374 / 8) = 46. Below that, the tail of the line is cut off.
const PHONE_BUDGET = 46;

// getHudText appends " (n/N)" to a counted stage, so the worst case is the full count.
const hudLength = (stage) =>
    (stage.objective + (stage.on && stage.on.count ? ` (${stage.on.count}/${stage.on.count})` : '')).length;

describe('the opening objective', () => {
    const stage = QUESTS.fix_car.stages.find(s => s.id === 'examine_car');

    test('tells you to GO, not only to press E', () => {
        assert.match(stage.objective, /\bgo\b|\bwalk\b/i,
            'the car is 8 tiles from spawn; the objective must say to move');
        assert.match(stage.objective, /\(E\)/, 'and still names the key');
    });

    // This is the regression the fix itself nearly shipped: "walk to it and
    // examine it (E)" is 52 chars and rendered "...AND EXAMINE~" on a phone —
    // losing the (E) the whole line is about.
    test('fits on a phone without losing its key hint', () => {
        assert.ok(hudLength(stage) <= PHONE_BUDGET,
            `${hudLength(stage)} chars; a phone shows ${PHONE_BUDGET} before truncating`);
    });
});

describe('no objective overflows a phone', () => {
    // Two objectives ALREADY overflowed when this test was written, and are
    // flagged rather than silently rewritten, because they are authored copy.
    // Listed so a NEW long objective still fails loudly. If you shorten one,
    // delete it from this list — the test will tell you to.
    const KNOWN_OVERFLOW = new Set(['canyon_escape/find_way_out', 'deliver_burger/handoff']);

    for (const [qid, q] of Object.entries(QUESTS)) {
        for (const s of q.stages || []) {
            if (!s.objective) continue;
            const key = `${qid}/${s.id}`;
            test(key, () => {
                const len = hudLength(s);
                if (KNOWN_OVERFLOW.has(key)) {
                    assert.ok(len > PHONE_BUDGET,
                        `${key} fits now (${len}) — remove it from KNOWN_OVERFLOW`);
                    return;
                }
                assert.ok(len <= PHONE_BUDGET,
                    `${key} is ${len} chars and truncates on a phone (budget ${PHONE_BUDGET}): "${s.objective}"`);
            });
        }
    }
});

describe('E points at what the quest is waiting for', () => {
    // A stub game: the active stage waits on examining `car`, placed at `at`.
    const game = (at, stageOn = { type: 'examine', match: { targetId: 'car' } }) => ({
        questEngine: { currentStage: () => (stageOn ? { on: stageOn } : null) },
        examinables: [{ id: 'car', x: at[0], y: at[1] }],
        playerX: 0, playerY: 0,
    });

    test('from spawn it names the direction (the reported case: car to the northeast)', () => {
        // Spawn (16,12), car (24,6) — an offset of (+8, -6).
        assert.match(questExamineHint(game([8, -6]), { instanceId: null }), /northeast/);
    });

    test('all eight compass points resolve', () => {
        const cases = [[5, 0, 'east'], [5, -5, 'northeast'], [0, -5, 'north'], [-5, -5, 'northwest'],
                       [-5, 0, 'west'], [-5, 5, 'southwest'], [0, 5, 'south'], [5, 5, 'southeast']];
        for (const [dx, dy, dir] of cases) {
            const h = questExamineHint(game([dx, dy]), { instanceId: null });
            assert.ok(h.includes(`the ${dir} `), `offset (${dx},${dy}) should read ${dir}, got: ${h}`);
        }
    });

    test('beside the target but not facing it, it says to face it', () => {
        assert.match(questExamineHint(game([1, 0]), { instanceId: null }), /beside you.*face it/i);
    });

    test('silent when you ARE examining the target', () => {
        assert.equal(questExamineHint(game([8, -6]), { instanceId: 'car' }), null);
    });

    test('silent when no examine stage is active', () => {
        assert.equal(questExamineHint(game([8, -6], null), { instanceId: null }), null);
        assert.equal(questExamineHint(game([8, -6], { type: 'item_pickup', match: { id: 'x' } }), { instanceId: null }), null);
    });

    test('silent when the target is not on this map', () => {
        const g = game([8, -6]);
        g.examinables = [];
        assert.equal(questExamineHint(g, { instanceId: null }), null);
    });
});
