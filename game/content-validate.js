// content-validate.js — CD-2's pure, browser-safe content-integrity checker.
//
// Walks the whole content graph and returns every DANGLING id: a quest / vendor /
// examinable / transition / dialogue reference to an item / npc / map / dialogue /
// zone that doesn't exist. A typo here otherwise fails SILENTLY, usually only when
// a player physically reaches the broken step. This is CastleDoctrine's "prove the
// house is solvable before you publish it" self-test, transposed to an author-time
// lint over hand-authored single-player content.
//
// Pure + dependency-light so it runs BOTH as a node test (tests/content-integrity)
// AND in the browser (the map data is the only environment-specific input, passed
// in): node reads the JSON via fs, a browser harness fetches it.
//
//   validateContent(maps) -> { problems: string[], warnings: string[] }
//   maps: Array<{ file: string, data: <parsed *-map.json> }>
//
// `problems` are hard failures (unambiguous dangling ids). `warnings` are
// advisories that can lag intentionally (zone naming) — surfaced, never fatal.

import { QUESTS } from './quests.js';
import { ALL_ITEM_IDS } from './item-registry.js';
import { DIALOGUES } from './dialogue.js';
import { zoneByName, overworldZone } from './world-map.js';
import { ENEMY_SPRITES } from './sprites.js';
import { SLOTS, ENTRIES } from './slots.js';
import { ITEMS } from './items.js';
import { WEAPONS, WEAPON_TIERS } from './weapons.js';
import { RINGS, FUSIONS } from './ring-data.js';
import { TILES } from './data.js';
import { unknownTags } from './tags.js';

// The map lists whose entries are spawns that may carry `tags`.
export const TAGGED_SPAWN_LISTS = ['enemies', 'items', 'examinables', 'props', 'containers'];

// Problems for one carrier's `tags`: absent is fine; anything else must be an
// array of known tags (tags.js TAGS).
function tagProblems(where, tags) {
    if (tags === undefined || tags === null) return [];
    if (!Array.isArray(tags)) return [`${where}: tags must be an array`];
    return unknownTags(tags).map(t => `${where}: unknown tag '${t}'`);
}

// The event vocabulary a quest stage may wait on, and the payload keys each
// emit site carries — kept in sync with the emitGameEvent call sites
// (main.js / examine.js). A stage that waits on an unknown type, or matches a
// key the payload never carries, can never fire.
export const EVENT_PAYLOAD_KEYS = {
    examine:      ['targetId'],
    interact_car: [],
    item_given:   ['npc', 'item'],
    map_entered:  ['map'],
    npc_adjacent: ['id', 'type'],
    item_pickup:  ['id'],
    enemy_killed: ['type', 'id', 'x', 'y', 'tag'],
};
const ITEM_MATCH_KEYS = new Set(['id', 'item']);  // item_pickup.id, item_given.item
const NPC_MATCH_KEYS  = new Set(['npc']);
const MAP_MATCH_KEYS  = new Set(['map']);

export function validateContent(maps, {
    slots = SLOTS, entries = ENTRIES,
    items = ITEMS, weapons = WEAPONS, weaponTiers = WEAPON_TIERS,
    rings = RINGS, fusions = FUSIONS, tiles = TILES,
} = {}) {
    const problems = [];
    const warnings = [];
    const P = (m) => problems.push(m);
    const W = (m) => warnings.push(m);

    // Id universes — item-registry.js is the one place these are built.
    const itemIds = ALL_ITEM_IDS;
    const dialogueIds = new Set(Object.keys(DIALOGUES));
    const mapFileSet = new Set(maps.map(m => m.file));
    const npcIds = new Set();
    for (const { data } of maps) for (const e of (data.enemies || [])) if (e && e.id) npcIds.add(e.id);

    // ── Spine slots (plans/slot-registry.md) ─────────────────────────────────
    // A registry entry is a spawn that has not been placed yet, so it gets the
    // same reference checks a map spawn does — or moving the Were-Rat into the
    // registry would have quietly stopped checking its kit and its art.
    for (const [id, e] of Object.entries(entries)) {
        for (const it of [...(e.loadout || []), ...(e.equipped || [])])
            if (!itemIds.has(it)) P(`registry: entry '${id}' carries unknown item '${it}'`);
        if (!e.type) P(`registry: entry '${id}' has no type`);
        else if (!ENEMY_SPRITES[e.type]) P(`registry: entry '${id}' has type '${e.type}' with no ENEMY_SPRITES entry`);
        if (e.dialogueId && !dialogueIds.has(e.dialogueId)) P(`registry: entry '${id}' has unknown dialogueId '${e.dialogueId}'`);
    }
    const placed = {};
    for (const { file, data } of maps) for (const e of (data.enemies || [])) {
        // A spawn placed by hand names its entry (plans/rv1-carnival-rats.md).
        if (e && e.entry !== undefined) {
            if (e.slot) P(`${file}: spawn ${e.id || '?'} names both slot '${e.slot}' and entry '${e.entry}'`);
            else if (!entries[e.entry]) P(`${file}: spawn ${e.id || '?'} names unknown entry '${e.entry}'`);
            if (e.type) P(`${file}: spawn ${e.id || '?'} names entry '${e.entry}' and also a type; the entry owns the type`);
        }
        if (!e || !e.slot) continue;
        if (!slots[e.slot]) { P(`${file}: spawn ${e.id || '?'} names unknown slot '${e.slot}'`); continue; }
        (placed[e.slot] ||= []).push(file);
    }
    for (const [id, slot] of Object.entries(slots)) {
        if (!slot.pool || !slot.pool.length) P(`slot '${id}' has an empty pool`);
        for (const { entry } of (slot.pool || [])) if (!entries[entry]) P(`slot '${id}' pools unknown entry '${entry}'`);
        if (slot.requiredDrop && !itemIds.has(slot.requiredDrop)) P(`slot '${id}' requires unknown item '${slot.requiredDrop}'`);
        const where = placed[id] || [];
        if (slot.kind === 'boss' && (where.length !== 1 || where[0] !== slot.map))
            P(`slot '${id}' must stand exactly once, on ${slot.map} — found on [${where.join(', ')}]`);
    }

    // ── Map references ───────────────────────────────────────────────────────
    for (const { file, data } of maps) {
        for (const e of (data.enemies || [])) {
            for (const id of (e.stock || [])) {
                if (!itemIds.has(id)) P(`${file}: enemy ${e.id || '?'} stocks unknown item '${id}'`);
            }
            for (const id of (e.loadout || []))
                if (!itemIds.has(id)) P(`${file}: enemy ${e.id || '?'} carries unknown item '${id}'`);
            if (e.dialogueId && !dialogueIds.has(e.dialogueId))
                P(`${file}: enemy ${e.id || '?'} has unknown dialogueId '${e.dialogueId}'`);
            // Sprite coverage — a type with no ENEMY_SPRITES entry renders as a
            // flat red box, silently, on every run. Nine of them accumulated
            // before anyone noticed (plans/visual-pass.md).
            if (e.type && !ENEMY_SPRITES[e.type])
                P(`${file}: enemy ${e.id || '?'} has type '${e.type}' with no ENEMY_SPRITES entry — renders as a fallback box`);
        }
        for (const it of (data.items || []))
            if (it && it.type && !itemIds.has(it.type)) P(`${file}: ground item '${it.type}' at (${it.x},${it.y}) unknown`);
        for (const x of (data.examinables || []))
            if (x && x.grants && !itemIds.has(x.grants)) P(`${file}: examinable ${x.id || '?'} grants unknown item '${x.grants}'`);
        for (const t of (data.transitions || []))
            if (t && t.toMap && !mapFileSet.has(t.toMap)) P(`${file}: transition at (${t.x},${t.y}) → unknown map '${t.toMap}'`);
        if (data.zoneName && !overworldZone(data.zoneName))
            W(`${file}: zoneName '${data.zoneName}' is neither a WORLD_ZONE nor a known interior (world-map "you are here" won't land)`);
    }

    // ── Quest references ─────────────────────────────────────────────────────
    for (const [qid, q] of Object.entries(QUESTS)) {
        for (const stage of (q.stages || [])) {
            const on = stage.on;
            if (on) {
                const keys = EVENT_PAYLOAD_KEYS[on.type];
                if (!keys) {
                    P(`${qid}/${stage.id}: waits on unknown event type '${on.type}'`);
                } else {
                    for (const [k, v] of Object.entries(on.match || {})) {
                        if (!keys.includes(k)) { P(`${qid}/${stage.id}: '${on.type}' has no payload key '${k}'`); continue; }
                        if (ITEM_MATCH_KEYS.has(k) && !itemIds.has(v)) P(`${qid}/${stage.id}: matches unknown item '${v}'`);
                        if (NPC_MATCH_KEYS.has(k)  && !npcIds.has(v))  P(`${qid}/${stage.id}: matches unknown npc '${v}'`);
                        if (MAP_MATCH_KEYS.has(k)  && !mapFileSet.has(v)) P(`${qid}/${stage.id}: matches unknown map '${v}'`);
                    }
                }
            }
            if (stage.targetZone && !zoneByName(stage.targetZone))
                P(`${qid}/${stage.id}: unknown targetZone '${stage.targetZone}'`);
        }
    }

    // ── Dialogue references ──────────────────────────────────────────────────
    const grantRe = /_grantItem\(\s*['"]([^'"]+)['"]/g;
    for (const [did, d] of Object.entries(DIALOGUES)) {
        for (const c of (d.choices || [])) {
            for (const key of ['requiresItem', 'consumesItem'])
                if (c[key] && !itemIds.has(c[key])) P(`${did}/${c.id}: ${key} references unknown item '${c[key]}'`);
            // Best-effort: onPick closures grant items by literal id via
            // game._grantItem('X'). Scan the closure source; ids we extract must
            // resolve (extraction misses simply don't assert).
            if (typeof c.onPick === 'function') {
                const src = c.onPick.toString();
                let m;
                while ((m = grantRe.exec(src))) if (!itemIds.has(m[1])) P(`${did}/${c.id}: _grantItem('${m[1]}') references unknown item`);
            }
        }
    }

    // ── Tags (plans/t1-tag-layer.md) ─────────────────────────────────────────
    // Every tag in content must be in the one vocabulary (tags.js).
    const TP = (where, tags) => { for (const m of tagProblems(where, tags)) P(m); };
    for (const [id, d] of Object.entries(items))   TP(`item '${id}'`, d?.tags);
    for (const [id, d] of Object.entries(weapons)) TP(`weapon '${id}'`, d?.tags);
    for (const [cls, tiers] of Object.entries(weaponTiers))
        for (const d of (tiers || [])) TP(`weapon tier '${d?.id || cls}'`, d?.tags);
    for (const [id, d] of Object.entries(rings))   TP(`ring '${id}'`, d?.tags);
    for (const fz of (fusions || [])) {
        if (fz && Array.isArray(fz.pair)) TP(`fusion '${fz.id || '?'}' pair`, fz.pair);
    }
    for (const [key, d] of Object.entries(tiles))  TP(`tile ${key}`, d?.tags);
    for (const [id, e] of Object.entries(entries)) TP(`registry: entry '${id}'`, e?.tags);
    for (const { file, data } of maps) {
        for (const list of TAGGED_SPAWN_LISTS) {
            (data[list] || []).forEach((s, i) => {
                if (s) TP(`${file}: ${list}[${i}]${s.id ? ` (${s.id})` : ''}`, s.tags);
            });
        }
    }

    // ── Weapon damage (plans/fx6-tier-weapon-damage.md) ──────────────────────
    // A holdable weapon with no damage number swings for NaN. Every weapon,
    // every item held in the weapon slot, and every tier weapon must carry a real one.
    const DP = (where, d) => {
        if (typeof d?.damage !== 'number' || !Number.isFinite(d.damage)) P(`${where}: has no damage number`);
    };
    for (const [id, d] of Object.entries(weapons)) DP(`weapon '${id}'`, d);
    for (const [id, d] of Object.entries(items)) if (isHoldableWeapon(d)) DP(`item '${id}'`, d);
    for (const [cls, tiers] of Object.entries(weaponTiers))
        for (const d of (tiers || [])) DP(`weapon tier '${d?.id || cls}'`, d);

    return { problems, warnings };
}

// A def held in the weapon slot (the pipe), as opposed to one only thrown.
export function isHoldableWeapon(def) {
    return !!def && def.equipSlot === 'weapon';
}
