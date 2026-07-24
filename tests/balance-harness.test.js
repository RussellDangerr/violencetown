// balance-harness.test.js — the harness's pure math.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ttk, pegRate, lintEntity, lintSkills, loadMapRoster, REFERENCE_DAMAGE, ARMOR_CAP } from '../tools/balance-harness.mjs';

describe('harness math', () => {
    test('ttk is exact ceil(hp / net-per-turn), min-1 floor', () => {
        assert.equal(ttk(100, 20, 0), 5);      // lazy standard
        assert.equal(ttk(100, 20, 4), 7);      // armor 4 -> 16/turn -> ceil(6.25)
        assert.equal(ttk(100, 40, 0), 3);      // informed (x2)
        assert.equal(ttk(16, 20, 0), 1);       // vermin one-shot
        assert.equal(ttk(100, 1, 99), 100);    // min-1 floor keeps TTK finite
    });
    test('pegRate = damage per gold', () => {
        assert.equal(pegRate(18, 6), 3);       // Ray Blast
        assert.equal(pegRate(50, 50), 1);      // lion at peg
    });
    test('lintEntity flags a non-vermin sub-Hundred enemy (Law 0)', () => {
        const flags = lintEntity({ type: 'Grunt', hp: 50, armor: 0, damage: 8, gold: 20, vermin: false });
        assert.ok(flags.some(f => f.includes('Law 0')));
    });
    test('lintEntity flags armor over cap without puzzleWall (Law 3)', () => {
        const over = lintEntity({ type: 'Wall', hp: 100, armor: 14, damage: 8, gold: 0, vermin: false });
        assert.ok(over.some(f => f.includes('armor')));
        const ok = lintEntity({ type: 'Knight', hp: 100, armor: 14, damage: 8, gold: 0, vermin: false, puzzleWall: true });
        assert.ok(!ok.some(f => f.includes('armor')));
    });
    test('lintEntity flags a rich vermin (Law 6)', () => {
        const flags = lintEntity({ type: 'Rat', hp: 16, armor: 0, damage: 6, gold: 50, vermin: true });
        assert.ok(flags.some(f => f.includes('vermin')));
    });
    test('loadMapRoster reads real map JSONs and skips snapshots', () => {
        const roster = loadMapRoster();
        assert.ok(roster.length > 0);
        assert.ok(roster.every(e => e.zone && e.type));
        assert.ok(!roster.some(e => e.zone.includes('TheDangerrZone')));
    });
    test('REFERENCE_DAMAGE is the act-1 anchor', () => assert.equal(REFERENCE_DAMAGE, 20));
});
