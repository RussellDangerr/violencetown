// balance-harness.test.js — the harness's pure math.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ttk, ttdOf, pegRate, lintEntity, lintSkills, loadMapRoster, report, REFERENCE_DAMAGE, ARMOR_CAP } from '../tools/balance-harness.mjs';

// A minimal roster entry — spread over to vary one field at a time.
const spawn = (over = {}) => ({
    zone: 'sewer', id: 'e1', type: 'Red Fungus',
    hp: 100, armor: 0, damage: 8, gold: 0, vermin: false, puzzleWall: false, ...over,
});

// The ENEMIES header + the first data row of a rendered report.
function enemyRows(text) {
    const lines = text.split('\n');
    const start = lines.findIndex(l => l.startsWith('--- ENEMIES'));
    return lines.slice(start + 1, lines.indexOf('', start));
}

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
    test('ttd is "-" for a 0-damage entity — 0 means the hit does not happen', () => {
        assert.equal(ttdOf(0), '-');
        assert.equal(ttdOf(1), 100);   // a real 1-damage attacker still reads 100
        assert.equal(ttdOf(12), 9);
    });
    test('lintEntity on a compliant entity returns no flags', () => {
        assert.deepEqual(lintEntity(spawn()), []);
    });
    test('lintSkills flags Cone of Cold in the keyed format', () => {
        const flags = lintSkills();
        const cold = flags.find(f => f.startsWith('[skill/coneOfCold]'));
        assert.ok(cold, `expected a coneOfCold flag, got: ${JSON.stringify(flags)}`);
        assert.equal(cold, '[skill/coneOfCold] Law 1 — 1.40 dmg/MP, expected [1.50, 2.50]');
    });
});

describe('report()', () => {
    test('is byte-identical across two calls (determinism pin)', () => {
        assert.equal(report(), report());
    });
    test('declared column widths hold — an outsized row ruffles only itself', () => {
        const normal = [spawn()];
        const withMonster = [
            spawn(),
            spawn({ zone: 'an-extremely-long-zone-name', id: 'boss', type: 'A Preposterously Long Type Name', gold: 1500 }),
        ];
        const plain = enemyRows(report(normal));
        const stretched = enemyRows(report(withMonster));

        assert.equal(stretched[0], plain[0]);                 // header did not reflow
        const normalRow = stretched.find(l => l.startsWith('sewer/e1'));
        assert.equal(normalRow, plain[1]);                    // the normal row did not reflow

        // and the 1500-gold boss still fits its declared gold column
        const bossRow = stretched.find(l => l.startsWith('an-extremely-long-zone-name'));
        assert.ok(bossRow.includes('1500'));
    });
    test('report() matches the committed golden — drift shows up in npm test', () => {
        const golden = readFileSync(new URL('../tools/balance-golden.txt', import.meta.url), 'utf8');
        assert.equal(report(), golden);
    });
});
