// spirit-harvest.test.js — the harvested spirit set (plans/heroic-spirits.md,
// slice 2): which spirits are kept, a track retired when its map moves, and
// that no kept track stands where the maps say nobody can.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap } from '../game/map.js';
import { BARRICADE, CASTER, FIGHTER } from '../game/autoplay/player.js';
import { SCRIPTS } from '../game/autoplay/run.js';
import { HEROES, hashJson, zonesOf, retire, strandedRows, curate, attemptOf, endingOf } from '../game/spirits.js';

const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));

// A spirit as the harvest keeps it, small.
const spirit = ({ hero = 'Paul Bunyan', script = 'quest', seed = 1, cleared = true, stage = 'c', falls = [], maps = { sewer: 'aaaa' } } = {}) => {
    const track = [
        { t: 1, map: 'sewer', x: 2, y: 2, act: 'step' },
        ...falls.map((by, i) => ({ t: 2 + i, map: 'sewer', x: 3, y: 3, hp: 0, act: 'fell', by })),
        { t: 9, map: 'sewer', x: 4, y: 2, act: 'attack' },
    ];
    return {
        hero, attempt: seed, track,
        provenance: { seed, script, maps },
        outcome: { cleared, turn: 9, quest: 'fix_car', stage, falls: falls.length },
        anchors: [{ kind: cleared ? 'cleared' : 'stopped', turn: 9, map: 'sewer', who: 'fix_car' }],
    };
};

describe('a map hash', () => {
    test('is the same for the same map however its file is laid out', () => {
        const map = { width: 2, height: 1, tiles: [1, 0] };
        assert.equal(hashJson(map), hashJson(JSON.parse(JSON.stringify(map, null, 4).replace(/\n/g, '\r\n'))));
        assert.match(hashJson(map), /^[0-9a-f]{8}$/);
    });

    test('moves when one tile moves', () => {
        assert.notEqual(hashJson({ tiles: [1, 0, 0] }), hashJson({ tiles: [1, 0, 1] }));
    });

    test('a track names each zone it walked once', () => {
        assert.deepEqual(zonesOf([{ map: 'town' }, { map: 'sewer' }, { map: 'town' }]), ['town', 'sewer']);
    });
});

describe('rule 4: a spirit whose map moved', () => {
    test('stops showing its track, and keeps its outcome and anchors as history', () => {
        const s = spirit({ maps: { sewer: 'aaaa', town: 'bbbb' } });
        const r = retire(s, { sewer: 'aaaa', town: 'cccc' });
        assert.equal(r.track, null);
        assert.deepEqual(r.retired, ['town']);
        assert.deepEqual(r.outcome, s.outcome);
        assert.deepEqual(r.anchors, s.anchors);
        assert.equal(s.track.length, 2, 'the kept record is not changed');
    });

    test('a spirit whose maps all match keeps its track', () => {
        const s = spirit();
        assert.equal(retire(s, { sewer: 'aaaa', town: 'zzzz' }), s);
    });

    test('a map that is gone retires the track too', () => {
        assert.deepEqual(retire(spirit(), {}).retired, ['sewer']);
    });
});

describe('a track that stands where nobody can', () => {
    test('names each row on a tile that is not passable, and never a fallen foe', () => {
        const s = spirit();
        s.track.push({ t: 10, map: 'sewer', x: 4, y: 2, act: 'felled', who: 'rat' });
        const wall = (zone, x, y) => !(x === 4 && y === 2);
        assert.deepEqual(strandedRows(s, wall).map((r) => r.t), [9]);
        assert.deepEqual(strandedRows(s, () => true), []);
    });
});

describe('rule 5: the spirits a harvest keeps', () => {
    const runs = [
        spirit({ seed: 1, cleared: true }),
        spirit({ seed: 2, cleared: true }),
        spirit({ seed: 3, cleared: true, falls: ['were_rat'] }),
        spirit({ seed: 4, cleared: false, stage: 'b', falls: ['were_rat', 'were_rat', 'were_rat'] }),
        spirit({ seed: 5, cleared: false, stage: 'b', falls: ['were_rat', 'were_rat', 'were_rat'] }),
        spirit({ seed: 6, cleared: false, stage: 'a', falls: ['green'] }),
        spirit({ hero: 'Johnny Appleseed', script: 'sneak', seed: 1, cleared: true }),
    ];

    test('one spirit per way a run ended, the lowest seed, failures first, a few per hero', () => {
        const kept = curate(runs, 3);
        const bunyan = kept.filter((s) => s.hero === 'Paul Bunyan');
        assert.deepEqual(bunyan.map((s) => s.attempt), [4, 6, 3]);
        assert.deepEqual(kept.filter((s) => s.hero === 'Johnny Appleseed').map((s) => s.attempt), [1]);
    });

    test('with room, the clean clear comes last', () => {
        assert.deepEqual(curate(runs, 9).filter((s) => s.hero === 'Paul Bunyan').map((s) => s.attempt), [4, 6, 3, 1]);
    });

    test('an attempt row says how the run ended in a line the stats can count', () => {
        assert.equal(endingOf(runs[0]), 'cleared clean');
        assert.equal(endingOf(runs[2]), 'cleared after falling to were_rat');
        assert.equal(endingOf(runs[3]), 'stopped at b after falling to were_rat');
        const a = attemptOf(runs[3]);
        assert.deepEqual(a, { seed: 4, cleared: false, turn: 9, stage: 'b', falls: 3, ending: 'stopped at b after falling to were_rat' });
    });
});

describe('Mary Shelley, the caster (HS-R1)', () => {
    test('plays quest 1 with her own inclination, which only the harvest plays', () => {
        assert.equal(HEROES.caster, 'Mary Shelley');
        assert.deepEqual(SCRIPTS.caster, { route: 'fix_car', knobs: CASTER });
        assert.notDeepEqual(CASTER, FIGHTER);
        assert.equal(CASTER.spells[0], 'coneofcold');
    });
});

// The harvested set itself, as committed.
const set = read('../tools/autoplay-sim-spirits.json');
const maps = new Map();
const mapOf = (zone) => {
    if (!maps.has(zone)) maps.set(zone, new GameMap(read(`../game/${zone}-map.json`), `${zone}-map.json`));
    return maps.get(zone);
};

describe('the harvested spirit set', () => {
    test('belongs to the sim baseline as it stands: re-recording the baseline means npm run spirits:harvest (rule 4)', () => {
        assert.equal(set.baseline, hashJson(read('../tools/autoplay-sim-baseline.json')),
            'tools/autoplay-sim-baseline.json moved since the harvest; run npm run spirits:harvest');
    });

    test('has an attempt for every seed of every hero, and some spirits for each', () => {
        const [from, to] = set.seeds;
        for (const [script, hero] of Object.entries(set.heroes)) {
            const broken = set.broken.filter((b) => b.script === script).length;
            assert.equal(set.attempts[script].length + broken, to - from + 1, `${hero} is missing attempts`);
            assert.ok(set.spirits.some((s) => s.hero === hero), `no spirit kept for ${hero}`);
        }
        assert.ok(set.spirits.length > 0);
    });

    test('every kept spirit names the hash of each zone it walked', () => {
        for (const s of set.spirits) assert.deepEqual(Object.keys(s.provenance.maps).sort(), zonesOf(s.track).sort(), s.id);
    });

    // The free map-drift check: a kept track is drawn where the heroes stood,
    // so every place one stood must still be somewhere to stand. A barricade
    // counts: the hero breaks it and walks on.
    test('no kept track stands on a tile the maps now say nobody can', () => {
        const passable = (zone, x, y) => {
            const m = mapOf(zone);
            return m.isInBounds(x, y) && (m.isWalkable(x, y) || m.getTile(x, y) === BARRICADE);
        };
        let rows = 0;
        for (const s of set.spirits) {
            rows += s.track.length;
            const bad = strandedRows(s, passable);
            assert.deepEqual(bad.map((r) => `${r.map} ${r.x},${r.y} t${r.t}`), [], `${s.hero} (seed ${s.attempt}) stands on a wall`);
        }
        assert.ok(rows > 0, 'checked no rows at all');
    });

    test('a planted wall under a kept track is caught', () => {
        const s = set.spirits.find((x) => x.track.some((r) => r.act === 'step'));
        const row = s.track.find((r) => r.act === 'step');
        const walled = (zone, x, y) => !(zone === row.map && x === row.x && y === row.y);
        assert.ok(strandedRows(s, walled).length > 0);
    });
});
