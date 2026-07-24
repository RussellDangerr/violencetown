// balance-harness.test.js — the harness's pure math.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ttk, ttdOf, pegRate, lintEntity, lintSkills, loadMapRoster, report, trickDamage, normEol, GOLDEN_PATH, REFERENCE_DAMAGE, ARMOR_CAP, statBlock, applyStatBlock } from '../tools/balance-harness.mjs';
import { TRICKS } from '../game/tricks.js';

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
    test('lintEntity flags a sub-Hundred enemy (Law 0)', () => {
        const flags = lintEntity({ type: 'Grunt', hp: 50, armor: 0, damage: 8, gold: 20, vermin: false });
        assert.ok(flags.some(f => f.includes('Law 0')));
    });
    // Law 0 amended 2026-07-24: the vermin sub-Hundred exemption is repealed —
    // a vermin spawn now needs hp 100 same as anyone else, or it flags too.
    test('lintEntity flags a sub-Hundred vermin too — the exemption is repealed (Law 0)', () => {
        const flags = lintEntity({ type: 'Rat', hp: 16, armor: -80, damage: 6, gold: 0, vermin: true });
        assert.ok(flags.some(f => f.includes('Law 0')));
    });
    test('lintEntity flags armor over cap without puzzleWall (Law 3)', () => {
        const over = lintEntity({ type: 'Wall', hp: 100, armor: 14, damage: 8, gold: 0, vermin: false });
        assert.ok(over.some(f => f.includes('armor')));
        const ok = lintEntity({ type: 'Knight', hp: 100, armor: 14, damage: 8, gold: 0, vermin: false, puzzleWall: true });
        assert.ok(!ok.some(f => f.includes('armor')));
    });
    test('lintEntity flags armor below the negative-armor sanity floor (Law 3)', () => {
        const under = lintEntity({ type: 'Ghost', hp: 100, armor: -95, damage: 8, gold: 0, vermin: false });
        assert.ok(under.some(f => f.includes('armor') && f.includes('outside')));
        const ok = lintEntity({ type: 'Ghost', hp: 100, armor: -95, damage: 8, gold: 0, vermin: false, puzzleWall: true });
        assert.ok(!ok.some(f => f.includes('armor')));
    });
    test('lintEntity flags a rich vermin (Law 6) — hp 100 here isolates the wallet check', () => {
        const flags = lintEntity({ type: 'Rat', hp: 100, armor: -80, damage: 6, gold: 50, vermin: true });
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
    // Read from the REAL trick def, never literals: the point is that editing
    // tricks.js moves this test, so the peg can't drift unnoticed.
    test('hire_lion sits exactly at the peg — 1.00 dmg/GP over its whole lifetime', () => {
        const lion = TRICKS.hire_lion;
        assert.equal(trickDamage(lion), lion.summonDamage * lion.summonTurns);
        assert.equal(pegRate(trickDamage(lion), lion.gpCost), 1);   // exactly 1, not "1.00"-rounded
        assert.deepEqual(lintSkills().filter(f => f.startsWith('[skill/hire_lion]')), []);
    });
    test('trickDamage prices a summon by lifetime, a bolt outright, utility not at all', () => {
        assert.equal(trickDamage({ damage: 18, gpCost: 6 }), 18);
        assert.equal(trickDamage({ summon: 'lion', summonDamage: 25, summonTurns: 2 }), 50);
        assert.equal(trickDamage({ transform: 'rat', transformTurns: 3 }), null);
    });
    // The hole this closes: omitted fields must price at what the RUNTIME does, or an
    // over-peg summon lints clean as 0 dmg. 8 x 2 = 16 is what {summon} alone spawns.
    test('trickDamage falls back to the runtime defaults, never to 0', () => {
        assert.equal(trickDamage({ summon: 'goon' }), 16);
        assert.equal(trickDamage({ summon: 'goon', summonTurns: 3 }), 24);
        assert.equal(trickDamage({ summon: 'goon', summonDamage: 25 }), 50);
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
    // normEol on both sides: core.autocrlf hands fresh checkouts a CRLF golden while
    // report() emits LF, and an exact compare would then fail on checkout alone.
    // GOLDEN_PATH from the harness, not a second copy of the path: renaming the golden
    // must break loudly here rather than leave this test passing against nothing.
    test('report() matches the committed golden — drift shows up in npm test', () => {
        assert.equal(normEol(report()), normEol(readFileSync(GOLDEN_PATH, 'utf8')));
    });
});

describe('statBlock — creature card generation', () => {
    test('renders a marker-wrapped block from an entity', () => {
        const md = statBlock({ zone: 'sewer', id: 'wererat', type: 'Wererat', hp: 100, armor: 4, damage: 12, gold: 150, vermin: false, weak: ['fire'] });
        assert.ok(md.startsWith('<!-- statblock:start -->'));
        assert.ok(md.trimEnd().endsWith('<!-- statblock:end -->'));
        assert.ok(md.includes('100'));           // The Hundred, stated
        assert.ok(md.includes('150 GP'));        // the wallet
        assert.ok(md.includes('fire'));          // the weakness
        assert.ok(md.includes('TTK'));           // the derived read
    });
    // Post-retune (Law 0 amended 2026-07-24): vermin no longer means sub-Hundred
    // HP — a vermin card is 100 HP / negative armor like anyone else, and
    // statBlock's only vermin-specific behavior left is the role suffix.
    test('a vermin block is 100 HP like everyone else, with the (vermin) role suffix', () => {
        const md = statBlock({ zone: 'sewer', id: 'rat', type: 'Rat', hp: 100, armor: -80, damage: 6, gold: 0, vermin: true });
        assert.ok(md.includes('100'));
        assert.ok(/\(vermin\)/i.test(md));
    });
});

describe('applyStatBlock — marker-managed injection (pure string op)', () => {
    test('inserts a block after frontmatter when no markers exist', () => {
        const card = '---\nname: Wererat\ntier: Boss\n---\n\n# Wererat\n\nA big rat.\n';
        const out = applyStatBlock(card, '<!-- statblock:start -->\nX\n<!-- statblock:end -->');
        assert.ok(out.includes('<!-- statblock:start -->'));
        assert.ok(out.includes('# Wererat'));    // original body preserved
        assert.ok(out.indexOf('---', 3) < out.indexOf('<!-- statblock:start -->')); // block after frontmatter
    });
    test('replaces an existing block in place, leaving surrounding text', () => {
        const card = '---\nname: X\n---\n# X\n<!-- statblock:start -->\nOLD\n<!-- statblock:end -->\nafter\n';
        const out = applyStatBlock(card, '<!-- statblock:start -->\nNEW\n<!-- statblock:end -->');
        assert.ok(out.includes('NEW'));
        assert.ok(!out.includes('OLD'));
        assert.ok(out.includes('after'));         // trailing text kept
        assert.equal((out.match(/statblock:start/g) || []).length, 1); // no duplicate block
    });
});
