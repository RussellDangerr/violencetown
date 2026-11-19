// PC2b: barks and creature examine text are plain (plans/pc2b-barks-examine-plain.md, ruling PCR3).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ENTRIES, OLD_SELF } from '../game/slots.js';
import { WILDERNESS_BEAR } from '../game/enemies.js';

const MAPS = ['town', 'carnival', 'graveyard', 'canyon', 'downtown', 'borgir', 'factory', 'sewer'];

// Every barks array and adjacencyBark string anywhere in a map, with its owner's id.
function lines(map) {
    const out = [];
    const walk = (o) => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (!o || typeof o !== 'object') return;
        for (const k of Object.keys(o)) {
            if (k === 'barks') for (const b of o[k]) out.push({ id: o.id, line: b });
            else if (k === 'adjacencyBark') out.push({ id: o.id, line: o[k] });
            else walk(o[k]);
        }
    };
    walk(JSON.parse(readFileSync(fileURLToPath(new URL(`../game/${map}-map.json`, import.meta.url)), 'utf8')));
    return out;
}

const plain = (s) => typeof s === 'string' && s.trim().length > 0 && !/[\[\]]/.test(s);

describe('map barks are plain', () => {
    for (const m of MAPS) {
        test(`${m}: every bark and adjacencyBark is non-empty with no brackets`, () => {
            const ls = lines(m);
            assert.ok(ls.length > 0);
            for (const { id, line } of ls) assert.ok(plain(line), `${id}: ${line}`);
        });
    }
    test('exact lines for the adjacency barks', () => {
        const by = (m, id) => lines(m).filter(l => l.id === id).map(l => l.line);
        assert.deepEqual(by('carnival', 'clown1'), ['The Carnival Clown fights if you hit it.']);
        assert.deepEqual(by('graveyard', 'skel1'), ['The Rattling Skeleton fights if you hit it.']);
        assert.deepEqual(by('factory', 'green1'), ['The Greedy Green fights if you hit it.']);
        assert.deepEqual(by('borgir', 'borgir_boss'), ['The Boss says the Were-Rat in the Sewer has your Cataclysmic Converter. Get it back.']);
        assert.deepEqual(by('canyon', 'pike').slice(-1), ['Pike has a grappling hook. Clear the two canyon rats and he gives it to you.']);
        assert.deepEqual(by('sewer', 'carrion'), ['Carrion says the road is blocked.']);
    });
});

describe('slots.js barks and examine text are plain', () => {
    test('every entry bark, adjacencyBark and examine is plain', () => {
        for (const [k, e] of Object.entries(ENTRIES)) {
            for (const b of e.barks ?? []) assert.ok(plain(b), `${k}: ${b}`);
            if (e.adjacencyBark !== undefined) assert.ok(plain(e.adjacencyBark), k);
            if (e.examine !== undefined) assert.ok(plain(e.examine), `${k}: ${e.examine}`);
        }
        for (const b of OLD_SELF.barks) assert.ok(plain(b));
    });
    test('the Strongman, a creature and the Bear', () => {
        assert.equal(ENTRIES.crying_angel.examine, 'Angel. A stone figure. It moves and hits only while you look at it.');
        assert.equal(ENTRIES.ankou.examine, 'Ankou. A skeleton with a ghost around it. It attacks when it sees you.');
        assert.equal(ENTRIES.siberia.examine, 'Siberia. Boss. She attacks when she sees you.');
        assert.equal(ENTRIES.strongman.adjacencyBark, 'The Strongman stands here. A gift can turn him to your side.');
        assert.equal(ENTRIES.yeti.examine, 'Yeti. It attacks when it sees you.');
        assert.equal(ENTRIES.compactor.examine, 'Trash compactor. It does not attack. Break it to stop the walls.');
        assert.equal(WILDERNESS_BEAR.examine, 'Bear. Wild animal. It attacks when it sees you.');
    });
});
