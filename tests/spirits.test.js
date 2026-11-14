// spirits.test.js — heroic spirits (plans/heroic-spirits.md): the track rows,
// the record built from a finished run, and that reading a game for a spirit
// never draws on its dice.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { trackRow, fellRow, foesNow, felled, anchorsOf, knowledgeOf, spiritRecord, HEROES } from '../game/spirits.js';

const foe = (type, x, y, extra = {}) => {
    const f = { type, x, y, ...extra, hp: 10 };
    f.entity = { isAlive: () => f.hp > 0 };
    return f;
};

// A game as the recorder reads it, whose dice throw if anything touches them.
function game({ map = 'sewer-map.json', x = 3, y = 4, turn = 7, hp = 80, facing = 'up', enemies = [] } = {}) {
    return {
        _mapUrl: map, playerX: x, playerY: y, turn, playerHp: hp, facing, enemies,
        get rng() { throw new Error('a spirit drew on game.rng'); },
    };
}

describe('a spirit track row', () => {
    test('is where the hero stood and what it did, read before the action', () => {
        const r = trackRow(game(), { kind: 'step', dir: 'up' }, 'find_converter');
        assert.deepEqual(r, { t: 7, map: 'sewer', x: 3, y: 4, facing: 'up', hp: 80, act: 'step', dir: 'up', stage: 'find_converter' });
    });

    test('names the foe standing where it aimed', () => {
        const g = game({ enemies: [foe('were_rat', 4, 4), foe('green', 9, 9)] });
        const r = trackRow(g, { kind: 'attack', at: { x: 4, y: 4 }, dir: 'right' });
        assert.equal(r.target, 'were_rat');
        assert.deepEqual(r.at, { x: 4, y: 4 });
    });

    test('a fall row says to whom, at zero HP', () => {
        const r = fellRow(game(), 'were_rat', true);
        assert.equal(r.act, 'fell');
        assert.equal(r.by, 'were_rat');
        assert.equal(r.boss, true);
        assert.equal(r.hp, 0);
    });
});

describe('who fell while the hero acted', () => {
    test('a foe killed in the action, and a foe removed, each make a row', () => {
        const a = foe('green', 1, 1), b = foe('rat', 2, 2), c = foe('bat', 5, 5);
        const g = game({ enemies: [a, b, c] });
        const before = foesNow(g);
        a.hp = 0;
        g.enemies = [a, c];
        const rows = felled(g, before);
        assert.deepEqual(rows.map((r) => r.who).sort(), ['green', 'rat']);
        assert.ok(rows.every((r) => r.act === 'felled' && r.map === 'sewer'));
    });

    test('a zone change is not a kill', () => {
        const g = game({ enemies: [foe('green', 1, 1)] });
        const before = foesNow(g);
        g._mapUrl = 'town-map.json';
        g.enemies = [];
        assert.deepEqual(felled(g, before), []);
    });

    test('a boss that falls is marked', () => {
        const boss = foe('were_rat', 1, 1, { boss: true });
        const g = game({ enemies: [boss] });
        const before = foesNow(g);
        boss.hp = 0;
        assert.equal(felled(g, before)[0].boss, true);
    });
});

// A small quest run: two stages, a fall to the boss, then the boss felled.
const track = [
    { t: 1, map: 'town', act: 'step', stage: 'a' },
    { t: 5, map: 'sewer', act: 'step', stage: 'a' },
    { t: 9, map: 'sewer', act: 'attack', stage: 'b' },
    { t: 10, map: 'sewer', act: 'fell', by: 'were_rat', boss: true },
    { t: 12, map: 'sewer', act: 'attack', stage: 'b' },
    { t: 12, map: 'sewer', act: 'felled', who: 'rat', boss: false },
    { t: 15, map: 'sewer', act: 'attack', stage: 'b' },
    { t: 15, map: 'sewer', act: 'felled', who: 'were_rat', boss: true },
    { t: 18, map: 'factory', act: 'use', stage: 'c' },
];

describe('what a spirit remembers', () => {
    test('anchors are its first fall, the boss it felled and how it ended, oldest first', () => {
        const anchors = anchorsOf(track, { cleared: true, turn: 20, quest: 'fix_car' });
        assert.deepEqual(anchors.map((a) => [a.kind, a.turn, a.who]),
            [['fell', 10, 'were_rat'], ['felled', 15, 'were_rat'], ['cleared', 20, 'fix_car']]);
    });

    test('a run with many falls keeps the first and the last, never more than five anchors', () => {
        const falls = Array.from({ length: 9 }, (_, i) => ({ t: i * 2, map: 'sewer', act: 'fell', by: `foe${i}` }));
        const anchors = anchorsOf(falls, { cleared: false, turn: 30, quest: 'fix_car' });
        assert.ok(anchors.length <= 5);
        assert.deepEqual(anchors.map((a) => a.who), ['foe0', 'foe8', 'fix_car']);
        assert.equal(anchors[anchors.length - 1].kind, 'stopped');
    });

    test('knowledge counts foes felled, zones walked and stages finished, 0-3', () => {
        const k = knowledgeOf(track, { cleared: true, quest: 'fix_car' }, 3);
        assert.deepEqual(k.foes, { rat: 1, were_rat: 1 });
        assert.equal(k.zones.town, 1);      // walked only
        assert.equal(k.zones.sewer, 3);     // stages a and b were finished there
        assert.equal(k.zones.factory, 3);   // the quest was cleared there
        assert.deepEqual(k.quests, { fix_car: 3 });
    });

    test('an unfinished quest is known by how far the hero got', () => {
        const partial = track.slice(0, 4);
        assert.equal(knowledgeOf(partial, { cleared: false, quest: 'fix_car' }, 3).quests.fix_car, 2);
        assert.equal(knowledgeOf(partial.slice(0, 1), { cleared: false, quest: 'fix_car' }, 3).quests.fix_car, 1);
    });
});

describe('the spirit of a run', () => {
    test('belongs to the hero who plays the script (HS-R1)', () => {
        const s = spiritRecord({ script: 'quest', seed: 37, version: '0.33.0', finished: true, turn: 20,
            quest: { id: 'fix_car', stage: 3 }, stageCount: 3, track });
        assert.equal(s.hero, 'Paul Bunyan');
        assert.equal(s.id, 'quest:37');
        assert.equal(s.attempt, 37);
        assert.deepEqual(s.provenance, { seed: 37, script: 'quest', version: '0.33.0' });
        assert.equal(s.outcome.cleared, true);
        assert.equal(s.outcome.falls, 1);
        assert.equal(s.track, track);
    });

    test('the three scripts that exist each have a hero', () => {
        assert.deepEqual(HEROES, { quest: 'Paul Bunyan', sneak: 'Johnny Appleseed', loops: 'Amelia Earhart' });
    });

    test('a run that gave up says why, and is not cleared', () => {
        const s = spiritRecord({ script: 'sneak', seed: 2, finished: false, failure: 'b: stuck', turn: 9, quest: { id: 'fix_car', stage: 1 }, track });
        assert.equal(s.hero, 'Johnny Appleseed');
        assert.equal(s.outcome.cleared, false);
        assert.equal(s.outcome.gaveUp, 'b: stuck');
    });

    test('no hero, or no track, makes no spirit', () => {
        assert.equal(spiritRecord({ script: 'car', seed: 1, finished: true, turn: 3, track }), null);
        assert.equal(spiritRecord({ script: 'quest', seed: 1, finished: true, turn: 3, track: [] }), null);
    });

    test('recording a whole action never touches the dice', () => {
        const g = game({ enemies: [foe('green', 4, 4)] });
        const before = foesNow(g);
        const rows = [trackRow(g, { kind: 'attack', at: { x: 4, y: 4 } }, 'a')];
        g.enemies[0].hp = 0;
        rows.push(...felled(g, before), fellRow(g, 'green'));
        assert.doesNotThrow(() => spiritRecord({ script: 'quest', seed: 1, finished: false, turn: 7, track: rows }));
    });
});
