// compactor.js — the trash compactor room (plans/tc1-trash-compactor-walls.md, ruling TC1R1 a).
//
// A room off the Factory's south-west corner. Stepping in shuts its door. One machine, the
// compactor, stands in the middle and never swings; the threat is the room. Every STEP_EVERY
// committed actions the side walls each close one column, shoving whoever stands in them
// inward, and on the CRUSH_STEPS-th step one column is left and you are crushed. Breaking the
// compactor stops the walls where they are and opens the door. A reload keeps the walls where
// they were, and the retry after a death finds the room open again.
//
// The room's state is three small numbers on the game (`game._compactor`, saved as
// `world.compactor`); the wall tiles are always derived from them, so a load, a retry and a
// return visit all paint the same room. These functions take the game and touch only its tiles,
// its log, the door's transition and the player's tile; main.js calls them at a few seams.
//
// Every line of words here is a placeholder.

export const COMPACTOR_MAP = 'compactor-map.json';
export const COMPACTOR_TAG = 'compactor';   // slots.js ENTRIES.compactor.tag
export const STEP_EVERY = 4;                // committed actions per wall step
export const CRUSH_STEPS = 5;               // the step that leaves one column, and crushes you
export const LAST_SAFE_ACTION = CRUSH_STEPS * STEP_EVERY - 1;

// The tiles the room is drawn in (the Factory's own, as stand-ins) and its door, which is also
// the one tile of the bottom wall that is not wall.
export const FLOOR = 40;
export const WALL = 41;
export const DOOR = { x: 5, y: 0 };
// What the door leads to, the same as compactor-map.json's own transition (a test pins them).
export const DOOR_BACK = {
    x: DOOR.x, y: DOOR.y, toMap: 'factory-map.json', toX: 4, toY: 27,
    label: '[North — back out to the Factory]',
};

export const LINES = {
    shut: '[The door shuts behind you. Break the compactor to open it.]',
    step: (left) => `[The walls close in. ${left} ${left === 1 ? 'column is' : 'columns are'} left.]`,
    shove: '[A wall shoves you inward.]',
    crush: '[The walls close on you.]',
    broken: '[The compactor breaks. The walls stop and the door opens.]',
};

export function newCompactor() {
    return { armed: false, actions: 0, broken: false };
}

// A saved state, made safe: a malformed save loads as a room that never started.
export function sanitizeCompactor(raw) {
    const c = newCompactor();
    if (!raw || typeof raw !== 'object') return c;
    const n = Math.floor(Number(raw.actions));
    if (Number.isFinite(n)) c.actions = Math.max(0, Math.min(LAST_SAFE_ACTION, n));
    c.armed = raw.armed === true;
    c.broken = raw.broken === true;
    return c;
}

// The save field: nothing while the room is as new, so every other save is unchanged.
export function compactorEntry(state) {
    const c = sanitizeCompactor(state);
    return (c.armed || c.broken || c.actions > 0) ? { compactor: c } : {};
}

// Wall steps taken after `actions` committed actions in the room.
export const stepsAt = (actions) => Math.min(CRUSH_STEPS, Math.floor(Math.max(0, actions) / STEP_EVERY));

// The columns the walls hold after `steps` steps, in a room `width` wide.
export function closedColumns(steps, width) {
    const out = [];
    for (let k = 0; k < Math.min(steps, Math.ceil(width / 2)); k++) {
        out.push(k);
        if (width - 1 - k !== k) out.push(width - 1 - k);
    }
    return out;
}

const roomUrl = (game) => game._mapUrl ?? game.map?.url;
export const inRoom = (game) => !!game.map && roomUrl(game) === COMPACTOR_MAP;
const state = (game) => (game._compactor ??= newCompactor());

function setIfChanged(game, x, y, id) {
    if (game.map.getTile(x, y) !== id) game.setTile(x, y, id);
}

// Paint the side walls for `steps` steps: closed columns wall, the rest floor.
function paintWalls(game, steps) {
    const W = game.map.width, H = game.map.height;
    const closed = new Set(closedColumns(steps, W));
    for (let x = 0; x < W; x++) {
        for (let y = 1; y < H - 1; y++) setIfChanged(game, x, y, closed.has(x) ? WALL : FLOOR);
    }
}

function shutDoor(game) {
    setIfChanged(game, DOOR.x, DOOR.y, WALL);
    game.map.transitions = game.map.transitions.filter(t => !(t.x === DOOR.x && t.y === DOOR.y));
}

function openDoor(game) {
    setIfChanged(game, DOOR.x, DOOR.y, FLOOR);
    if (!game.map.transitions.some(t => t.x === DOOR.x && t.y === DOOR.y)) game.map.transitions.push({ ...DOOR_BACK });
}

const machine = (game) => (game.enemies || []).find(e => e.tag === COMPACTOR_TAG);

function arm(game) {
    const c = state(game);
    c.armed = true;
    shutDoor(game);
    game._log(LINES.shut, 'transition');
}

// The room as its state says it is: walls for the steps taken, the door shut while the fight is
// on, open once it is broken, and no machine once it is broken (a respawn must not bring it
// back). Safe to call whenever; a room entered fresh arms here, which is the door shutting.
export function applyCompactor(game) {
    if (!inRoom(game)) return;
    const c = state(game);
    paintWalls(game, stepsAt(c.actions));
    if (c.broken) {
        game.enemies = (game.enemies || []).filter(e => e.tag !== COMPACTOR_TAG);
        openDoor(game);
    } else if (c.armed) shutDoor(game);
    else arm(game);
}

// Shove the player out of a closed column to the nearest free tile in an open one.
function shove(game, steps) {
    const W = game.map.width, H = game.map.height;
    const closed = new Set(closedColumns(steps, W));
    if (!closed.has(game.playerX)) return false;
    const taken = (x, y) => (game.enemies || []).some(e => e.entity?.isAlive?.() && e.x === x && e.y === y);
    let best = null;
    for (let x = 0; x < W; x++) {
        if (closed.has(x)) continue;
        for (let y = 1; y < H - 1; y++) {
            if (!game.map.isWalkable(x, y) || taken(x, y)) continue;
            const d = [Math.abs(x - game.playerX), Math.abs(y - game.playerY)];
            if (!best || d[0] < best.d[0] || (d[0] === best.d[0] && d[1] < best.d[1])) best = { x, y, d };
        }
    }
    if (!best) return false;
    game.playerX = best.x;
    game.playerY = best.y;
    return true;
}

// One committed action has been taken. Counts it, steps the walls every STEP_EVERY, and on the
// last step crushes the player. Returns true when the player died, so the caller stops the beat.
// A step that is leaving by the door, a broken room and any other map are not counted.
export function compactorBeat(game) {
    if (!inRoom(game)) return false;
    const c = state(game);
    if (c.broken || game._pendingTransition) return false;
    if (!c.armed) arm(game);   // the retry's first action shuts the door again
    const before = stepsAt(c.actions);
    c.actions = Math.min(LAST_SAFE_ACTION + 1, c.actions + 1);
    const now = stepsAt(c.actions);
    if (now === before) return false;
    paintWalls(game, now);
    if (now >= CRUSH_STEPS) {
        game._log(LINES.crush, 'combat');
        game.playerHp = 0;
        game._lastDefeatedBy = { cause: 'crushed' };
        game._die();
        return true;
    }
    const shoved = shove(game, now);
    game._log(LINES.step(game.map.width - 2 * now), 'combat');
    if (shoved) game._log(LINES.shove, 'combat');
    return false;
}

// The compactor died: the walls stop where they are and the door opens.
export function breakCompactor(game, enemy) {
    if (!enemy || enemy.tag !== COMPACTOR_TAG || !inRoom(game)) return false;
    const c = state(game);
    if (c.broken) return false;
    c.broken = true;
    openDoor(game);
    game._log(LINES.broken, 'combat');
    return true;
}

// The player went down in the room: it starts over. Walls back, door open, the machine whole,
// and the count at nothing; the next action shuts the door again.
export function resetCompactor(game) {
    if (!inRoom(game)) return false;
    const c = state(game);
    if (c.broken) return false;
    c.armed = false;
    c.actions = 0;
    paintWalls(game, 0);
    openDoor(game);
    const m = machine(game);
    if (m && m.entity) m.entity.hp = m.entity.maxHp;
    return true;
}

// A blow to the compactor does not provoke it: it is a machine that never acts.
export const isCompactor = (e) => !!e && e.tag === COMPACTOR_TAG;
