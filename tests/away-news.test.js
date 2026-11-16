// away-news.test.js (CK2) - after an hour or more away, the first zone change tells one piece of
// news. The zone change goes through the game's own world beat (_advanceWorldOnce takes the
// pending transition, loads the map and logs the entry); only the page-bound parts are stubbed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../game/main.js';
import { pickNews, readAway, tellAwayNews, NEWS_LINES, MS_PER_HOUR } from '../game/away.js';
globalThis.document = globalThis.document || new EventTarget();
globalThis.window = globalThis.window || new EventTarget();

globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (() => 0);
const T0 = 1_800_000_000_000;

function makeGame({ savedAt = T0, hoursLater = 5 } = {}) {
    const g = new Game();
    const log = [];
    g._log = (m) => { log.push(m); };
    g._render = () => {};
    g.autosave = () => {};
    g._loadMap = async () => { g.map = { zoneName: 'TESTZONE', getTile: () => 0, isWalkable: () => true }; };
    g._advanceWorldOnce = Game.prototype._advanceWorldOnce;
    readAway(g, savedAt, savedAt + hoursLater * MS_PER_HOUR + 1234);
    return { g, log };
}

async function changeZone(g) {
    g._pendingTransition = { toMap: 'canyon-map.json', toX: 1, toY: 1, label: '[Going]' };
    g.state = 'idle';
    g._advanceWorldOnce();
    await new Promise((r) => setTimeout(r, 0));
}

const newsLines = (log) => log.filter((m) => NEWS_LINES.some((n) => m.startsWith(n)));

describe('news after time away, through a real zone change', () => {
    test('an hour or more away: the first zone change gives exactly one news line, in [TEXT] words', async () => {
        const { g, log } = makeGame({ hoursLater: 5 });
        await changeZone(g);
        const news = newsLines(log);
        assert.equal(news.length, 1);
        assert.match(news[0], /^\[TEXT\]/);
        assert.ok(log.indexOf(news[0]) > log.findIndex((m) => m.startsWith('[Entered')), 'after the zone is entered');
        // told once: the next zone change says nothing
        await changeZone(g);
        assert.equal(newsLines(log).length, 1);
    });

    test('exactly one hour is enough; under an hour gives none', async () => {
        const one = makeGame({ hoursLater: 1 });
        await changeZone(one.g);
        assert.equal(newsLines(one.log).length, 1);
        const none = makeGame({ hoursLater: 0 });
        await changeZone(none.g);
        assert.equal(newsLines(none.log).length, 0);
    });

    test('a game with no away reading (a fresh run) gets none', async () => {
        const { g, log } = makeGame();
        g.hoursAway = undefined; g.awaySavedAt = undefined;
        await changeZone(g);
        assert.equal(newsLines(log).length, 0);
    });

    test('same save and same hours give the same news; game.rng is untouched', async () => {
        const a = makeGame({ hoursLater: 9 });
        const b = makeGame({ hoursLater: 9 });
        const stateA = a.g.rng.getState();
        await changeZone(a.g);
        await changeZone(b.g);
        assert.deepEqual(newsLines(a.log), newsLines(b.log));
        assert.equal(a.g.rng.getState(), stateA);
        // and every hour count lands on some pool line, varied across saves/hours
        const seen = new Set();
        for (let h = 1; h <= 60; h++) seen.add(pickNews(T0, h).split(' (')[0]);
        assert.ok(seen.size > 1, 'the pool is actually drawn from');
        assert.equal(pickNews(T0, 9), pickNews(T0, 9));
    });

    test('being away costs nothing: gold, health, bag and quests are the same after the news', async () => {
        const { g } = makeGame({ hoursLater: 30 });
        const before = JSON.stringify({
            gold: g.gold, hp: g.playerHp, mp: g.playerMp, inv: g.inventory,
            q: g.questEngine && g.questEngine.serialize ? g.questEngine.serialize() : null,
        });
        await changeZone(g);
        const after = JSON.stringify({
            gold: g.gold, hp: g.playerHp, mp: g.playerMp, inv: g.inventory,
            q: g.questEngine && g.questEngine.serialize ? g.questEngine.serialize() : null,
        });
        assert.equal(after, before);
    });
});

describe('the helper alone', () => {
    test('tellAwayNews tells once and forgets the absence', () => {
        const told = [];
        const g = { hoursAway: 3, awaySavedAt: T0 };
        assert.ok(tellAwayNews(g, (m) => told.push(m)));
        assert.equal(g.hoursAway, 0);
        assert.equal(tellAwayNews(g, (m) => told.push(m)), null);
        assert.equal(told.length, 1);
    });
});
