// hints.test.js — the tutorial that is not a tutorial.
//
// The game had onboarding but not teaching: one overlay listing seven controls
// in a single breath, a quest HUD that says where to GO but never what a verb
// IS, and two one-shot lines. Nothing revealed that you can trade, steal, fence,
// or use an item on the world — so the deepest systems in the game were
// invisible to anyone giving it ninety seconds.
//
// The design constraint under test: each line fires when the player is ALREADY
// STANDING in the situation it describes, because the situation is the lesson.
// Never a mode, never a gate, never something to skip.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { HINTS, nextHint } from '../game/hints.js';

const alive = () => ({ isAlive: () => true });
const at = (x, y, over = {}) => ({ x, y, entity: alive(), ...over });

function game(over = {}) {
    return {
        playerX: 5, playerY: 5, playerHp: 100, playerMaxHp: 100,
        enemies: [], inventory: [], selectedSlot: -1,
        _hot: {},
        isHidden: () => false,
        _contextualUsesFor: () => [],
        ...over,
    };
}
const none = () => false;

describe('the table itself', () => {
    test('every hint is complete enough to fire', () => {
        for (const h of HINTS) {
            assert.ok(h.id, 'every hint needs an id — that is what gets remembered');
            assert.equal(typeof h.when, 'function', `${h.id}: when`);
            assert.ok(h.text && h.text.length > 10, `${h.id}: text`);
        }
    });

    test('ids are unique, or one lesson would suppress another forever', () => {
        const ids = HINTS.map(h => h.id);
        assert.equal(new Set(ids).size, ids.length);
    });

    test('every line is bracketed, like every other log line in the game', () => {
        for (const h of HINTS) {
            assert.match(h.text, /^\[.*\]$/, `${h.id} is not in the house voice`);
        }
    });
});

describe('a hint fires only when you are standing in its situation', () => {
    test('a vendor beside you teaches the offer screen', () => {
        const g = game({ enemies: [at(5, 4, { vendor: true })] });
        assert.equal(nextHint(g, none).id, 'vendorNearby');
    });

    test('a vendor across the room teaches nothing', () => {
        const g = game({ enemies: [at(20, 20, { vendor: true })] });
        assert.equal(nextHint(g, none), null);
    });

    test('standing unseen beside somebody teaches the blind spot', () => {
        const g = game({ enemies: [at(5, 4)], isHidden: () => true });
        assert.equal(nextHint(g, none).id, 'blindSpot');
    });

    test('being SEEN beside somebody teaches nothing — that is not the lesson', () => {
        const g = game({ enemies: [at(5, 4)], isHidden: () => false });
        assert.equal(nextHint(g, none), null);
    });

    test('carrying something that works here teaches contextual use', () => {
        const g = game({
            inventory: [{ itemDef: { id: 'soap' } }],
            _contextualUsesFor: (d) => (d.id === 'soap' ? [{ id: 'soap-on-sludge' }] : []),
        });
        assert.equal(nextHint(g, none).id, 'contextualUse');
    });

    test('carrying something that does NOT work here teaches nothing', () => {
        const g = game({ inventory: [{ itemDef: { id: 'rock' } }] });
        assert.equal(nextHint(g, none), null);
    });

    test('hot goods name the fence, at the moment shops start refusing', () => {
        assert.equal(nextHint(game({ _hot: { soap: 1 } }), none).id, 'hotGoods');
        assert.equal(nextHint(game({ _hot: { soap: 0 } }), none), null,
            'a fenced item is no longer hot');
    });

    test('being badly hurt points at the hotbar', () => {
        assert.equal(nextHint(game({ playerHp: 30 }), none).id, 'wounded');
        assert.equal(nextHint(game({ playerHp: 90 }), none), null);
    });

    test('an ally beside you is not a stranger to hide from', () => {
        const g = game({ enemies: [at(5, 4, { _ally: true })], isHidden: () => true });
        assert.equal(nextHint(g, none), null);
    });

    test('a corpse beside you teaches nothing', () => {
        const g = game({ enemies: [{ x: 5, y: 4, entity: { isAlive: () => false } }],
                         isHidden: () => true });
        assert.equal(nextHint(g, none), null);
    });
});

describe('one lesson at a time', () => {
    test('walking into a busy market teaches ONE thing, not five', () => {
        // Every condition true at once. This is the case that would otherwise
        // dump the whole table into the log in a single step.
        const g = game({
            enemies: [at(5, 4, { vendor: true })],
            isHidden: () => true,
            playerHp: 10,
            _hot: { soap: 1 },
            inventory: [{ itemDef: { id: 'soap' } }],
            _contextualUsesFor: () => [{ id: 'x' }],
        });
        const first = nextHint(g, none);
        assert.ok(first, 'something should fire');
        assert.equal(first.id, HINTS[0].id, 'and it should be the first in table order');
    });

    test('a seen hint steps aside for the next one that applies', () => {
        const g = game({ enemies: [at(5, 4, { vendor: true })], isHidden: () => true });
        assert.equal(nextHint(g, (id) => id === 'vendorNearby').id, 'blindSpot');
        assert.equal(nextHint(g, (id) => ['vendorNearby', 'blindSpot'].includes(id)), null);
    });

    test('every hint seen means silence, not a repeat', () => {
        const g = game({ enemies: [at(5, 4, { vendor: true })], isHidden: () => true, playerHp: 1 });
        assert.equal(nextHint(g, () => true), null);
    });
});

describe('a broken lesson must not break the turn', () => {
    test('a hint whose when() throws is skipped, not fatal', () => {
        const boom = { id: 'boom', when: () => { throw new Error('bad'); }, text: '[x]' };
        HINTS.unshift(boom);
        try {
            const g = game({ enemies: [at(5, 4, { vendor: true })] });
            assert.equal(nextHint(g, none).id, 'vendorNearby', 'the good hint still fires');
        } finally {
            HINTS.splice(HINTS.indexOf(boom), 1);
        }
    });

    test('a game that cannot answer anything yields null rather than throwing', () => {
        assert.equal(nextHint({}, none), null);
        assert.equal(nextHint(null, none), null);
    });

    test('no `seen` predicate at all is survivable', () => {
        assert.ok(nextHint(game({ enemies: [at(5, 4, { vendor: true })] }), null));
    });
});

// ── Pacing ──────────────────────────────────────────────────────────────────
//
// hints.js decides WHAT; main.js decides WHEN and remembers. Without a gap, a
// player walking up behind a shopkeeper is taught two different systems on two
// consecutive steps — verified in play before this was added, and it reads as
// the game talking over itself rather than noticing what you are doing.
//
// It is a GAP, not a cap: everything still gets taught eventually.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars = {}) {
    const at = mainSrc.indexOf(`${name}(${params}) {`);
    assert.ok(at > 0, `${name} not found`);
    const body = mainSrc.slice(at + name.length, mainSrc.indexOf('\n    }', at) + 6);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

const COOLDOWN = Number(/HINT_COOLDOWN_TURNS = (\d+)/.exec(mainSrc)[1]);

function harness(over = {}) {
    let stored = new Set();
    const logs = [];
    const show = liveMethod('_maybeShowHint', '', {
        readSeenHints: () => new Set(stored),
        writeSeenHints: (s) => { stored = new Set(s); },
        nextHint,
        HINT_COOLDOWN_TURNS: COOLDOWN,
    });
    const self = Object.assign(game({
        enemies: [at(5, 4, { vendor: true })], isHidden: () => true,
    }), { turn: 0, _log: (t) => logs.push(t) }, over);
    return { show, self, logs, seen: () => stored };
}

describe('lessons are paced, not queued', () => {
    test('the cooldown is a real number of turns', () => {
        assert.ok(COOLDOWN >= 2, `HINT_COOLDOWN_TURNS is ${COOLDOWN} — that is no gap at all`);
    });

    test('two lessons never land on consecutive turns', () => {
        const { show, self, logs } = harness();
        show.call(self);                       // turn 0 — teaches
        self.turn = 1;
        show.call(self);                       // turn 1 — must stay quiet
        assert.equal(logs.length, 1, `taught twice in two turns: ${JSON.stringify(logs)}`);
    });

    test('but the next lesson does arrive once the gap has passed', () => {
        const { show, self, logs } = harness();
        show.call(self);
        self.turn = COOLDOWN;
        show.call(self);
        assert.equal(logs.length, 2, 'the gap should open again, not close permanently');
        assert.notEqual(logs[0], logs[1], 'and it should be a DIFFERENT lesson');
    });

    test('a taught lesson is remembered across the gap', () => {
        const { show, self, seen } = harness();
        show.call(self);
        assert.equal(seen().size, 1);
        self.turn = COOLDOWN * 5;
        show.call(self);
        assert.equal(seen().size, 2, 'the second lesson is remembered too');
    });

    test('nothing applicable means silence, not a stalled cooldown', () => {
        const { show, logs } = harness();
        const quiet = Object.assign(game(), { turn: 0, _log: (t) => logs.push(t) });
        show.call(quiet);
        assert.equal(logs.length, 0);
    });
});
