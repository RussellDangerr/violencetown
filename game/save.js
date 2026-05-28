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
            containers: (game.containers || []).map(c => ({
                id: c.id, type: c.type, x: c.x, y: c.y, contents: (c.contents || []).slice(),
            })),
            enemies: (game.enemies || []).map(serEnemy),
            tileDiffs: (game._tileDiffs || []).map(d => ({ x: d.x, y: d.y, id: d.id })),
            pendingTransition: game._pendingTransition || null,
        },
        quest: game.questEngine ? game.questEngine.serialize() : null,
    };
}

function serEnemy(e) {
    return {
        id: e.id, type: e.type, x: e.x, y: e.y,
        hp: e.entity.hp, maxHp: e.entity.maxHp, alive: e.entity.alive, armor: e.entity.armor,
        damage: e.damage, sightRange: e.sightRange,
        behavior: e.behavior, homeRegion: e.homeRegion,
        wanderRadius: e.wanderRadius, wanderEveryTurns: e.wanderEveryTurns,
        wantsItems: e.wantsItems, depositsTo: e.depositsTo,
        barks: e.barks, barkEveryTurns: e.barkEveryTurns, adjacencyBark: e.adjacencyBark,
        disposition: e.disposition, flipThreshold: e.flipThreshold, bribeable: e.bribeable,
        values: e.values, onFlip: e.onFlip,
        // runtime
        state: e.state, fsmState: e.fsmState, lastWanderTurn: e._lastWanderTurn,
        carrying: e.carrying, barkIndex: e._barkIndex, barkOffset: e._barkOffset,
        wasAdjacent: e._wasAdjacent, buffs: (e.buffs || []).map(b => ({ ...b })),
        // phase-D extras (present only when set on the live enemy)
        isBarricade: e.isBarricade, tag: e.tag,
    };
}

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
    if (!Array.isArray(r.world.containers)) r.world.containers = [];
    if (r.quest === undefined) r.quest = null;
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

    const inv = Array.isArray(p.inventory) ? p.inventory : [];
    p.inventory = [];
    for (let i = 0; i < 10; i++) {
        const s = inv[i];
        p.inventory.push(s && typeof s.id === 'string'
            ? { id: s.id, count: clamp(_num(s.count, 1), 1, 99) }
            : null);
    }
    if (!p.equipment || typeof p.equipment !== 'object') p.equipment = {};
    if (!Array.isArray(p.buffs)) p.buffs = [];
    if (!Array.isArray(p.tempEquips)) p.tempEquips = [];
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
    game.facing = p.facing;

    // 3. equipment / inventory / temp-equips / buffs (rehydrate defs by id)
    game.equipment = {
        weapon: R(p.equipment.weapon) || game.equipment.weapon,
        top: R(p.equipment.top), bottom: R(p.equipment.bottom),
        front: R(p.equipment.front), back: R(p.equipment.back), sides: R(p.equipment.sides),
    };
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

    // 7. settle
    game._lastAutosaveTurn = game.turn;
    game.state = 'idle';
    game._render();
    return true;
}

function hydrateEnemy(s) {
    const e = new Enemy(s);                       // reads config fields; hp → Entity
    e.entity.maxHp = _num(s.maxHp, e.entity.maxHp);
    e.entity.hp = clamp(_num(s.hp, e.entity.maxHp), 0, e.entity.maxHp);
    e.entity.alive = s.alive !== false;
    e.state = s.state || 'idle';
    e.fsmState = s.fsmState ?? null;
    e._lastWanderTurn = _num(s.lastWanderTurn, 0);
    e.carrying = s.carrying ?? null;
    e._barkIndex = _num(s.barkIndex, 0);
    e._barkOffset = (typeof s.barkOffset === 'number') ? s.barkOffset : null;
    e._wasAdjacent = s.wasAdjacent === true;
    e.buffs = Array.isArray(s.buffs) ? s.buffs.map(b => ({ ...b })) : [];
    if (s.isBarricade) e.isBarricade = true;
    if (s.tag != null) e.tag = s.tag;
    return e;
}
