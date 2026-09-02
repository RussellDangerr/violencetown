// paranoia.test.js — what a failed search leaves behind (Thieve Task 11).
//
// A search that ends without a culprit does not simply reset. The victim tells
// people, and the immediate area gets warier of EVERYONE. Priced in whole trade
// bands, so the consequence is legible the instant you try to buy something and
// needs no new UI at all.
//
// It fires ONLY on a search that FAILS. Get caught and it stays between the two
// of you; get away with it and the chill spreads — which is the inversion that
// keeps it from being the goofy CRPG version where the whole map psychically
// knows what you did.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { spreadParanoia, PARANOIA_DELTA, PARANOIA_RADIUS } from '../game/give-action.js';
import { BANDS_STEP, band } from '../game/trade.js';
import { DISPOSITION_MIN } from '../game/disposition-curves.js';

function npc(x, y, over = {}) {
    return { x, y, disposition: 0, entity: { isAlive: () => true }, ...over };
}

describe('the price of it', () => {
    test('one failed search is exactly one trade band, not a flavour number', () => {
        assert.equal(Math.abs(PARANOIA_DELTA), BANDS_STEP);
    });

    test('and BANDS_STEP is the table\'s real spacing, not a literal beside it', () => {
        // Derived from BANDS rather than written as 25 a second time. If the bands
        // are ever re-spaced, paranoia follows them instead of silently drifting
        // half a tier out of step.
        assert.equal(BANDS_STEP, 25);
        for (const d of [75, 50, 25, 0, -25]) {
            assert.notEqual(band(d), band(d - BANDS_STEP),
                `${d} and ${d - BANDS_STEP} should be different bands`);
        }
    });

    test('a merchant really does drop one price tier', () => {
        // The whole reason for tying it to the band: no new UI, you just find out
        // at the counter.
        const before = band(50);
        const m = npc(1, 0, { disposition: 50 });
        spreadParanoia([m], { x: 0, y: 0 });
        const after = band(m.disposition);
        assert.notEqual(after.mood, before.mood);
        assert.ok(after.buy > before.buy, 'buying should get more expensive');
        assert.ok(after.sell < before.sell, 'and selling should pay worse');
    });
});

describe('who hears the rumour', () => {
    test('everyone in radius takes the hit', () => {
        const near = npc(3, 0), far = npc(20, 0);
        spreadParanoia([near, far], { x: 0, y: 0 });
        assert.equal(near.disposition, PARANOIA_DELTA);
        assert.equal(far.disposition, 0);
    });

    test('the radius is inclusive at its edge and stops one past it', () => {
        const edge = npc(PARANOIA_RADIUS, 0);
        const past = npc(PARANOIA_RADIUS + 1, 0);
        spreadParanoia([edge, past], { x: 0, y: 0 });
        assert.equal(edge.disposition, PARANOIA_DELTA);
        assert.equal(past.disposition, 0);
    });

    test('it is a square, not a circle — diagonals count the same', () => {
        const diag = npc(PARANOIA_RADIUS, PARANOIA_RADIUS);
        spreadParanoia([diag], { x: 0, y: 0 });
        assert.equal(diag.disposition, PARANOIA_DELTA);
    });

    test('the victim and your allies are exempt', () => {
        const victim = npc(1, 0), ally = npc(2, 0, { _ally: true });
        spreadParanoia([victim, ally], { x: 0, y: 0 }, victim);
        assert.equal(victim.disposition, 0, 'already at the floor; do not double-hit');
        assert.equal(ally.disposition, 0, 'loyalty is locked, same as the decay rule');
    });

    test('a dead bystander hears no rumour', () => {
        const a = npc(1, 0, { entity: { isAlive: () => false } });
        spreadParanoia([a], { x: 0, y: 0 });
        assert.equal(a.disposition, 0);
    });
});

describe('how it accumulates', () => {
    test('it stacks, and clamps at the floor', () => {
        const a = npc(1, 0, { disposition: -90 });
        spreadParanoia([a], { x: 0, y: 0 });
        assert.equal(a.disposition, DISPOSITION_MIN);
    });

    test('repeated failures keep biting until the floor, then stop', () => {
        const a = npc(1, 0, { disposition: 0 });
        for (let i = 0; i < 20; i++) spreadParanoia([a], { x: 0, y: 0 });
        assert.equal(a.disposition, DISPOSITION_MIN, 'never past the floor');
    });

    test('theft punches through the bad-deal floor on purpose', () => {
        // disposition-curves caps a bad DEAL at RESENT_FLOOR because haggling
        // badly must never be able to make an enemy. A crime is not a bad deal,
        // so paranoia is allowed all the way down.
        const a = npc(1, 0, { disposition: -25 });
        spreadParanoia([a], { x: 0, y: 0 });
        assert.ok(a.disposition < -25, 'paranoia must not be capped at the trade floor');
    });
});

describe('degenerate input', () => {
    test('no origin, no crowd, no crash', () => {
        spreadParanoia(null, { x: 0, y: 0 });
        spreadParanoia([], { x: 0, y: 0 });
        spreadParanoia([null, undefined], { x: 0, y: 0 });
        spreadParanoia([npc(1, 0)], null);
    });

    test('an NPC with no entity is skipped rather than thrown at', () => {
        const broken = { x: 1, y: 0, disposition: 0 };
        spreadParanoia([broken], { x: 0, y: 0 });
        assert.equal(broken.disposition, 0);
    });
});

// ── The blind sweep ─────────────────────────────────────────────────────────
//
// Not in the spec, and it had to be: applyHostileFlip sets the victim searching
// with NO last-seen, and npc.js's give-up test fires the moment the chase target
// is null. So a robbed victim would have abandoned the search on beat one and
// paranoia would have gone off instantly.
//
// That is also why BLIND_SWEEP_BEATS has been a dead constant since perception.js
// shipped: only a theft can produce a searcher with no lead, and the theft verb
// did not exist yet. It is live now — the victim casts about for real, which is
// what makes "get out of sight" a decision rather than a formality.

import { Enemy } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';
import { applyHostileFlip } from '../game/give-action.js';
import { BLIND_SWEEP_BEATS } from '../game/perception.js';

function world(rows) {
    const H = rows.length, W = rows[0].length;
    return {
        playerX: 40, playerY: 40,                 // far away and unseen
        enemies: [], containers: [], turn: 0, _MOVE_MS: 150,
        map: { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#',
               getRegion: () => null },
        rng: { pick: (a) => a[0], float: () => 0.5 },
        applyDamageToPlayer() {},
    };
}
const room = ['..........', '..........', '..........', '..........', '..........'];

describe('a robbed victim sweeps before giving up', () => {
    function robbedVictim() {
        const g = world(room);
        const v = new Enemy({ id: 'v1', type: 'guard', x: 5, y: 2, sightRange: 8, damage: 1 });
        g.enemies.push(v);
        tickNpcState(g, v, 0);                    // initialise the FSM
        applyHostileFlip(v);                      // noticed theft: searching, no lead
        v._robbedSweep = true;
        return { g, v };
    }

    test('the flip really does leave them with no lead to follow', () => {
        const { v } = robbedVictim();
        assert.equal(v.state, 'searching');
        assert.equal(v._lastSeenX, null);
    });

    test('they keep looking for BLIND_SWEEP_BEATS instead of quitting on beat one', () => {
        const { g, v } = robbedVictim();
        for (let i = 1; i < BLIND_SWEEP_BEATS; i++) {
            tickNpcState(g, v, i);
            assert.equal(v.state, 'searching', `gave up early, on beat ${i}`);
        }
    });

    test('and then give up, which is when the street hears about it', () => {
        const { g, v } = robbedVictim();
        const bystander = new Enemy({ id: 'b1', type: 'Violencian', x: 6, y: 2,
                                      behavior: ['IDLE'], sightRange: 0, disposition: 40 });
        g.enemies.push(bystander);

        let msgs = [];
        for (let i = 1; i <= BLIND_SWEEP_BEATS + 2 && v.state === 'searching'; i++) {
            msgs = tickNpcState(g, v, i) || [];
        }
        assert.equal(v.state, 'returning', 'the sweep should end');
        assert.equal(bystander.disposition, 40 + PARANOIA_DELTA, 'the neighbour got warier');
        assert.equal(v._robbedSweep, false, 'and it fires exactly once');
        assert.ok(msgs.some(m => /watching you now/.test(m.text || '')),
            `no paranoia line: ${JSON.stringify(msgs)}`);
    });

    test('an ordinary lost trail does NOT spread paranoia', () => {
        // The inversion that keeps this from being the psychic-map version: only
        // a FAILED THEFT search chills the street.
        const g = world(room);
        const chaser = new Enemy({ id: 'c1', type: 'guard', x: 5, y: 2, sightRange: 8, damage: 1 });
        const bystander = new Enemy({ id: 'b2', type: 'Violencian', x: 6, y: 2,
                                      behavior: ['IDLE'], sightRange: 0, disposition: 40 });
        g.enemies.push(chaser, bystander);
        tickNpcState(g, chaser, 0);
        chaser.state = 'chasing';
        chaser._lastSeenX = 5; chaser._lastSeenY = 2;    // standing on its own last-seen
        tickNpcState(g, chaser, 1);
        assert.equal(chaser.state, 'returning', 'it should lose the trail normally');
        assert.equal(bystander.disposition, 40, 'but nobody gossips about a normal chase');
    });
});
