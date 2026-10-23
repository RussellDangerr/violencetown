// affordance-matrix.test.js — every verb against every tag (plans/am1-affordance-matrix.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { MATRIX, EFFECTS, EMPTY, NONE, edgesOfVerb, edgesOfTag, matrixProblems } from '../game/affordances.js';
import { ROOT, targetVerbs, isLeaf } from '../game/wheel-model.js';
import { TAGS, tagsOf } from '../game/tags.js';
import { TAGGED_SPAWN_LISTS } from '../game/content-validate.js';
import { ITEMS } from '../game/items.js';
import { WEAPONS, WEAPON_TIERS } from '../game/weapons.js';
import { RINGS, FUSIONS } from '../game/ring-data.js';
import { TILES } from '../game/data.js';
import { ENTRIES } from '../game/slots.js';

const repo = fileURLToPath(new URL('../', import.meta.url));
const gameDir = join(repo, 'game');

// ── The verbs, found rather than typed ──────────────────────────────────────
function wheelLeaves(node, out = []) {
    if (isLeaf(node)) { out.push(node.key); return out; }
    for (const c of node.children) wheelLeaves(c, out);
    return out;
}
const LEAVES = wheelLeaves(ROOT);
// Every verb targetVerbs can push, read off its source so a branch no synthetic
// target reaches still counts.
const TARGET_KEYS = [...targetVerbs.toString().matchAll(/key:\s*'(\w+)'/g)].map(m => m[1]);
const VERBS = [...new Set([...LEAVES, ...TARGET_KEYS])];

// The size of EMPTY when this slice landed. It may only go down.
const EMPTY_MAX = { verbs: 21, tags: 8 };

const check = (over = {}) => matrixProblems({ verbs: VERBS, tags: TAGS, ...over });

// A deep, writable copy of the real matrix to break.
const copy = () => Object.fromEntries(Object.entries(MATRIX).map(([v, row]) => [v, { ...row }]));

describe('the verbs', () => {
    test('are the 21 wheel leaves plus the target-list verbs, without Cancel', () => {
        assert.equal(LEAVES.length, 21, LEAVES.join(', '));
        for (const k of ['hit', 'coin', 'run', 'cleanse']) assert.ok(LEAVES.includes(k), k);
        assert.ok(!LEAVES.includes('thieve') && !LEAVES.includes('flight'), 'a sub-wheel is not a verb');
        for (const k of ['examine', 'talk', 'trade', 'hit', 'shove', 'throw', 'take', 'open'])
            assert.ok(TARGET_KEYS.includes(k), `targetVerbs offers ${k}`);
        assert.ok(!VERBS.includes('cancel'));
        assert.equal(VERBS.length, 26, VERBS.join(', '));
    });
    test('the source read finds every verb a live target is offered', () => {
        const G = { playerX: 5, playerY: 5, inventory: [] };
        const npc = { x: 6, y: 5, allegiance: 'hostile', dialogueId: 'x', entity: { isAlive: () => true } };
        const keys = targetVerbs({ x: 6, y: 5, npc, item: { def: {} }, container: { type: 'crate' } }, G).map(v => v.key);
        assert.ok(keys.length >= 7, keys.join(', '));
        for (const k of keys) assert.ok(TARGET_KEYS.includes(k), k);
    });
});

describe('the real matrix', () => {
    test('has no problems', () => {
        assert.deepEqual(check(), []);
    });
    test('has a row for every verb and a column for every tag, each cell filled', () => {
        assert.deepEqual(Object.keys(MATRIX).sort(), [...VERBS].sort());
        for (const v of VERBS) {
            assert.deepEqual(Object.keys(MATRIX[v]).sort(), [...TAGS].sort(), v);
            for (const t of TAGS) assert.ok(MATRIX[v][t] === NONE || EFFECTS[MATRIX[v][t]], `${v} x ${t}`);
        }
    });
    test('is frozen', () => {
        assert.ok(Object.isFrozen(MATRIX) && Object.isFrozen(MATRIX.hit) && Object.isFrozen(EFFECTS) && Object.isFrozen(EMPTY.verbs));
    });
    test('the edges it has today', () => {
        assert.deepEqual(edgesOfTag('sewer').sort(), ['ranged', 'throw', 'trade']);
        assert.deepEqual(edgesOfTag('flammable').sort(), ['emberrat', 'fireball', 'ranged', 'throw']);
        assert.deepEqual(edgesOfVerb('throw').sort(), ['flammable', 'sewer']);
        assert.deepEqual(edgesOfVerb('hit'), []);
    });
});

describe('a blank or unknown cell fails', () => {
    test('a missing cell', () => {
        const m = copy(); delete m.hit.metal;
        assert.ok(check({ matrix: m }).includes('hit x metal: blank cell'));
    });
    test('an empty-string or null cell', () => {
        const m = copy(); m.spin.wet = ''; m.boo.rigid = null;
        const ps = check({ matrix: m });
        assert.ok(ps.includes('spin x wet: blank cell') && ps.includes('boo x rigid: blank cell'), ps.join('\n'));
    });
    test('a cell naming no effect', () => {
        const m = copy(); m.cleave.metal = 'clangs';
        assert.ok(check({ matrix: m }).includes("cleave x metal: unknown effect 'clangs'"));
    });
    test('a verb with no row, and a row with no verb', () => {
        const m = copy(); delete m.open; m.juggle = { ...m.hit };
        const ps = check({ matrix: m });
        assert.ok(ps.includes("verb 'open' has no row") && ps.includes("row 'juggle' is not a verb"), ps.join('\n'));
    });
    test('a new wheel leaf with no row', () => {
        assert.ok(check({ verbs: [...VERBS, 'pirouette'] }).includes("verb 'pirouette' has no row"));
    });
    test('a new tag with no column', () => {
        const ps = check({ tags: [...TAGS, 'glass'] });
        assert.ok(ps.includes('hit x glass: blank cell'), ps.join('\n'));
    });
    test('a column that is not a tag', () => {
        const m = copy(); m.hit.glitter = NONE;
        assert.ok(check({ matrix: m }).includes("hit: column 'glitter' is not a tag"));
    });
});

describe('no edges fails, unless on EMPTY, which can only shrink', () => {
    test('a verb with no edges and off EMPTY fails', () => {
        const m = copy(); for (const t of TAGS) m.fireball[t] = NONE;
        const ps = check({ matrix: m });
        assert.ok(ps.includes("verb 'fireball' has no edges"), ps.join('\n'));
    });
    test('a tag with no edges and off EMPTY fails', () => {
        const m = copy(); for (const v of VERBS) m[v].sewer = NONE;
        const ps = check({ matrix: m });
        assert.ok(ps.includes("tag 'sewer' has no edges"), ps.join('\n'));
    });
    test('taking an entry off EMPTY while it is still empty fails', () => {
        const ps = check({ empty: { verbs: EMPTY.verbs.filter(v => v !== 'wait'), tags: EMPTY.tags.filter(t => t !== 'undead') } });
        assert.ok(ps.includes("verb 'wait' has no edges") && ps.includes("tag 'undead' has no edges"), ps.join('\n'));
    });
    test('an entry that gains an edge must come off EMPTY', () => {
        const m = copy(); m.wait.undead = 'sets_alight';
        const ps = check({ matrix: m });
        assert.ok(ps.includes("EMPTY lists verb 'wait', which has edges: take it off"), ps.join('\n'));
        assert.ok(ps.includes("EMPTY lists tag 'undead', which has edges: take it off"), ps.join('\n'));
    });
    test('EMPTY names only real verbs and tags', () => {
        const ps = check({ empty: { verbs: [...EMPTY.verbs, 'nap'], tags: [...EMPTY.tags, 'glass'] } });
        assert.ok(ps.includes("EMPTY lists 'nap', which is not a verb") && ps.includes("EMPTY lists 'glass', which is not a tag"), ps.join('\n'));
    });
    test('EMPTY is no bigger than when it was written', () => {
        assert.ok(EMPTY.verbs.length <= EMPTY_MAX.verbs, `EMPTY.verbs grew to ${EMPTY.verbs.length}`);
        assert.ok(EMPTY.tags.length <= EMPTY_MAX.tags, `EMPTY.tags grew to ${EMPTY.tags.length}`);
        assert.equal(new Set(EMPTY.verbs).size, EMPTY.verbs.length);
        assert.equal(new Set(EMPTY.tags).size, EMPTY.tags.length);
    });
});

describe('the effects', () => {
    test('each one is in a cell and says what it does', () => {
        const fx = { ...EFFECTS, orphan: { status: 'live', does: 'x', see: ['game/tags.js', 'TAGS'] } };
        assert.ok(check({ effects: fx }).includes("effect 'orphan' is in no cell"));
        const bad = { ...EFFECTS, sets_alight: { status: 'maybe', does: '', see: ['plans/x.md'] } };
        const ps = check({ effects: bad });
        for (const p of ["effect 'sets_alight': status must be live or planned",
                         "effect 'sets_alight': says nothing about what it does",
                         "effect 'sets_alight': see must be [file, text]"]) assert.ok(ps.includes(p), ps.join('\n'));
    });
    test('each citation is real: a live effect names game code, a planned one names a plan', () => {
        const ids = Object.keys(EFFECTS);
        assert.ok(ids.length > 0);
        for (const id of ids) {
            const { status, see: [file, text] } = EFFECTS[id];
            if (status === 'live') assert.match(file, /^game\/[\w-]+\.js$/, id);
            else assert.match(file, /^plans\/[\w-]+\.md$/, id);
            const path = join(repo, file);
            assert.ok(existsSync(path), `${id}: ${file} is missing`);
            assert.ok(readFileSync(path, 'utf8').includes(text), `${id}: ${file} does not say "${text}"`);
        }
    });
});

describe('the tags', () => {
    test('every column is in the vocabulary', () => {
        for (const v of VERBS) for (const t of Object.keys(MATRIX[v])) assert.ok(TAGS.includes(t), `${v}: ${t}`);
    });
    test('every tag used in content is a column', () => {
        const used = new Set();
        const add = (thing) => { for (const t of tagsOf(thing)) used.add(t); };
        for (const d of Object.values(ITEMS)) add(d);
        for (const d of Object.values(WEAPONS)) add(d);
        for (const tiers of Object.values(WEAPON_TIERS)) for (const d of (tiers || [])) add(d);
        for (const d of Object.values(RINGS)) add(d);
        for (const fz of FUSIONS) for (const t of (fz.pair || [])) used.add(t);
        for (const d of Object.values(TILES)) add(d);
        for (const d of Object.values(ENTRIES)) add(d);
        const maps = readdirSync(gameDir).filter(f => f.endsWith('-map.json'));
        assert.ok(maps.length >= 12);
        for (const f of maps) {
            const data = JSON.parse(readFileSync(join(gameDir, f), 'utf8'));
            for (const list of TAGGED_SPAWN_LISTS) for (const s of (data[list] || [])) add(s);
        }
        // Rings carry vermin, sewer and fire today; a walk that found nothing proves nothing.
        assert.ok(used.size >= 3, [...used].join(', '));
        for (const t of used) assert.ok(TAGS.includes(t) && t in MATRIX.hit, `content tag '${t}' has no column`);
    });
});
