// pc5d: a return that grants the rested buff never shows a news line saying the save is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEWS_LINES, pickNews, restedOnReturn, REST_ZONE, BENCH_TILE, RESTED_BUFF, readAway, tellAwayNews, MS_PER_HOUR } from '../game/away.js';

const T0 = 1_800_000_000_000;
const UNTRUE = /nothing in your save changed|save is unchanged|nothing changed|unchanged/i;

test('no news line claims the save is unchanged or that nothing changed', () => {
    for (const l of NEWS_LINES) assert.ok(!UNTRUE.test(l), l);
});

test('a rested return gives the buff and every hour count tells a line that is still true', () => {
    for (let h = 1; h <= 168; h++) {
        const buffs = [];
        const g = {
            map: { url: REST_ZONE, getTile: (x, y) => (x === 6 && y === 5 ? BENCH_TILE : 0) },
            playerX: 5, playerY: 5, addBuff: (...a) => buffs.push(a),
        };
        readAway(g, T0, T0 + h * MS_PER_HOUR);
        const said = [];
        assert.equal(restedOnReturn(g, (m) => said.push(m)), true);
        assert.equal(buffs.length, 1);
        assert.equal(buffs[0][0], RESTED_BUFF.id);
        tellAwayNews(g, (m) => said.push(m));
        assert.equal(said.length, 2);
        for (const m of said) assert.ok(!UNTRUE.test(m), m);
        assert.equal(said[1], pickNews(T0, h));
    }
});

test('the hidden-tab line says away from the game, not closed', () => {
    assert.ok(NEWS_LINES.includes('You were away from the game for a while. Nothing was taken from you in that time.'));
    assert.ok(!NEWS_LINES.some((l) => /was closed/.test(l)));
});
