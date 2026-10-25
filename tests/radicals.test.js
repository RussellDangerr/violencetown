// radicals.test.js — map radicals (plans/map-radicals.md): hand-made pieces a map
// is built from. Every piece on disk is checked against the rules, the checker
// and the placer are held to them on broken copies, and Tiled round-trips a piece
// without touching a byte.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toTiled, fromTiled } from '../tools/tiled.mjs';
import { listRadicals, radicalProblems, placeRadical } from '../tools/radicals.mjs';
import { readFileSync } from 'node:fs';

const copy = o => JSON.parse(JSON.stringify(o));
const radicals = listRadicals();
const byName = Object.fromEntries(radicals.map(r => [r.name, r.data]));

describe('every radical on disk', () => {
    test('there are radicals to check', () => {
        assert.ok(radicals.length > 0, 'listRadicals found nothing in game/radicals/');
    });
    for (const { name, data } of radicals) {
        test(`${name} keeps the rules`, () => assert.deepEqual(radicalProblems(data), []));
        test(`${name}: Tiled import then export untouched is byte-identical`, () => {
            const text = readFileSync(radicals.find(r => r.name === name).file, 'utf8');
            const r = fromTiled(text, copy(toTiled(text)), { radical: true });
            assert.deepEqual(r.errors, []);
            assert.deepEqual(r.warnings, []);
            assert.equal(r.text, text);
        });
    }
});

// A small piece to break: floor with a wall in the middle, a mark and two sockets.
const PIECE = {
    note: 'A test piece.',
    width: 3, height: 3,
    tiles: [null, 60, null, 60, 61, 60, null, 60, null],
    props: [{ type: 'grappleRock', x: 1, y: 0 }],
    examinables: [{ id: 'test_rock', x: 1, y: 1, text: '[A rock.]' }],
    marks: [{ id: 'here', x: 2, y: 1 }],
    sockets: [{ x: 0, y: 1, w: 1, h: 1 }, { x: 1, y: 2, w: 1, h: 1 }],
};

describe('the checker', () => {
    const broken = (fn) => { const r = copy(PIECE); fn(r); return radicalProblems(r); };

    test('the test piece is clean', () => assert.deepEqual(radicalProblems(PIECE), []));

    const cases = {
        'a tile id not in TILES': r => { r.tiles[1] = 999; },
        'the wrong number of cells': r => { r.tiles.pop(); },
        'every cell null': r => { r.tiles = r.tiles.map(() => null); },
        'no note': r => { delete r.note; },
        'a mark on rock': r => { r.marks[0] = { id: 'here', x: 1, y: 1 }; },
        'a mark on a null cell': r => { r.marks[0] = { id: 'here', x: 0, y: 0 }; },
        'two marks with one name': r => { r.marks.push({ ...r.marks[0], y: 1, x: 0 }); },
        'a mark naming an unknown slot': r => { r.marks[0].slot = 'nowhere.boss'; },
        'a socket on a corner': r => { r.sockets[0] = { x: 0, y: 0, w: 1, h: 1 }; },
        'a socket in the middle': r => { r.sockets[0] = { x: 1, y: 1, w: 1, h: 1 }; },
        'a socket that is not walkable': r => { r.tiles[3] = 61; },
        'an object outside the piece': r => { r.examinables[0].x = 5; },
        'a list that belongs in the map': r => { r.enemies = [{ type: 'Rat', x: 1, y: 0 }]; },
        '2x2 tiles with no align': r => { r.width = 2; r.height = 2; r.tiles = [35, 35, 35, 35]; r.props = []; r.examinables = []; r.marks = []; r.sockets = []; },
        'a split 2x2 block': r => { r.align = 2; r.tiles[0] = 35; },
        'a prop with no sprite': r => { r.props[0].type = 'noSuchProp'; },
        'the Town car tile': r => { r.tiles[1] = 19; },
    };
    for (const [what, fn] of Object.entries(cases)) {
        test(`refuses ${what}`, () => assert.ok(broken(fn).length > 0, `no problem found for ${what}`));
    }

    test('a slot named only in spine.md counts', () => {
        assert.deepEqual(broken(r => { r.marks[0].slot = 'canyon.npc'; }), []);
    });
});

// A 10x8 room: wall border, floor inside, one rat and the spawn.
function room() {
    const W = 10, H = 8;
    const rows = [];
    for (let y = 0; y < H; y++) {
        const row = [];
        for (let x = 0; x < W; x++) row.push(x === 0 || y === 0 || x === W - 1 || y === H - 1 ? 61 : 60);
        rows.push('        ' + row.join(','));
    }
    return [
        '{',
        '    "width": 10,',
        '    "height": 8,',
        '    "spawn": {"x": 5, "y": 4},',
        '    "tiles": [',
        rows.join(',\n'),
        '    ],',
        '    "enemies": [',
        '        {"id": "rat", "type": "Rat", "x": 6, "y": 2}',
        '    ],',
        '    "props": []',
        '}',
        '',
    ].join('\n');
}

describe('the placer', () => {
    test('stamps tiles, carries objects, records the placement and reports marks', () => {
        const text = room();
        const r = placeRadical(text, PIECE, 'test/piece', 2, 2);
        assert.deepEqual(r.errors, []);
        const before = JSON.parse(text), after = JSON.parse(r.text);
        assert.equal(after.tiles[3 * 10 + 3], 61);                            // the wall, at (3,3)
        assert.equal(after.tiles.filter((t, n) => t !== before.tiles[n]).length, 1);
        assert.deepEqual(after.props, [{ type: 'grappleRock', x: 3, y: 2 }]);
        assert.deepEqual(after.examinables, [{ id: 'test_rock', x: 3, y: 3, text: '[A rock.]' }]);
        assert.deepEqual(after._radicals, [{ name: 'test/piece', x: 2, y: 2 }]);
        assert.ok(r.report.includes('mark here at (4,3)'), r.report.join('\n'));
        after.tiles = before.tiles; delete after.props; delete after.examinables; delete after._radicals; delete before.props;
        assert.deepEqual(after, before);
    });

    test('null cells keep the map underneath', () => {
        const r = placeRadical(room(), PIECE, 'test/piece', 2, 2);
        const after = JSON.parse(r.text);
        assert.equal(after.tiles[2 * 10 + 2], 60);
    });

    test('placing the same piece at the same spot twice changes nothing', () => {
        const once = placeRadical(room(), PIECE, 'test/piece', 2, 2).text;
        const twice = placeRadical(once, PIECE, 'test/piece', 2, 2);
        assert.deepEqual(twice.errors, []);
        assert.equal(twice.text, once);
    });

    // Each spot breaks exactly one rule, so the error has to be that one.
    const refusals = {
        'off the map': [8, 2, /runs off the 10x8 map/],
        'a wall on the rat': [5, 1, /would wall in: enemies rat at \(6,2\)$/],
        'a wall on the spawn': [4, 3, /would wall in: spawn at \(5,4\)$/],
        'a socket onto the border wall': [1, 2, /the w socket opens onto rock or off the map at \(0,3\)$/],
    };
    for (const [what, [x, y, why]] of Object.entries(refusals)) {
        test(`refuses ${what}, and writes nothing`, () => {
            const text = room();
            const r = placeRadical(text, PIECE, 'test/piece', x, y);
            assert.equal(r.errors.length, 1, r.errors.join('\n') || `no error for ${what}`);
            assert.match(r.errors[0], why);
            assert.equal(r.text, text);
        });
    }

    test('refuses an examinable id already elsewhere on the map', () => {
        const first = placeRadical(room(), PIECE, 'test/piece', 2, 2).text;
        const r = placeRadical(first, PIECE, 'test/piece', 4, 3);
        assert.match(r.errors.join('\n'), /test_rock is already on the map/);
    });

    test('an aligned piece refuses an odd spot', () => {
        const piece = { ...copy(PIECE), align: 2 };
        assert.ok(placeRadical(room(), piece, 'test/piece', 3, 2).errors.length > 0);
        assert.deepEqual(placeRadical(room(), piece, 'test/piece', 2, 2).errors, []);
    });

    test('a broken piece is refused before it touches the map', () => {
        const piece = copy(PIECE); piece.tiles[1] = 999;
        const text = room();
        const r = placeRadical(text, piece, 'test/piece', 2, 2);
        assert.ok(r.errors.length > 0);
        assert.equal(r.text, text);
    });
});

describe('Tiled and a radical', () => {
    test('an empty cell painted in Tiled exports as null, and a map still refuses one', () => {
        const name = Object.keys(byName)[0];
        const text = readFileSync(radicals[0].file, 'utf8');
        const tmj = copy(toTiled(text));
        const n = byName[name].tiles.findIndex(t => t !== null);
        tmj.layers[0].data[n] = 0;
        const r = fromTiled(text, tmj, { radical: true });
        assert.deepEqual(r.errors, []);
        assert.equal(JSON.parse(r.text).tiles[n], null);
        assert.equal(fromTiled(text, tmj).errors.length, 1);
    });
});
