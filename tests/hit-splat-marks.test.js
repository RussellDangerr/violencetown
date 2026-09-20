// hit-splat-marks.test.js — the impact mark a hit-splat wears.
//
// renderer._drawHitSplat already draws the typed colour, the number, the gold
// crit border and the per-type motion, and it already draws a MARK_SPRITES
// glyph when one is picked. The only unfinished part was the PICK: several
// damage types the game can actually deal arrived with no mark at all.
//
// These pin the mapping as a decision, not as a happy accident — every case
// below is a damage type something in the shipped content really produces.
// See plans/hit-splat-art.md for why each unmarked type stays unmarked.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { pickHitMark, HEAVY_HIT_DAMAGE } from '../game/hit-splat.js';
import { MARK_SPRITES } from '../game/sprites.js';
import { SPELLS } from '../game/spells.js';
import { TRICKS } from '../game/tricks.js';
import { WEAPONS } from '../game/weapons.js';

const src = f => readFileSync(fileURLToPath(new URL(`../game/${f}`, import.meta.url)), 'utf8');

describe('every mark the pick can name is a real column in the sheet', () => {
    // The renderer looks the pick up in MARK_SPRITES and silently draws nothing
    // on a miss, so a typo'd mark name would be invisible rather than loud.
    const types = ['physical', 'poison', 'sludge', 'fire', 'cold', 'heal', 'energy', undefined];
    for (const t of types) {
        for (const amount of [1, 3, 14, 15, 40]) {
            for (const killed of [false, true]) {
                test(`${t} / ${amount} / killed=${killed}`, () => {
                    const mark = pickHitMark(t, amount, killed);
                    if (mark !== null) {
                        assert.ok(mark in MARK_SPRITES, `${mark} is not a MARK_SPRITES column`);
                    }
                });
            }
        }
    }
});

describe('a kill outranks the type', () => {
    test('a poisoned killing blow reads as a KO, not a drip', () => {
        assert.equal(pickHitMark('poison', 3, true), 'swirl');
    });
    test('an unmarked type still gets the KO swirl', () => {
        assert.equal(pickHitMark('cold', 20, true), 'swirl');
    });
});

describe('the heavy/light split is the same rule for every marked type', () => {
    test('a light punch is one star, a heavy one is stars', () => {
        assert.equal(pickHitMark('physical', HEAVY_HIT_DAMAGE - 1, false), 'star');
        assert.equal(pickHitMark('physical', HEAVY_HIT_DAMAGE, false), 'stars');
    });

    // buffs.js applyDot ticks poison and sludge for 3-5 a turn; a Sludge Sack
    // bursting is the loud case. Before this, both wore the same plural mark,
    // so a 3-damage tick shouted as loudly as the sack.
    test('a poison DoT tick is one drop, a full hit is drops', () => {
        assert.equal(pickHitMark('poison', 3, false), 'drop');
        assert.equal(pickHitMark('poison', HEAVY_HIT_DAMAGE, false), 'drops');
    });
    test('sludge splits the same way as poison', () => {
        assert.equal(pickHitMark('sludge', 5, false), 'drop');
        assert.equal(pickHitMark('sludge', 22, false), 'drops');
    });
});

describe('energy is reachable content and gets a mark of its own', () => {
    // Without this, a Ray Blast landed with the physical fallback colour AND no
    // mark — a 22-damage sci-fi zap rendered exactly like a punch.
    test('the game really deals energy damage', () => {
        assert.equal(WEAPONS.ray_gun.damageType, 'energy');
        assert.equal(TRICKS.ray_blast.damageType, 'energy');
        assert.ok(TRICKS.ray_blast.damage > 0, 'a 0-damage trick would never spawn a splat');
    });
    test('an energy hit wears the shock mark', () => {
        assert.equal(pickHitMark('energy', 18, false), 'exclamation');
        assert.equal(pickHitMark('energy', 3, false), 'exclamation');
    });
});

describe('the deliberately unmarked types stay unmarked', () => {
    test('cold is reachable but has no mark that reads as ice', () => {
        assert.equal(SPELLS.coneOfCold.damageType, 'cold', 'cold must stay reachable for this to be a real decision');
        assert.equal(pickHitMark('cold', 14, false), null);
    });
    test('heal takes no mark — the sheet has no heart, and a star would read as damage', () => {
        assert.ok(!('heart' in MARK_SPRITES));
        assert.equal(pickHitMark('heal', 12, false), null);
    });
    test('fear cannot spawn a splat at all, so it needs no mark', () => {
        // combatAttack returns before the splat when the final damage is 0.
        assert.equal(SPELLS.boo.damage, 0);
        assert.match(src('main.js'), /if \(finalDmg === 0\) \{ this\._log\(.*is immune.*\); return null; \}/);
    });
});

describe('a crit is an intensity, not a type', () => {
    // A crit already escalates on three axes in the renderer and shares the one
    // mark slot with the type, so giving it a mark would EVICT the type's.
    test('nothing in the pick reads the crit flag', () => {
        assert.equal(pickHitMark.length, 3, 'pickHitMark takes (type, amount, killed) only');
        assert.doesNotMatch(src('hit-splat.js').split('export function')[1] ?? '', /crit/);
    });
    test('the renderer still gives a crit its gold border', () => {
        assert.match(src('renderer.js'), /dn\.crit \? hexToRgba\('#f0d782'/);
    });
});

// ── The miss that never was ─────────────────────────────────────────────────
//
// SPLAT_COLOR carried a 'miss' blue and _hitSplatMotion carried a "whiff
// sideways on the wind" case for it, but nothing ever spawned that type and
// nothing ever could: combat.js resolves over flat damage with no roll, and
// README.md promises "no dice, no misses". The colour and the motion were a
// feature the design rules out, sitting in the splat's two hottest switches
// and inviting the next reader to wire it up.

describe('there is no miss, and no code pretending there might be', () => {
    const GAME_FILES = ['main.js', 'combat.js', 'buffs.js', 'items.js', 'renderer.js', 'hit-splat.js'];

    test('nothing spawns a splat typed miss', () => {
        for (const f of GAME_FILES) {
            assert.doesNotMatch(src(f), /_spawnHitSplat\([^)]*['"]miss['"]/,
                `${f} spawns a 'miss' splat`);
        }
    });
    test('the splat palette has no miss colour', () => {
        assert.doesNotMatch(src('renderer.js'), /^\s*miss:\s*'#/m);
    });
    test('the splat motion has no miss case', () => {
        assert.doesNotMatch(src('renderer.js'), /case 'miss':/);
    });
    test('the rule it would have broken is still written down', () => {
        const readme = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');
        assert.match(readme, /no dice, no misses/);
    });
});
