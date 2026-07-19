// save.js — versioned, atomic localStorage save/load for Violencetown.
//
// Per GAME_STUDIO_PLAN.md's save mandates:
//   - versioned schema (migrate older/partial saves, fill missing defaults)
//   - atomic write: stage to a temp key, back up the last good save, commit
//   - one backup slot; readSaveRaw() falls back to it if the live save is bad
//   - clamp/validate on load — never trust deserialized data
//
// Item DEFINITIONS are not stored (they live in items.js / WEAPONS); we
// persist IDs and rehydrate via game._resolveItemDef. Enemies persist a full
// reconstruction blob so dynamically-spawned entities (not in the map JSON)
// survive a round-trip too.

import { Enemy } from './enemies.js';
import { clamp } from './utils.js';
import { INVENTORY_SIZE } from './data.js';
import { SKILL_SLOTS, sanitizeEquipped } from './skills.js';

export const SAVE_VERSION = 1;
const KEY = 'violencetown.save';
const BACKUP_KEY = 'violencetown.save.bak';
const TMP_KEY = 'violencetown.save.tmp';

// ── Existence / raw read ─────────────────────────────────────────────────────

export function hasSave() {
    try { return localStorage.getItem(KEY) != null || localStorage.getItem(BACKUP_KEY) != null; }
    catch { return false; }
}

// Parse the live save; fall back to the backup slot if the live one is missing
// or corrupt. Returns a migrated+validated raw object, or null.
export function readSaveRaw() {
    let raw = _parse(KEY) || _parse(BACKUP_KEY);
    if (!raw) return null;
    try { return validate(migrate(raw)); }
    catch (e) { console.warn('[save] read failed', e); return null; }
}

function _parse(key) {
    try {
        const s = localStorage.getItem(key);
        if (!s) return null;
        const o = JSON.parse(s);
        return (o && typeof o === 'object') ? o : null;
    } catch { return null; }
}

// ── Serialize ────────────────────────────────────────────────────────────────

const idOf = (def) => (def && def.id) ? def.id : null;

export function serialize(game) {
    return {
        version: SAVE_VERSION,
        savedAt: Date.now(),
        mapUrl: game.map?.url ?? 'town-map.json',
        turn: game.turn,
        rngState: game.rng ? game.rng.getState() : 0,
        player: {
            x: game.playerX, y: game.playerY,
            hp: game.playerHp, maxHp: game.playerMaxHp,
            mp: game.playerMp, maxMp: game.playerMaxMp,
            facing: game.facing,
            gold: game.gold,
            carFuel: game.carFuel,
            learnedTricks:  [...(game.learnedTricks  || [])],
            learnedSpells:  [...(game.learnedSpells  || [])],
            equippedTricks: [...(game.equippedTricks || [])],
            equippedSpells: [...(game.equippedSpells || [])],
            equipment: {
                weapon: idOf(game.equipment.weapon),
                top: idOf(game.equipment.top),
                bottom: idOf(game.equipment.bottom),
                front: idOf(game.equipment.front),
                back: idOf(game.equipment.back),
                sides: idOf(game.equipment.sides),
            },
            tempEquips: (game.tempEquips || []).map(te => ({
                slot: te.slot,
                itemId: idOf(te.itemDef),
                turnsLeft: te.turnsLeft,
                previousItemId: idOf(te.previousItem),
            })),
            buffs: (game.buffs || []).map(b => ({ ...b })),
            inventory: (game.inventory || []).map(s => s ? { id: s.itemDef.id, count: s.count } : null),
        },
        world: {
            groundItems: (game.groundItems || []).map(g => ({ type: g.type, x: g.x, y: g.y })),
            // Picked-up ground items, so collected items stay gone after reload.
            // Live form is a Set of keys; persist as a plain array.
            collectedItems: game._collectedItems ? [...game._collectedItems] : [],
            // Runtime ground-drops per map, so dropped items survive zone changes.
            droppedItems: game._droppedItems || {},
            containers: (game.containers || []).map(c => ({
                id: c.id, type: c.type, x: c.x, y: c.y, contents: (c.contents || []).slice(),
            })),
            enemies: (game.enemies || []).map(serEnemy),
            tileDiffs: (game._tileDiffs || []).map(d => ({ x: d.x, y: d.y, id: d.id })),
            pendingTransition: game._pendingTransition || null,
        },
        quest: game.questEngine ? game.questEngine.serialize() : null,
        sewerEscape: game._sewerEscape || null,
    };
}

// The enemy save shape lives WITH the Enemy class (enemies.js toSave/fromSave) so
// it can't drift from the constructor — the drift that already shipped bugs.
// These are thin adapters over it.
function serEnemy(e) { return e.toSave(); }

// ── Write (atomic + backup) ──────────────────────────────────────────────────

export function writeSave(game) {
    let json;
    try { json = JSON.stringify(serialize(game)); }
    catch (e) { console.warn('[save] serialize failed', e); return false; }
    try {
        localStorage.setItem(TMP_KEY, json);                       // 1. stage
        const prev = localStorage.getItem(KEY);
        if (prev != null) localStorage.setItem(BACKUP_KEY, prev);  // 2. back up last good
        localStorage.setItem(KEY, json);                           // 3. commit
        localStorage.removeItem(TMP_KEY);                          // 4. clear stage
        return true;
    } catch (e) {
        console.warn('[save] write failed (quota / private mode?)', e);
        if (typeof game._log === 'function') game._log('[Save failed]');
        return false;
    }
}

export function clearSave() {
    try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(BACKUP_KEY);
        localStorage.removeItem(TMP_KEY);
    } catch { /* ignore */ }
}

// ── Migrate / validate ───────────────────────────────────────────────────────

// Bring an older/partial raw save up to the current schema, filling defaults
// for any missing fields so loading never crashes on an old blob.
export function migrate(raw) {
    const r = { ...raw };
    if (typeof r.version !== 'number') r.version = SAVE_VERSION;
    // Future: stepwise upgrades keyed on r.version go here.
    if (typeof r.mapUrl !== 'string') r.mapUrl = 'town-map.json';
    if (typeof r.turn !== 'number') r.turn = 0;
    if (typeof r.rngState !== 'number') r.rngState = 0;
    r.player = (r.player && typeof r.player === 'object') ? r.player : {};
    r.world = (r.world && typeof r.world === 'object') ? r.world : {};
    if (!Array.isArray(r.world.tileDiffs)) r.world.tileDiffs = [];
    if (!Array.isArray(r.world.enemies)) r.world.enemies = [];
    if (!Array.isArray(r.world.groundItems)) r.world.groundItems = [];
    if (!Array.isArray(r.world.collectedItems)) r.world.collectedItems = [];
    if (!r.world.droppedItems || typeof r.world.droppedItems !== 'object') r.world.droppedItems = {};
    if (!Array.isArray(r.world.containers)) r.world.containers = [];
    if (r.quest === undefined) r.quest = null;
    if (r.sewerEscape === undefined) r.sewerEscape = null;
    return r;
}

// Clamp/sanitize every field. Never trust deserialized data.
function validate(raw) {
    const p = raw.player;
    p.maxHp = _num(p.maxHp, 100);
    p.hp = clamp(_num(p.hp, p.maxHp), 0, p.maxHp);
    p.maxMp = _num(p.maxMp, 100);
    p.mp = clamp(_num(p.mp, p.maxMp), 0, p.maxMp);
    p.gold = Math.max(0, _num(p.gold, 0));
    if (!['up', 'down', 'left', 'right'].includes(p.facing)) p.facing = 'down';
    // Leave x/y undefined when absent/invalid so _loadMap falls back to the
    // map's spawn (a known-walkable tile) instead of (0,0), which is usually a
    // wall. loadInto clamps to map bounds after loading.
    p.x = (typeof p.x === 'number' && isFinite(p.x)) ? p.x : undefined;
    p.y = (typeof p.y === 'number' && isFinite(p.y)) ? p.y : undefined;

    // Normalize to INVENTORY_SIZE slots. An older save with extra slots is
    // truncated; a non-quest item in a dropped slot is lost (acceptable — the
    // count only ever shrank from 10→9). (fix/critical-path)
    const inv = Array.isArray(p.inventory) ? p.inventory : [];
    p.inventory = [];
    for (let i = 0; i < INVENTORY_SIZE; i++) {
        const s = inv[i];
        p.inventory.push(s && typeof s.id === 'string'
            ? { id: s.id, count: clamp(_num(s.count, 1), 1, 99) }
            : null);
    }
    if (!p.equipment || typeof p.equipment !== 'object') p.equipment = {};
    if (!Array.isArray(p.buffs)) p.buffs = [];
    if (!Array.isArray(p.tempEquips)) p.tempEquips = [];
    // Ring-builds: coerce to string arrays; equipped ⊆ learned, clamped to cap.
    const asIds = (a) => (Array.isArray(a) ? a.filter(id => typeof id === 'string') : []);
    p.learnedTricks  = asIds(p.learnedTricks);
    p.learnedSpells  = asIds(p.learnedSpells);
    p.equippedTricks = sanitizeEquipped(p.learnedTricks, asIds(p.equippedTricks), SKILL_SLOTS.trick);
    p.equippedSpells = sanitizeEquipped(p.learnedSpells, asIds(p.equippedSpells), SKILL_SLOTS.spell);
    // collectedItems is a Set of string keys on the live game; drop anything
    // non-string so a malformed save can't poison the lookup.
    const ci = Array.isArray(raw.world?.collectedItems) ? raw.world.collectedItems : [];
    if (raw.world) raw.world.collectedItems = ci.filter(k => typeof k === 'string');
    raw.turn = Math.max(0, _num(raw.turn, 0));
    return raw;
}

function _num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

// ── Load into a live Game ────────────────────────────────────────────────────

// Mutates the existing Game (so renderer + event listeners stay wired) rather
// than constructing a new one. Order matters: load the map baseline first,
// then overwrite the live world from the save, then re-apply tile diffs.
export async function loadInto(game, raw) {
    raw = validate(migrate(raw));
    const p = raw.player;
    const R = (id) => game._resolveItemDef(id);

    // 1. baseline map (spawns JSON enemies/items/containers; sets renderer
    //    zone). Missing coords fall back to the map spawn; clamp to bounds so
    //    a malformed save can't strand the player off-map.
    await game._loadMap(raw.mapUrl, p.x, p.y);
    game.playerX = clamp(game.playerX, 0, game.map.width - 1);
    game.playerY = clamp(game.playerY, 0, game.map.height - 1);

    // 2. core stats + RNG stream position
    game.turn = raw.turn;
    if (game.rng) game.rng.setState(raw.rngState);
    game.playerHp = p.hp; game.playerMaxHp = p.maxHp;
    game.playerMp = p.mp; game.playerMaxMp = p.maxMp;
    game.gold = p.gold;
    game.carFuel = p.carFuel || 'raw';
    game.facing = p.facing;

    // 3. equipment / inventory / temp-equips / buffs (rehydrate defs by id)
    game.equipment = {
        weapon: R(p.equipment.weapon) || game.equipment.weapon,
        top: R(p.equipment.top), bottom: R(p.equipment.bottom),
        front: R(p.equipment.front), back: R(p.equipment.back), sides: R(p.equipment.sides),
    };
    // Ring-builds: restore the learned pool + equipped loadout BEFORE refreshing
    // grants, so the merge (base ∪ equipped ∪ gear) includes the slotted skills.
    game.learnedTricks  = new Set(p.learnedTricks  || []);
    game.learnedSpells  = new Set(p.learnedSpells  || []);
    game.equippedTricks = [...(p.equippedTricks || [])];
    game.equippedSpells = [...(p.equippedSpells || [])];
    // knownSpells/grantedTricks are derived, not stored — rebuild from the
    // restored weapon + loadout (the Ray Gun grants Ray Blast, etc.).
    if (game._refreshGrantedSkills) game._refreshGrantedSkills();
    game.inventory = p.inventory.map(s => {
        if (!s) return null;
        const def = R(s.id);
        return def ? { itemDef: def, count: s.count } : null;
    });
    game.tempEquips = p.tempEquips
        .map(te => ({ slot: te.slot, itemDef: R(te.itemId), turnsLeft: te.turnsLeft, previousItem: R(te.previousItemId) }))
        .filter(te => te.itemDef);
    game.buffs = p.buffs.map(b => ({ ...b }));
    game.selectedSlot = -1;

    // 4. world — overwrite the JSON baseline with the saved live state
    game.groundItems = raw.world.groundItems
        .map(g => ({ type: g.type, x: g.x, y: g.y, def: R(g.type) }))
        .filter(g => g.def);
    // Picked-up items stay collected across reload — rehydrate into the Set the
    // runtime uses for no-respawn checks.
    game._collectedItems = new Set(raw.world.collectedItems || []);
    game._droppedItems = raw.world.droppedItems || {};
    game.containers = raw.world.containers.map(c => ({
        id: c.id, type: c.type, x: c.x, y: c.y, contents: (c.contents || []).slice(),
    }));
    game.enemies = raw.world.enemies.map(hydrateEnemy);

    // 5. runtime tile mutations — re-applied AFTER spawn so JSON walls don't
    //    clobber them. setTile rebuilds game._tileDiffs as a side effect.
    game._tileDiffs = [];
    for (const d of raw.world.tileDiffs) {
        if (game.map.isInBounds(d.x, d.y)) game.setTile(d.x, d.y, d.id);
    }
    game._pendingTransition = raw.world.pendingTransition || null;

    // 6. quest progress (engine arrives in Phase C; guarded for older builds)
    if (game.questEngine && raw.quest) game.questEngine.restore(raw.quest);
    game._sewerEscape = raw.sewerEscape || null;

    // 7. settle
    game._lastAutosaveTurn = game.turn;
    game.state = 'idle';
    game._render();
    return true;
}

function hydrateEnemy(s) { return Enemy.fromSave(s); }
