// quest-count.test.js — the QUESTS tab counts finished quests out of every quest
// (plans/qc1-quest-count.md). The count is derived from the completed list, so it
// rides the existing save with no field of its own.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { QuestEngine, QUESTS } from '../game/quests.js';
import { Renderer } from '../game/renderer.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const ALL = Object.keys(QUESTS);
const fakeGame = () => {
    const g = { _log() {}, _render() {}, _sewerEscapeSetpiece() {}, inventory: [] };
    g.questEngine = new QuestEngine(g);
    return g;
};

describe('the quest count', () => {
    test('there is more than one quest, so the count has something to count', () => {
        assert.ok(ALL.length > 1, `QUESTS has ${ALL.length}`);
    });

    test('the total is every quest the game defines, the done number is the completed list', () => {
        const g = fakeGame();
        const qe = g.questEngine;
        assert.deepEqual(qe.getCompletedCount(), { done: 0, total: ALL.length });
        ALL.forEach((id, i) => {
            qe.forceComplete(id);
            assert.equal(qe.state.completed.length, i + 1);
            assert.deepEqual(qe.getCompletedCount(), { done: qe.state.completed.length, total: ALL.length });
        });
        assert.deepEqual(qe.getCompletedCount(), { done: ALL.length, total: ALL.length });
    });

    test('a quest finished twice still counts once', () => {
        const qe = fakeGame().questEngine;
        qe.forceComplete(ALL[0]);
        qe.forceComplete(ALL[0]);
        assert.equal(qe.getCompletedCount().done, 1);
    });

    test('the count survives a save and reload, with no new saved field', () => {
        const qe = fakeGame().questEngine;
        qe.forceComplete(ALL[0]);
        const saved = JSON.parse(JSON.stringify(qe.serialize()));
        assert.deepEqual(Object.keys(saved).sort(),
            ['activeId', 'completed', 'counters', 'flags', 'journal', 'stageIndex']);
        const reloaded = fakeGame().questEngine;
        reloaded.restore(saved);
        assert.deepEqual(reloaded.getCompletedCount(), { done: 1, total: ALL.length });
    });

    test('an id that is no longer a quest does not count', () => {
        const qe = fakeGame().questEngine;
        qe.restore({ completed: [ALL[0], 'not_a_quest'] });
        assert.equal(qe.getCompletedCount().done, 1);
    });
});

describe('the QUESTS tab draws the count beside COMPLETED', () => {
    function draw(game) {
        const drawn = [];
        const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
        const r = Object.assign(Object.create(Renderer.prototype), {
            ctx, font: { drawText: (c, text) => drawn.push(text) },
        });
        r._drawJournalQuestsBody(game, { x: 0, y: 0, w: 600, h: 500 });
        return drawn;
    }

    test('after the first quest the heading reads COMPLETED with 1 / total', () => {
        const g = fakeGame();
        g.questEngine.forceComplete(ALL[0]);
        const heading = draw(g).find(t => t.startsWith('COMPLETED'));
        assert.ok(heading, 'a COMPLETED heading is drawn');
        assert.match(heading, new RegExp(`^COMPLETED\\s+1 / ${ALL.length}$`));
    });

    test('the heading adds numbers only, no new words', () => {
        const g = fakeGame();
        g.questEngine.forceComplete(ALL[0]);
        const heading = draw(g).find(t => t.startsWith('COMPLETED'));
        assert.equal(heading.replace(/[\d\s/]/g, ''), 'COMPLETED');
    });
});
