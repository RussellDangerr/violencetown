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

// The TTD baseline — the unarmored reference player. Nothing grants player armor
// today; the day a ring does, this is the grep hit.
export const PLAYER_HP = 100;
export const PLAYER_ARMOR = 0;

// Skill peg bands (Law 1). GP is non-renewable, so gated tricks must beat spells'
// raw rate; MP regenerates, so spells price in opportunity-turns.
const TRICK_MIN_RATE = 2.5;
const SPELL_MIN_RATE = 1.5;
const SPELL_MAX_RATE = 2.5;

// Hermetic ordering — plain codepoint compare, never localeCompare (host/ICU
// dependent, so a golden could differ across machines).
const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ── Pure math ─────────────────────────────────────────────────────────────

// Turns to kill: exact ceil(hp / net dmg-per-turn), floored at 1 dmg/turn so a
// fully-stonewalled attacker still gets a (large, finite) number instead of Infinity.
// Callers must NOT pass dmgPerTurn 0 — combat.js's contract is that 0 means the hit
// does not happen, and flooring it back to 1 here would lie. See ttdOf.
export function ttk(hp, dmgPerTurn, armor) {
    return Math.ceil(hp / Math.max(1, dmgPerTurn - armor));
}

// Turns for this entity to kill the reference player. A 0-damage entity never kills
// anyone — '-' beats a number that collides with a real 1-damage attacker.
export function ttdOf(damage) {
    return damage > 0 ? ttk(PLAYER_HP, damage, PLAYER_ARMOR) : '-';
}

// Peg rate — damage bought per unit of currency (GP or MP).
export function pegRate(damage, cost) {
    return damage / cost;
}

// The greppable flag key. Map ids are file-local duplicates (e1/e2 recur per map),
// so the key must be zone/id. Synthetic entities without them degrade to the type.
function entityKey(e) {
    return (e.zone && e.id) ? `[${e.zone}/${e.id} ${e.type}]` : `[${e.type}]`;
}

// Per-entity lint (Law 0 / Law 3 / Law 6). Returns an array of flag strings;
// empty means clean.
export function lintEntity(e) {
    const flags = [];
    const key = entityKey(e);
    if (!e.vermin && e.hp !== 100) {
        flags.push(`${key} Law 0 — hp ${e.hp}, expected 100`);
    }
    if (e.vermin && e.gold > 5) {
        flags.push(`${key} Law 6 — vermin wallet ${e.gold} GP, expected <= 5`);
    }
    if (!e.puzzleWall && e.armor > ARMOR_CAP) {
        flags.push(`${key} Law 3 — armor ${e.armor}, expected <= ${ARMOR_CAP} (no puzzleWall declared)`);
    }
    return flags;
}

// Skill lint (Law 1 — the peg ladder). Utility skills (no `damage` field: summons,
// transforms) aren't priced this way and are skipped. A free damage source is the one
// thing a rate check can't catch (x/0 is Infinity, which passes) — flag it by name.
export function lintSkills() {
    const flags = [];
    for (const t of Object.values(TRICKS)) {
        if (typeof t.damage !== 'number') continue;
        if (!(t.gpCost > 0)) {
            flags.push(`[skill/${t.id}] Law 1 — free damage source: ${t.damage} dmg for ${t.gpCost} GP`);
            continue;
        }
        const rate = pegRate(t.damage, t.gpCost);
        if (rate < TRICK_MIN_RATE) {
            flags.push(`[skill/${t.id}] Law 1 — ${rate.toFixed(2)} dmg/GP, expected >= ${TRICK_MIN_RATE.toFixed(2)}`);
        }
    }
    for (const s of Object.values(SPELLS)) {
        if (!(s.damage > 0)) continue;
        if (!(s.mpCost > 0)) {
            flags.push(`[skill/${s.id}] Law 1 — free damage source: ${s.damage} dmg for ${s.mpCost} MP`);
            continue;
        }
        const rate = pegRate(s.damage, s.mpCost);
        if (rate < SPELL_MIN_RATE || rate > SPELL_MAX_RATE) {
            flags.push(`[skill/${s.id}] Law 1 — ${rate.toFixed(2)} dmg/MP, expected [${SPELL_MIN_RATE.toFixed(2)}, ${SPELL_MAX_RATE.toFixed(2)}]`);
        }
    }
    return flags;
}

// ── Roster: scan game/*-map.json, skip TheDangerrZone snapshots ────────────
//
// Real shape found in game/town-map.json (and every other current map): a
// top-level `enemies` array of spawn objects — `{ id, type, x, y, hp, damage,
// ... }`. No map currently authors `gold`/`vermin`/`puzzleWall` (two sewer
// spawns carry `armor`), so those default exactly like the Enemy ctor defaults
// (enemies.js): hp 100, armor 0, damage 8 (DEFAULT_DAMAGE), gold 0, vermin false.
export function loadMapRoster() {
    const files = fs.readdirSync(GAME_DIR)
        .filter(f => f.endsWith('-map.json') && !f.includes('TheDangerrZone'))
        .sort(byCodepoint);

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

// ── Table formatting ──────────────────────────────────────────────────────
//
// Column widths are DECLARED, not derived from content: when the Law 0 retune
// lands (hp 10 -> 100) every column must stay put, so the golden diff shows the
// balance change instead of a whole-file reflow. Overflow is allowed — a long name
// ruffles only its own row. `num` right-aligns so digit growth is visible and the
// column stays decimal-aligned. The zone/id key column doubles as the Creature Card
// lookup key (map ids repeat across files, so zone alone can't identify a spawn).
const ENEMY_COLS = [
    { head: 'zone/id',      w: 32 },
    { head: 'type',         w: 24 },
    { head: 'hp',           w: 5,  num: true },
    { head: 'armor',        w: 6,  num: true },
    { head: 'dmg',          w: 5,  num: true },
    { head: 'gold',         w: 6,  num: true },
    { head: 'ttk_lazy',     w: 13, num: true },
    { head: 'ttk_informed', w: 13, num: true },
    { head: 'ttd',          w: 5,  num: true },
];
const WEAPON_COLS = [
    { head: 'id', w: 14 }, { head: 'damage', w: 7, num: true }, { head: 'type', w: 8 },
];
const SPELL_COLS = [
    { head: 'id', w: 12 }, { head: 'mpCost', w: 7, num: true },
    { head: 'damage', w: 7, num: true }, { head: 'dmg/mp', w: 7, num: true },
];
const TRICK_COLS = [
    { head: 'id', w: 12 }, { head: 'gpCost', w: 7, num: true },
    { head: 'damage', w: 7, num: true }, { head: 'dmg/gp', w: 7, num: true },
];
const ECON_COLS = [
    { head: 'zone', w: 16 }, { head: 'faucet_gp', w: 10, num: true },
];

function table(cols, rows) {
    return [cols.map(c => c.head), ...rows].map(r =>
        r.map((cell, i) => {
            const s = String(cell);
            return cols[i].num ? s.padStart(cols[i].w) : s.padEnd(cols[i].w);
        }).join('  ').trimEnd()
    );
}

// ── Report ────────────────────────────────────────────────────────────────

// `roster` is injectable so tests can drive the formatting directly.
export function report(roster = loadMapRoster()) {
    const lines = [];
    lines.push('=== Violencetown Balance Harness ===');
    lines.push('generated by tools/balance-harness.mjs — deterministic, no timestamps');
    lines.push(`reference damage ${REFERENCE_DAMAGE} | armor cap ${ARMOR_CAP} | peg 1 GP : 1 HP | grunt heal policy: hp <= ${HEAL_HP_FLOOR}, gold >= ${HEAL_MIN_GOLD} | TTD vs player ${PLAYER_HP} HP / ${PLAYER_ARMOR} armor`);
    lines.push('');

    // Sort is (zone, type, id) but the displayed key column is zone/id, so within a
    // zone the key reads non-monotonically (sewer/carrion, e6, e5, e3, e4, ...).
    // Deliberate: type-sort keeps sibling spawns (both Red Fungus rows) adjacent,
    // which is the right affordance for balance work. Tradeoff: renaming a spawn's
    // `type` moves its row (delete+insert in the diff) — accepted.
    const sorted = roster.slice().sort((a, b) =>
        byCodepoint(a.zone, b.zone) || byCodepoint(a.type, b.type) || byCodepoint(String(a.id), String(b.id))
    );

    lines.push('--- ENEMIES (TTK vs the reference loadout; TTD vs the reference player) ---');
    lines.push(...table(ENEMY_COLS, sorted.map(e => [
        `${e.zone}/${e.id}`, e.type, e.hp, e.armor, e.damage, e.gold,
        ttk(e.hp, REFERENCE_DAMAGE, e.armor),
        ttk(e.hp, REFERENCE_DAMAGE * 2, e.armor),
        ttdOf(e.damage),
    ])));
    lines.push('');

    lines.push('--- WEAPONS (raw damage) ---');
    lines.push(...table(WEAPON_COLS, Object.values(WEAPONS)
        .slice().sort((a, b) => byCodepoint(a.id, b.id))
        .map(w => [w.id, w.damage, w.damageType ?? '-'])));
    lines.push('');

    lines.push('--- SPELLS (dmg per MP) ---');
    lines.push(...table(SPELL_COLS, Object.values(SPELLS)
        .slice().sort((a, b) => byCodepoint(a.id, b.id))
        .map(s => [s.id, s.mpCost, s.damage,
            (s.damage > 0 && s.mpCost > 0) ? pegRate(s.damage, s.mpCost).toFixed(2) : '-'])));
    lines.push('');

    lines.push('--- TRICKS (dmg per GP) ---');
    lines.push(...table(TRICK_COLS, Object.values(TRICKS)
        .slice().sort((a, b) => byCodepoint(a.id, b.id))
        .map(t => [t.id, t.gpCost, t.damage ?? '-',
            (typeof t.damage === 'number' && t.gpCost > 0) ? pegRate(t.damage, t.gpCost).toFixed(2) : '-'])));
    lines.push('');

    lines.push('--- ECONOMY (per-zone faucet = sum of spawn wallets) ---');
    const zones = [...new Set(sorted.map(e => e.zone))].sort(byCodepoint);
    lines.push(...table(ECON_COLS, zones.map(z =>
        [z, sorted.filter(e => e.zone === z).reduce((sum, e) => sum + e.gold, 0)])));
    lines.push("sinks: burnGold('heal'|'trick'), bribes/buyouts via transferGold");
    lines.push('');

    lines.push('--- LINT ---');
    const entityFlags = sorted.flatMap(e => lintEntity(e));
    const skillFlags = lintSkills();
    for (const f of entityFlags) lines.push(f);
    for (const f of skillFlags) lines.push(f);
    lines.push(`total flags: ${entityFlags.length + skillFlags.length}`);

    return lines.join('\n') + '\n';
}

// ── CLI ───────────────────────────────────────────────────────────────────

const USAGE = 'usage: node tools/balance-harness.mjs [--write | --check]';

function main() {
    const args = process.argv.slice(2);
    const unknown = args.filter(a => a !== '--write' && a !== '--check');
    if (unknown.length) {
        console.error(`unknown argument: ${unknown.join(' ')}`);
        console.error(USAGE);
        process.exit(1);
    }

    // Dispatch BEFORE rendering — a mode that doesn't need the full report shouldn't
    // pay for one (or die inside it on a malformed map).
    if (args.includes('--write')) {
        fs.writeFileSync(GOLDEN_PATH, report());
        console.log(`wrote ${GOLDEN_PATH}`);
        return;
    }

    if (args.includes('--check')) {
        const existing = fs.existsSync(GOLDEN_PATH) ? fs.readFileSync(GOLDEN_PATH, 'utf8') : null;
        const fresh = report();
        if (existing !== fresh) {
            console.log(fresh);
            console.error('balance drift: tools/balance-golden.txt is stale — review the diff above, then `npm run balance:write`');
            process.exit(1);
        }
        console.log('balance golden matches — no drift');
        return;
    }

    console.log(report());
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
