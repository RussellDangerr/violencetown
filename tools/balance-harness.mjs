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
// Exported so the round-trip test binds to the same path the CLI writes — renaming
// the golden then breaks in one place instead of silently un-testing itself.
export const GOLDEN_PATH = path.join(__dirname, 'balance-golden.txt');

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

// The peg keys on AUTONOMY, not gating (Law 1 as amended — every trick in TRICKS is
// gated behind gear, so a gate distinguishes nothing). A summon fights on its own
// after one purchase, so it buys no skill expression and is held at 1 GP : 1 HP
// however it was unlocked. Two-sided: "1:1" is a rate, not a ceiling, so a summon
// priced well UNDER the peg is a design smell too (dead gold, nobody hires it).
const AUTONOMOUS_MAX_RATE = 1;
const AUTONOMOUS_MIN_RATE = 0.5;

// Runtime fallbacks the lint must mirror, or a def that omits a field lints as one
// thing and plays as another. Both are the values game/ actually applies when the
// field is absent: the Enemy ctor's DEFAULT_DAMAGE (enemies.js) and castTrick's
// summon-turn fallback (main.js). loadMapRoster reads the damage one too.
const ENEMY_DEFAULT_DAMAGE = 8;
const SUMMON_DEFAULT_TURNS = 2;

// Hermetic ordering — plain codepoint compare, never localeCompare (host/ICU
// dependent, so a golden could differ across machines).
const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Line endings are NOT part of the balance data. core.autocrlf hands a CRLF copy
// of the golden to fresh checkouts while report() always emits LF, so every exact
// comparison normalizes first (.gitattributes pins the file too — belt and braces).
export const normEol = s => s.replace(/\r\n/g, '\n');

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

// Sanity floor for negative armor (Law 3 amended 2026-07-24): the fragility
// stops bottom out at -80 (one-shot); -90 leaves a small margin below that
// floor for the lint without licensing an armor value nobody authors.
const ARMOR_FLOOR = -90;

// Per-entity lint (Law 0 / Law 3 / Law 6). Returns an array of flag strings;
// empty means clean.
export function lintEntity(e) {
    const flags = [];
    const key = entityKey(e);
    // Law 0 amended 2026-07-24 (repeals the vermin exception): every combatant
    // has exactly 100 HP, no exemptions — softness is negative armor now, so a
    // sub-Hundred hp of ANY kind (vermin included) is a flat data error.
    if (e.hp !== 100) {
        flags.push(`${key} Law 0 — hp ${e.hp}, expected 100`);
    }
    if (e.vermin && e.gold > 5) {
        flags.push(`${key} Law 6 — vermin wallet ${e.gold} GP, expected <= 5`);
    }
    // Armor sanity (Law 3): regular enemies live in [-90, ARMOR_CAP] — the
    // fragility stops bottom out at -80 and the cap is half the reference
    // weapon; only a declared puzzleWall may sit outside that band.
    if (!e.puzzleWall && (e.armor > ARMOR_CAP || e.armor < ARMOR_FLOOR)) {
        flags.push(`${key} Law 3 — armor ${e.armor} outside [${ARMOR_FLOOR}, ${ARMOR_CAP}]`);
    }
    return flags;
}

// What a Trick's GP actually buys, in damage. A direct trick states it outright; a
// summon spends its damage over a lifetime, so the peg prices the whole hire.
// Returns null for utility skills (transforms), which aren't priced this way. The
// table and the lint both read this — one number, one story.
//
// The summon figure is a CEILING: summonDamage x summonTurns assumes it survives all
// N turns with a target adjacent every one of them. That is the right quantity for a
// <= check — the cap must hold in the best case, or it isn't a cap.
//
// Omitted fields fall back to what the RUNTIME does, never to 0: a def with no
// summonDamage still spawns an Enemy that hits for DEFAULT_DAMAGE, so lint-as-0 would
// wave through an over-peg summon and print a false `0*` in the table.
export function trickDamage(t) {
    // A hybrid (both a bolt AND a summon) would price as the bolt here but be
    // judged by the autonomous band below — wrong on both halves. None exist;
    // flag the day one does rather than mis-price it silently.
    if (typeof t.damage === 'number' && t.summon) return null;
    if (typeof t.damage === 'number') return t.damage;
    if (t.summon) return (t.summonDamage ?? ENEMY_DEFAULT_DAMAGE) * (t.summonTurns ?? SUMMON_DEFAULT_TURNS);
    return null;
}

// Skill lint (Law 1 — the peg ladder). A free damage source is the one thing a rate
// check can't catch (x/0 is Infinity, which passes) — flag it by name.
export function lintSkills() {
    const flags = [];
    for (const t of Object.values(TRICKS)) {
        if (typeof t.damage === 'number' && t.summon) {
            flags.push(`[skill/${t.id}] Law 1 — hybrid bolt+summon has no priced band; split it or extend the law`);
            continue;
        }
        const damage = trickDamage(t);
        if (damage === null) continue;
        if (!(t.gpCost > 0)) {
            flags.push(`[skill/${t.id}] Law 1 — free damage source: ${damage} dmg for ${t.gpCost} GP`);
            continue;
        }
        const rate = pegRate(damage, t.gpCost);
        // Summons sit at the OTHER end of the ladder: a skill-expressing bolt must beat
        // the peg, an autonomous combatant is held AT it.
        if (t.summon) {
            if (rate > AUTONOMOUS_MAX_RATE) {
                flags.push(`[skill/${t.id}] Law 1 — ${rate.toFixed(2)} dmg/GP over ${t.summonTurns ?? SUMMON_DEFAULT_TURNS} turns, expected <= ${AUTONOMOUS_MAX_RATE.toFixed(2)} (above peg — autonomy buys no skill discount)`);
            } else if (rate < AUTONOMOUS_MIN_RATE) {
                flags.push(`[skill/${t.id}] Law 1 — ${rate.toFixed(2)} dmg/GP over ${t.summonTurns ?? SUMMON_DEFAULT_TURNS} turns, expected >= ${AUTONOMOUS_MIN_RATE.toFixed(2)} (well under peg — is this worth the gold?)`);
            }
            continue;
        }
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
                damage: s.damage ?? ENEMY_DEFAULT_DAMAGE,
                gold: s.gold ?? 0,
                vermin: s.vermin ?? false,
                puzzleWall: s.puzzleWall ?? false,
            });
        }
    }
    return roster;
}

// ── Creature card stat blocks ────────────────────────────────────────────────
//
// Generated from the SAME loadMapRoster entries + ttk/REFERENCE_DAMAGE the report()
// golden lints, so a wiki card and the harness can never quietly disagree.
export const STATBLOCK_START = '<!-- statblock:start -->';
export const STATBLOCK_END = '<!-- statblock:end -->';

// e is a loadMapRoster entry (zone/id/type/hp/armor/damage/gold/vermin/puzzleWall),
// optionally with weak/resist/immune arrays — the roster doesn't set those today,
// but a future map/entity shape may, so the block reads them if present.
export function statBlock(e) {
    const lazy = ttk(e.hp, REFERENCE_DAMAGE, e.armor ?? 0);
    const informed = ttk(e.hp, REFERENCE_DAMAGE * 2, e.armor ?? 0);
    const list = a => (a && a.length ? a.join(', ') : '—');
    const armor = e.armor ?? 0;
    // Ties the block to ARMOR_CAP the same way lintEntity does (Law 3) — a
    // puzzleWall is exempt there too.
    const armorNote = (!e.puzzleWall && armor > ARMOR_CAP) ? ` (over cap ${ARMOR_CAP})` : '';
    return [
        STATBLOCK_START,
        `**HP:** ${e.hp}${e.vermin ? ' (vermin)' : e.hp === 100 ? ' — The Hundred' : ''} · **Armor:** ${armor}${armorNote} · **Damage:** ${e.damage}/turn`,
        `**Wallet:** ${e.gold ?? 0} GP · **Weak:** ${list(e.weak)} · **Resist:** ${list(e.resist)} · **Immune:** ${list(e.immune)}`,
        `**TTK (reference loadout):** ${lazy} lazy / ${informed} informed · **Buyout at peg:** ~${(e.hp ?? 0) + (e.gold ?? 0)} GP`,
        STATBLOCK_END,
    ].join('\n');
}

// Pure string op — no fs, so it's trivially testable and reusable for a preview
// mode later. Replaces an existing marker pair in place; otherwise inserts right
// after the closing frontmatter fence (so the block sits above the prose, next to
// the other machine-facing metadata). A card with no frontmatter at all prepends
// instead — there's no fence to anchor after, and prepending keeps the block the
// first thing a reader (or the next run of this same function) hits.
export function applyStatBlock(cardText, block) {
    const markerRe = /<!-- statblock:start -->[\s\S]*?<!-- statblock:end -->/;
    if (markerRe.test(cardText)) {
        return cardText.replace(markerRe, block);
    }
    const fenced = cardText.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
    if (fenced) {
        const idx = fenced[0].length;
        return cardText.slice(0, idx) + '\n' + block + '\n\n' + cardText.slice(idx);
    }
    return block + '\n\n' + cardText;
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
    // The star rides the left-aligned id, never a numeric cell — the num columns owe
    // the reader decimal alignment.
    const tricks = Object.values(TRICKS).slice().sort((a, b) => byCodepoint(a.id, b.id));
    lines.push(...table(TRICK_COLS, tricks.map(t => {
        const damage = trickDamage(t);
        if (damage === null) return [t.id, t.gpCost, '-', '-'];
        return [t.summon ? `${t.id}*` : t.id, t.gpCost, damage,
            t.gpCost > 0 ? pegRate(damage, t.gpCost).toFixed(2) : '-'];
    })));
    if (tricks.some(t => t.summon)) {
        lines.push('* summon: damage is the whole-hire ceiling (summonDamage x summonTurns), so');
        lines.push('  dmg/gp is per HIRE, not per turn — not comparable to a bolt\'s per-cast rate.');
    }
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

// ── Creature card wiring (--cards) ───────────────────────────────────────────

const CARDS_DIR = path.join(__dirname, '..', 'wiki', 'Creature Cards');

// Minimal scalar-only frontmatter read — every card's frontmatter today is flat
// `key: value` lines (name/region/tier/status), so a line parser is enough; no
// need for a real YAML dep to read one more scalar (`enemyId`) off the same shape.
function parseFrontmatter(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (!m) return {};
    const out = {};
    for (const line of m[1].split(/\r?\n/)) {
        const kv = line.match(/^(\w+):\s*(.*)$/);
        if (!kv) continue;
        out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
    }
    return out;
}

// A card wires up once it declares `enemyId: zone/id` matching a live roster
// entry. No card has one today (every cryptid is an unimplemented boss) — that
// makes this a clean no-op on real data, by design; it starts doing something
// the day a cryptid gets implemented and its card gains the field.
function runCards() {
    const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.md')).sort(byCodepoint);
    const roster = loadMapRoster();
    const byKey = new Map(roster.map(e => [`${e.zone}/${e.id}`, e]));

    let wired = 0, written = 0;
    for (const file of files) {
        const full = path.join(CARDS_DIR, file);
        const text = fs.readFileSync(full, 'utf8');
        const fm = parseFrontmatter(text);
        if (!fm.enemyId) continue;
        const entry = byKey.get(fm.enemyId);
        if (!entry) continue;
        wired++;
        const updated = applyStatBlock(text, statBlock(entry));
        if (updated !== text) {
            fs.writeFileSync(full, updated);
            written++;
            console.log(`wired ${file} -> ${fm.enemyId}`);
        }
    }
    console.log(`${files.length} cards scanned, ${wired} wired, ${written} written`);
}

// ── CLI ───────────────────────────────────────────────────────────────────

const USAGE = 'usage: node tools/balance-harness.mjs [--write | --check | --cards]';

function main() {
    const args = process.argv.slice(2);
    const unknown = args.filter(a => a !== '--write' && a !== '--check' && a !== '--cards');
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
        const existing = fs.existsSync(GOLDEN_PATH) ? normEol(fs.readFileSync(GOLDEN_PATH, 'utf8')) : null;
        const fresh = normEol(report());
        if (existing !== fresh) {
            console.log(fresh);
            console.error('balance drift: tools/balance-golden.txt is stale — review the diff above, then `npm run balance:write`');
            process.exit(1);
        }
        console.log('balance golden matches — no drift');
        return;
    }

    if (args.includes('--cards')) {
        runCards();
        return;
    }

    console.log(report());
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
