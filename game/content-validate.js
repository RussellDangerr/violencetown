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
import { ITEMS } from './items.js';
import { WEAPONS } from './weapons.js';
import { DIALOGUES } from './dialogue.js';
import { zoneByName, overworldZone } from './world-map.js';

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

export function validateContent(maps) {
    const problems = [];
    const warnings = [];
    const P = (m) => problems.push(m);
    const W = (m) => warnings.push(m);

    // Id universes. The game resolves an item id via WEAPONS[id] || ITEMS[id]
    // (main.js _resolveItemDef), so the item closure is the union.
    const itemIds = new Set([...Object.keys(ITEMS), ...Object.keys(WEAPONS)]);
    const dialogueIds = new Set(Object.keys(DIALOGUES));
    const mapFileSet = new Set(maps.map(m => m.file));
    const npcIds = new Set();
    for (const { data } of maps) for (const e of (data.enemies || [])) if (e && e.id) npcIds.add(e.id);

    // ── Map references ───────────────────────────────────────────────────────
    for (const { file, data } of maps) {
        for (const e of (data.enemies || [])) {
            for (const id of (e.stock || []))
                if (!itemIds.has(id)) P(`${file}: enemy ${e.id || '?'} stocks unknown item '${id}'`);
            if (e.dialogueId && !dialogueIds.has(e.dialogueId))
                P(`${file}: enemy ${e.id || '?'} has unknown dialogueId '${e.dialogueId}'`);
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

    return { problems, warnings };
}
