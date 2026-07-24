// balance-harness.mjs — the Gold Standard's measuring bench (plans/gold-standard-design.md).
// Headless Node, zero deps. Reads the REAL data modules + map JSONs so the lint sees the
// actual world, not a fixture. `node tools/balance-harness.mjs` prints the report;
// --write commits it to tools/balance-golden.txt; --check diffs against that file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { WEAPONS } from '../game/weapons.js';
import { SPELLS } from '../game/spells.js';
import { TRICKS } from '../game/tricks.js';
import { HEAL_HP_FLOOR, HEAL_MIN_GOLD } from '../game/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR  = path.join(__dirname, '..', 'game');
const GOLDEN_PATH = path.join(__dirname, 'balance-golden.txt');

// ── Constants (Law 4 / Law 3) ────────────────────────────────────────────────
export const REFERENCE_DAMAGE = 20; // act-1 geared reference (Ray Gun tier)
export const ARMOR_CAP = 10;        // half reference; puzzle walls are exempt (Law 3)

// ── Pure math ─────────────────────────────────────────────────────────────

// Turns to kill: exact ceil(hp / net dmg-per-turn), floored at 1 dmg/turn so a
// fully-stonewalled attacker still gets a (large, finite) number instead of Infinity.
export function ttk(hp, dmgPerTurn, armor) {
    return Math.ceil(hp / Math.max(1, dmgPerTurn - armor));
}

// Peg rate — damage bought per unit of currency (GP or MP).
export function pegRate(damage, cost) {
    return damage / cost;
}

// Per-entity lint (Law 0 / Law 3 / Law 6). Returns an array of flag strings;
// empty means clean. Order doesn't matter to callers — they just count/filter.
export function lintEntity(e) {
    const flags = [];
    if (!e.vermin && e.hp !== 100) {
        flags.push(`Law 0: ${e.type} has ${e.hp} HP, not 100 (non-vermin must be exactly The Hundred)`);
    }
    if (e.vermin && e.gold > 5) {
        flags.push(`Law 6 vermin wallet: ${e.type} (vermin) carries ${e.gold} GP, over the 0-5 cap`);
    }
    if (!e.puzzleWall && e.armor > ARMOR_CAP) {
        flags.push(`Law 3 armor: ${e.type} armor ${e.armor} exceeds the cap of ${ARMOR_CAP} (no puzzleWall declared)`);
    }
    return flags;
}

// Skill lint (Law 1 — the peg ladder). Tricks (GP, non-renewable) must clear
// >= 2.5 dmg/GP to justify spending real money; spells (MP, renewable) sit in
// the 1.5-2.5 dmg/MP band. Utility skills (no `damage` field: summons,
// transforms) aren't priced this way and are skipped.
export function lintSkills() {
    const flags = [];
    for (const t of Object.values(TRICKS)) {
        if (typeof t.damage !== 'number') continue;
        const rate = pegRate(t.damage, t.gpCost);
        if (rate < 2.5) {
            flags.push(`Law 1 trick rate: '${t.name}' at ${rate.toFixed(2)} dmg/GP, below the 2.5 gated floor`);
        }
    }
    for (const s of Object.values(SPELLS)) {
        if (!(s.damage > 0)) continue;
        const rate = pegRate(s.damage, s.mpCost);
        if (rate < 1.5 || rate > 2.5) {
            flags.push(`Law 1 spell rate: '${s.name}' at ${rate.toFixed(2)} dmg/MP, outside the [1.5, 2.5] band`);
        }
    }
    return flags;
}

// ── Roster: scan game/*-map.json, skip TheDangerrZone snapshots ────────────
//
// Real shape found in game/town-map.json (and every other current map): a
// top-level `enemies` array of spawn objects — `{ id, type, x, y, hp, damage,
// ... }`. No map currently authors `armor`/`gold`/`vermin`/`puzzleWall` (two
// sewer spawns carry `armor`; nothing authors gold/vermin/puzzleWall yet), so
// those default exactly like the Enemy ctor defaults (enemies.js): hp 100,
// armor 0, damage 8 (DEFAULT_DAMAGE), gold 0, vermin false, puzzleWall false.
export function loadMapRoster() {
    const files = fs.readdirSync(GAME_DIR)
        .filter(f => f.endsWith('-map.json') && !f.includes('TheDangerrZone'))
        .sort();

    const roster = [];
    for (const file of files) {
        const zone = file.slice(0, -'-map.json'.length);
        const raw = fs.readFileSync(path.join(GAME_DIR, file), 'utf8');
        let doc;
        try { doc = JSON.parse(raw); } catch { continue; }
        const spawns = Array.isArray(doc.enemies) ? doc.enemies : [];
        for (const s of spawns) {
            roster.push({
                zone,
                id: s.id,
                type: s.type,
                hp: s.hp ?? 100,
                armor: s.armor ?? 0,
                damage: s.damage ?? 8,
                gold: s.gold ?? 0,
                vermin: s.vermin ?? false,
                puzzleWall: s.puzzleWall ?? false,
            });
        }
    }
    return roster;
}

// ── Report ────────────────────────────────────────────────────────────────

function padCols(rows) {
    if (!rows.length) return [];
    const widths = rows[0].map((_, i) => Math.max(...rows.map(r => String(r[i]).length)));
    return rows.map(r => r.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd());
}

export function report() {
    const lines = [];
    lines.push('=== Violencetown Balance Harness ===');
    lines.push('generated by tools/balance-harness.mjs — deterministic, no timestamps');
    lines.push(`reference damage ${REFERENCE_DAMAGE} | armor cap ${ARMOR_CAP} | peg 1 GP : 1 HP | grunt heal policy: hp <= ${HEAL_HP_FLOOR}, gold >= ${HEAL_MIN_GOLD}`);
    lines.push('');

    const roster = loadMapRoster().slice().sort((a, b) =>
        a.zone === b.zone ? a.type.localeCompare(b.type) : a.zone.localeCompare(b.zone)
    );

    lines.push('--- ENEMIES (zone, type, hp, armor, dmg, gold, TTK-lazy, TTK-informed, TTD) ---');
    const enemyHeader = ['zone', 'type', 'hp', 'armor', 'dmg', 'gold', 'ttk_lazy', 'ttk_informed', 'ttd'];
    const enemyRows = roster.map(e => [
        e.zone, e.type, e.hp, e.armor, e.damage, e.gold,
        ttk(e.hp, REFERENCE_DAMAGE, e.armor),
        ttk(e.hp, REFERENCE_DAMAGE * 2, e.armor),
        ttk(100, e.damage, 0),
    ]);
    for (const row of padCols([enemyHeader, ...enemyRows])) lines.push(row);
    lines.push('');

    lines.push('--- WEAPONS (raw damage) ---');
    const weaponRows = Object.values(WEAPONS)
        .slice().sort((a, b) => a.id.localeCompare(b.id))
        .map(w => [w.id, w.damage, w.damageType ?? '-']);
    for (const row of padCols([['id', 'damage', 'type'], ...weaponRows])) lines.push(row);
    lines.push('');

    lines.push('--- SPELLS (dmg per MP) ---');
    const spellRows = Object.values(SPELLS)
        .slice().sort((a, b) => a.id.localeCompare(b.id))
        .map(s => [s.id, s.mpCost, s.damage, (s.damage > 0 ? pegRate(s.damage, s.mpCost).toFixed(2) : '-')]);
    for (const row of padCols([['id', 'mpCost', 'damage', 'dmg/mp'], ...spellRows])) lines.push(row);
    lines.push('');

    lines.push('--- TRICKS (dmg per GP) ---');
    const trickRows = Object.values(TRICKS)
        .slice().sort((a, b) => a.id.localeCompare(b.id))
        .map(t => [t.id, t.gpCost, t.damage ?? '-', (typeof t.damage === 'number' ? pegRate(t.damage, t.gpCost).toFixed(2) : '-')]);
    for (const row of padCols([['id', 'gpCost', 'damage', 'dmg/gp'], ...trickRows])) lines.push(row);
    lines.push('');

    lines.push('--- ECONOMY (per-zone faucet = sum of spawn wallets) ---');
    const zones = [...new Set(roster.map(e => e.zone))].sort();
    const econRows = zones.map(z => [z, roster.filter(e => e.zone === z).reduce((sum, e) => sum + e.gold, 0)]);
    for (const row of padCols([['zone', 'faucet_gp'], ...econRows])) lines.push(row);
    lines.push("sinks: burnGold('heal'|'trick'), bribes/buyouts via transferGold");
    lines.push('');

    lines.push('--- LINT ---');
    const entityFlags = roster.flatMap(e => lintEntity(e).map(f => `[${e.zone}/${e.type}] ${f}`));
    const skillFlags = lintSkills();
    for (const f of entityFlags) lines.push(f);
    for (const f of skillFlags) lines.push(f);
    lines.push(`total flags: ${entityFlags.length + skillFlags.length}`);

    return lines.join('\n') + '\n';
}

// ── CLI ───────────────────────────────────────────────────────────────────

function main() {
    const args = process.argv.slice(2);
    const out = report();

    if (args.includes('--write')) {
        fs.writeFileSync(GOLDEN_PATH, out);
        console.log(`wrote ${GOLDEN_PATH}`);
        return;
    }

    if (args.includes('--check')) {
        const existing = fs.existsSync(GOLDEN_PATH) ? fs.readFileSync(GOLDEN_PATH, 'utf8') : null;
        if (existing !== out) {
            console.log(out);
            console.error('balance drift: tools/balance-golden.txt is stale — review the diff above, then `npm run balance:write`');
            process.exit(1);
        }
        console.log('balance golden matches — no drift');
        return;
    }

    console.log(out);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
