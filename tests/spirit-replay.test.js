// spirit-replay.test.js — the boss-door replay (plans/heroic-spirits.md,
// slice 3, HS-R2): which spirit shows near a boss, which of its rows, that the
// switch is off by default, and that nothing loads or shows while it is off.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { replaysOf, pickReplay, replayRow, loadReplays, resetReplays, spiritToShow,
         REPLAY_ROWS, REPLAY_RADIUS, ROW_MS, HOLD_ROWS } from '../game/spirit-replay.js';
import { DEFAULTS, validate } from '../game/settings.js';
import { hashJson } from '../game/spirits.js';

const src = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// A hero who walks east along row 11, falls to the Wererat at (11,11), gets up
// at the spawn, and falls again at (4,11).
function hero({ name = 'Paul Bunyan', seed = 15, cleared = false, walk = 12 } = {}) {
    const track = [{ t: 0, map: 'town', x: 5, y: 5, act: 'step' }];
    for (let i = 0; i < walk; i++) track.push({ t: 1 + i, map: 'sewer', x: i, y: 11, facing: 'right', act: 'step', dir: 'right' });
    track.push({ t: 13, map: 'sewer', x: 11, y: 11, act: 'felled', who: 'Rat', boss: false });
    track.push({ t: 13, map: 'sewer', x: 11, y: 11, hp: 0, act: 'fell', by: 'Wererat', boss: true });
    track.push({ t: 14, map: 'sewer', x: 1, y: 10, act: 'step', dir: 'right' });
    track.push({ t: 15, map: 'sewer', x: 4, y: 11, hp: 0, act: 'fell', by: 'Rat', boss: false });
    return { hero: name, attempt: seed, track, outcome: { cleared }, provenance: { maps: { sewer: 'aaaa', town: 'bbbb' } } };
}

describe('the replays in a spirit set', () => {
    test('one per fall to a boss: the rows lived just before it on that map, ending on the fall', () => {
        const [r, ...rest] = replaysOf([hero()]);
        assert.equal(rest.length, 0, 'a fall to a foe that is not a boss makes no replay');
        assert.equal(r.rows.length, REPLAY_ROWS + 1);
        assert.equal(r.rows.at(-1).act, 'fell');
        assert.deepEqual(r.at, { x: 11, y: 11 });
        assert.equal(r.by, 'Wererat');
        assert.ok(r.rows.every((x) => x.map === 'sewer' && x.act !== 'felled'), 'only the hero, only this map');
    });

    test('never reaches back past another map', () => {
        const [r] = replaysOf([hero({ walk: 3 })]);
        assert.deepEqual(r.rows.map((x) => x.map), ['sewer', 'sewer', 'sewer', 'sewer']);
    });

    test('a retired spirit (no track) has none', () => {
        assert.deepEqual(replaysOf([{ ...hero(), track: null }]), []);
    });
});

describe('the replay that shows', () => {
    const standing = new Set(['Wererat']);
    const replays = replaysOf([hero({ seed: 15 }), hero({ name: 'Mary Shelley', seed: 4, cleared: true }), hero({ seed: 20 })]);

    test('near where a spirit fell, its boss still standing: a spirit that never cleared, the lowest seed', () => {
        const r = pickReplay(replays, 'sewer', { x: 8, y: 10 }, standing);
        assert.equal(r.hero, 'Paul Bunyan');
        assert.equal(r.attempt, 15);
    });

    test('out of range, on another map, or once the boss is down: nothing', () => {
        assert.equal(pickReplay(replays, 'sewer', { x: 11 - REPLAY_RADIUS - 1, y: 11 }, standing), null);
        assert.ok(pickReplay(replays, 'sewer', { x: 11 - REPLAY_RADIUS, y: 11 }, standing));
        assert.equal(pickReplay(replays, 'town', { x: 11, y: 11 }, standing), null);
        assert.equal(pickReplay(replays, 'sewer', { x: 11, y: 11 }, new Set(['Rat'])), null);
    });

    test('a spirit that cleared shows when it is the only one', () => {
        const only = replaysOf([hero({ name: 'Mary Shelley', seed: 4, cleared: true })]);
        assert.equal(pickReplay(only, 'sewer', { x: 11, y: 11 }, standing).hero, 'Mary Shelley');
    });

    test('steps one row per beat, holds on the fall, then loops', () => {
        const r = replays[0];
        const n = r.rows.length;
        assert.equal(replayRow(r, 0), r.rows[0]);
        assert.equal(replayRow(r, ROW_MS * 1.5), r.rows[1]);
        assert.equal(replayRow(r, ROW_MS * (n - 1)), r.rows[n - 1]);
        assert.equal(replayRow(r, ROW_MS * (n + HOLD_ROWS - 1)), r.rows[n - 1], 'held on the fall');
        assert.equal(replayRow(r, ROW_MS * (n + HOLD_ROWS)), r.rows[0], 'and from the top');
    });
});

describe('the switch (HS-R2)', () => {
    beforeEach(() => resetReplays());

    test('is off by default, and survives a save', () => {
        assert.equal(DEFAULTS.spirits, false);
        assert.equal(validate({}).spirits, false);
        assert.equal(validate({ spirits: true }).spirits, true);
        assert.equal(validate({ spirits: 'yes' }).spirits, false);
    });

    test('off: nothing shows, and nothing is fetched', () => {
        const before = globalThis.fetch;
        let fetched = 0;
        globalThis.fetch = () => { fetched++; return Promise.reject(new Error('no')); };
        try {
            assert.equal(spiritToShow({ _mapUrl: 'sewer-map.json', playerX: 11, playerY: 11, enemies: [] }, false, 0), null);
            assert.equal(fetched, 0);
        } finally { globalThis.fetch = before; }
    });

    test('on: loads the set, retires a track whose map moved, then shows what is left', async () => {
        const sewer = { tiles: [1] }, town = { tiles: [2] };
        const kept = { ...hero({ seed: 15 }), provenance: { maps: { sewer: hashJson(sewer), town: hashJson(town) } } };
        const moved = { ...hero({ seed: 2 }), provenance: { maps: { sewer: 'stale', town: hashJson(town) } } };
        const files = { 'spirits-harvest.json': { spirits: [moved, kept] }, 'sewer-map.json': sewer, 'town-map.json': town };
        const got = await loadReplays(async (url) => files[url]);
        assert.deepEqual(got.map((r) => r.attempt), [15], 'the spirit on a moved map is retired');
        const wererat = { type: 'Wererat', entity: { isAlive: () => true } };
        const show = spiritToShow({ _mapUrl: 'sewer-map.json', playerX: 9, playerY: 11, enemies: [wererat] }, true, 0);
        assert.equal(show.hero, 'Paul Bunyan');
        assert.equal(show.attempt, 15);
        assert.equal(show.row.map, 'sewer');
    });

    test('a set that will not load shows nothing and does not throw', async () => {
        assert.deepEqual(await loadReplays(async () => { throw new Error('offline'); }), []);
        assert.equal(spiritToShow({ _mapUrl: 'sewer-map.json', playerX: 11, playerY: 11, enemies: [] }, true, 0), null);
    });

    test('Options has the switch, and main.js and the renderer are wired to it', () => {
        assert.match(src('../game/index.html'), /id="opt-spirits"[^>]*role="switch"/);
        const main = src('../game/main.js');
        assert.match(main, /getElementById\('opt-spirits'\)/);
        assert.match(main, /this\._spiritShow = spiritToShow\(this, Settings\.get\('spirits'\)/);
        assert.match(src('../game/renderer.js'), /this\._drawSpirit\(game\)/);
    });

    test('the replay reads no dice', () => {
        const code = src('../game/spirit-replay.js').replace(/\/\/.*$/gm, '');
        assert.doesNotMatch(code, /\brng\b|Math\.random/);
    });
});
