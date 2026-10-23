// tags.test.js — the one tag vocabulary (plans/t1-tag-layer.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { TAGS, isTag, unknownTags, tagsOf, hasTag, tileTags } from '../game/tags.js';
import { validateContent } from '../game/content-validate.js';
import { RINGS, FUSIONS } from '../game/ring-data.js';
import { findFusion } from '../game/rings.js';
import { Enemy } from '../game/enemies.js';
import { TILES } from '../game/data.js';
import { weaponTiers, classBase } from '../game/weapons.js';

const gameDir = fileURLToPath(new URL('../game/', import.meta.url));
const maps = readdirSync(gameDir).filter(f => f.endsWith('-map.json')).sort()
    .map(file => ({ file, data: JSON.parse(readFileSync(join(gameDir, file), 'utf8')) }));

// Only the tag pass's own problems; validateContent also walks the real quest
// and dialogue graph, which is noise against a synthetic map list.
const tagProblems = (res) => res.problems.filter(p => /unknown tag '|tags must be an array/.test(p));

describe('the vocabulary', () => {
    test('holds the audit eight and every ring tag', () => {
        for (const t of ['flammable', 'metal', 'porous', 'wet', 'rigid', 'vermin', 'undead', 'conducts'])
            assert.ok(isTag(t), t);
        const ringTags = Object.values(RINGS).flatMap(r => r.tags || []);
        assert.ok(ringTags.length > 0);
        for (const t of ringTags) assert.ok(isTag(t), t);
        for (const fz of FUSIONS) for (const t of fz.pair) assert.ok(isTag(t), t);
    });
    test('has no duplicates and is frozen', () => {
        assert.equal(new Set(TAGS).size, TAGS.length);
        assert.ok(Object.isFrozen(TAGS));
    });
    test('unknownTags picks out strangers and non-strings', () => {
        assert.deepEqual(unknownTags(['metal', 'glitter', 7]), ['glitter', 7]);
        assert.deepEqual(unknownTags(undefined), []);
    });
});

describe('tagsOf', () => {
    test('reads a tags array, deduped', () => {
        assert.deepEqual(tagsOf({ tags: ['metal', 'rigid', 'metal'] }), ['metal', 'rigid']);
    });
    test('reads the vermin and sewerDweller flags as tags', () => {
        assert.deepEqual(tagsOf({ vermin: true }), ['vermin']);
        assert.deepEqual(tagsOf({ sewerDweller: true }), ['sewer']);
        assert.deepEqual(tagsOf({ tags: ['vermin'], vermin: true, sewerDweller: true }), ['vermin', 'sewer']);
        assert.deepEqual(tagsOf({ vermin: false, sewerDweller: false }), []);
    });
    test('is empty for nothing', () => {
        assert.deepEqual(tagsOf(null), []);
        assert.deepEqual(tagsOf('rock'), []);
        assert.deepEqual(tagsOf({}), []);
    });
    test('reads a live enemy, a ring and a tile', () => {
        const rat = new Enemy({ id: 'r', type: 'Rat', x: 0, y: 0, vermin: true, sewerDweller: true, tags: ['wet'] });
        assert.deepEqual(tagsOf(rat), ['wet', 'vermin', 'sewer']);
        assert.ok(hasTag(RINGS.rat_ring, 'sewer'));
        assert.deepEqual(tileTags(TILES.FLOOR.id), []);
        assert.deepEqual(tileTags(9999), []);
    });
    test('a weapon tier keeps its base tags', () => {
        const tiers = weaponTiers({ ...classBase('sword'), tags: ['metal'] });
        for (const d of tiers) assert.deepEqual(tagsOf(d), ['metal']);
    });
});

describe('ring fusions still key on ring tags', () => {
    test('rat ring beside fire ring makes the authored fusion, either order', () => {
        assert.equal(findFusion(RINGS.rat_ring, RINGS.fire_ring, FUSIONS)?.id, 'ember_rat');
        assert.equal(findFusion(RINGS.fire_ring, RINGS.rat_ring, FUSIONS)?.id, 'ember_rat');
    });
});

describe('enemy tags and saves', () => {
    test('tags survive toSave, JSON and fromSave', () => {
        const e = new Enemy({ id: 'g', type: 'Ghost', x: 2, y: 3, tags: ['undead', 'porous'] });
        const back = Enemy.fromSave(JSON.parse(JSON.stringify(e.toSave())));
        assert.deepEqual(back.tags, ['undead', 'porous']);
    });
    test('the ctor copies the array, so a spawn def is never shared', () => {
        const def = { id: 'g', type: 'Ghost', x: 0, y: 0, tags: ['undead'] };
        const e = new Enemy(def);
        e.tags.push('wet');
        assert.deepEqual(def.tags, ['undead']);
    });
    test('an untagged enemy saves with no tags key at all', () => {
        const e = new Enemy({ id: 't', type: 'Thug', x: 0, y: 0 });
        assert.deepEqual(e.tags, []);
        assert.ok(!('tags' in JSON.parse(JSON.stringify(e.toSave()))));
        assert.deepEqual(Enemy.fromSave(JSON.parse(JSON.stringify(e.toSave()))).tags, []);
    });
});

describe('the content check', () => {
    test('real content uses only known tags', () => {
        assert.ok(maps.length >= 12);
        assert.deepEqual(tagProblems(validateContent(maps)), []);
    });

    const bad = { tags: ['glitter'] };
    const cases = [
        ['an item',        { items: { thing: bad } }],
        ['a weapon',       { weapons: { blade: bad } }],
        ['a weapon tier',  { weaponTiers: { sword: [{ id: 'sword_grey', ...bad }] } }],
        ['a ring',         { rings: { odd_ring: bad } }],
        ['a fusion pair',  { fusions: [{ id: 'odd', pair: ['vermin', 'glitter'] }] }],
        ['a tile',         { tiles: { ODD: { id: 99, ...bad } } }],
        ['a registry entry', { entries: { odd: { type: 'Thug', ...bad } } }],
    ];
    for (const [what, opts] of cases) {
        test(`fails on an unknown tag on ${what}`, () => {
            const ps = tagProblems(validateContent([], opts));
            assert.ok(ps.some(p => p.includes("unknown tag 'glitter'")), ps.join('\n'));
        });
    }

    for (const list of ['enemies', 'items', 'examinables', 'props', 'containers']) {
        test(`fails on an unknown tag on a map's ${list} spawn`, () => {
            const ps = tagProblems(validateContent([{ file: 'x-map.json', data: { [list]: [{ id: 's1', ...bad }] } }]));
            assert.ok(ps.some(p => p.includes('x-map.json') && p.includes("unknown tag 'glitter'")), ps.join('\n'));
        });
    }

    test('fails when tags is not an array', () => {
        const ps = tagProblems(validateContent([], { items: { thing: { tags: 'metal' } } }));
        assert.ok(ps.some(p => p.includes('tags must be an array')), ps.join('\n'));
    });

    test('known tags pass clean', () => {
        const ps = tagProblems(validateContent(
            [{ file: 'x-map.json', data: { enemies: [{ id: 'e1', type: 'Thug', tags: ['metal'] }] } }],
            { items: { thing: { tags: ['flammable', 'wet'] } }, tiles: { ODD: { id: 99, tags: ['rigid'] } } },
        ));
        assert.deepEqual(ps, []);
    });
});
