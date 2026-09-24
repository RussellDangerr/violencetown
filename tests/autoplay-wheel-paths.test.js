// autoplay-wheel-paths.test.js — the wheel paths the autoplay fires are real.
//
// run.js addresses wheel verbs by key path (plans/quest1-autoplay.md §5.2) —
// ['treat', 'eat'], ['fight', 'magic', 'fireball'] — never by slot, so a
// reorder cannot break it. A rename or a move can, and only a headless Chrome
// run would notice. This reads every literal path out of run.js and walks it
// through wheel-model's ROOT, so the suite notices instead.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOT } from '../game/wheel-model.js';
import { FIGHTER, SNEAK } from '../game/autoplay/player.js';

const runSrc = readFileSync(new URL('../game/autoplay/run.js', import.meta.url), 'utf8');

function walk(keys) {
    let node = ROOT;
    for (const k of keys) {
        node = (node.children || []).find((c) => c.key === k);
        if (!node) return null;
    }
    return node;
}

// wheel(['a', 'b'] ...) — the string literals of each call's first argument.
// A path whose last key is a variable (a.spell) is checked below instead.
const paths = [...runSrc.matchAll(/wheel\(\[([^\]]*)\]/g)].map((m) => m[1]);

describe('the autoplay fires only wheel paths that exist', () => {
    test('run.js addresses the wheel by path at all', () => {
        assert.ok(paths.length >= 4, `found ${paths.length}`);
    });
    for (const raw of paths) {
        const keys = [...raw.matchAll(/'([^']+)'/g)].map((m) => m[1]);
        const dynamic = /,\s*[a-z]\w*\.\w+\s*$/.test(raw.trim());
        test(`${keys.join(' > ')}${dynamic ? ' > …' : ''}`, () => {
            const node = walk(keys);
            assert.ok(node, `no ${keys.join(' > ')} on the wheel`);
            if (!dynamic) assert.ok(!node.children || node.aimType, `${keys.join(' > ')} is a sub-wheel, not something that fires`);
        });
    }
    test('every spell a profile reaches for is on the Magic ring', () => {
        for (const key of new Set([...FIGHTER.spells, ...SNEAK.spells])) {
            const node = walk(['fight', 'magic', key]);
            assert.ok(node && node.resolver === 'castSpell', `fight > magic > ${key}`);
        }
    });
});
