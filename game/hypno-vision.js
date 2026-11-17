// hypno-vision.js — the Factory's Hypno Vision (plans/hv1-hypno-vision-factory.md).
//
// A screen on the north wall at (16,1). While the player stands within RANGE tiles of it with a
// line of sight to it, every TURN_EVERY committed actions it turns one neutral worker or robot (a
// `hypno_target`) in its range against the player. The nerd who runs it (`hypno_nerd`) switches
// it off by talking, or by being knocked out. Off is a quest flag, which the save already keeps;
// switching off calms every worker and robot then hostile, which are the ones it turned (the map
// places them neutral; one you struck first is calmed with them). The action counter is runtime only and starts over whenever the player is out of
// range or out of sight.
//
// These functions take the game and touch only its enemies, its log and the flag. main.js calls
// them at three seams: after each committed action, on map load, and on a death.
//
// Every line of words here is a placeholder.

import { hasLineOfSight } from './pathing.js';
import { chebyshev } from './utils.js';

export const FACTORY_MAP = 'factory-map.json';
export const TV = { x: 16, y: 1 };
export const RANGE = 6;          // tiles, from the screen
export const TURN_EVERY = 3;     // committed actions in its sight per creature turned
export const TARGET_TAG = 'hypno_target';
export const NERD_TAG = 'hypno_nerd';
export const OFF_FLAG = 'hypnoVisionOff';

export const LINES = {
    turn: (who) => `[The Hypno Vision turns the ${String(who).replace(/[\[\]]/g, '')} against you.]`,
    off: '[The Hypno Vision is off. Those it turned go back to neutral.]',
};

const mapUrl = (game) => game._mapUrl ?? game.map?.url;
export const inFactory = (game) => !!game.map && mapUrl(game) === FACTORY_MAP;
const flags = (game) => game.questEngine?.state?.flags;
export const isOff = (game) => !!flags(game)?.[OFF_FLAG];
const alive = (e) => !!e?.entity?.isAlive?.();

// Can the screen see this tile: inside its range and with a clear line.
export function inSight(game, x, y) {
    return chebyshev(TV.x, TV.y, x, y) <= RANGE && hasLineOfSight(game.map, TV.x, TV.y, x, y);
}

const nameOf = (e) => e.name ?? e.entity?.name ?? e.type;   // the placeholder role name, which the log shows

// The next creature it turns: the first neutral, living target in its sight, in spawn order.
export function nextTarget(game) {
    return (game.enemies || []).find(e =>
        e.tag === TARGET_TAG && alive(e) && e.allegiance === 'neutral' && inSight(game, e.x, e.y)) || null;
}

function turn(game, e) {
    e._hypnoTurned = true;
    e._hypnoDisposition = e.disposition;
    e.allegiance = 'hostile';   // authoritative: routes to the HOSTILE chase (npc.js)
    e.fsmState = 'HOSTILE';
    e.state = 'chasing';
    if (typeof e.disposition === 'number') e.disposition = Math.min(e.disposition, -50);
    game._log(LINES.turn(nameOf(e)), 'combat');
}

function calm(e) {
    e.allegiance = 'neutral';
    e.fsmState = 'IDLE';
    e.state = 'idle';
    if (typeof e._hypnoDisposition === 'number') e.disposition = e._hypnoDisposition;
    else if (typeof e.disposition === 'number') e.disposition = 0;
    e._hypnoTurned = false;
}

// Every hostile target goes back to neutral. A target is only ever hostile because the screen
// turned it (the map places them neutral), so the tag is what picks them out. Returns how many.
export function calmTurned(game) {
    let n = 0;
    for (const e of game.enemies || []) {
        if (e.tag !== TARGET_TAG || e.allegiance !== 'hostile') continue;
        calm(e);
        n++;
    }
    return n;
}

// Switch it off for good: the flag, then the calm. Safe to call twice.
export function switchOff(game) {
    const f = flags(game);
    if (!f || f[OFF_FLAG]) return false;
    f[OFF_FLAG] = true;
    calmTurned(game);
    game._log(LINES.off, 'combat');
    return true;
}

// The screen itself: a drawn prop on the wall tile and an Examine point, added when the Factory
// loads (the stand-in cabinet is the casino's slot machine art; it is a stand-in until designed).
export const SCREEN_PROP = { type: 'slotMachine', x: TV.x, y: TV.y, solid: false };
export const SCREEN_EXAMINE = {
    id: 'hypno-vision', x: TV.x, y: TV.y,
    text: '[Hypno Vision. A screen on the wall. While you are within 6 tiles and it can see you, it turns one worker or robot against you every 3 actions. The nerd in the south alcove can switch it off.]',
};

function placeScreen(game) {
    const props = game.map.propSpawns || [];
    if (!props.some(p => p.x === TV.x && p.y === TV.y)) game.map.propSpawns = [...props, { ...SCREEN_PROP }];
    if (!Array.isArray(game.examinables)) game.examinables = [];
    if (!game.examinables.some(e => e.id === SCREEN_EXAMINE.id)) game.examinables.push({ ...SCREEN_EXAMINE });
}

// A map load: the screen is on the wall. Nothing else needs doing here: the calm is saved with
// the creatures (switchOff runs it before any save can see it off), and the flag is the quest's.
export function applyHypno(game) {
    if (!inFactory(game)) return false;
    placeScreen(game);
    return true;
}

// A death: the nerd falling switches it off.
export function hypnoOnDeath(game, enemy) {
    if (!enemy || enemy.tag !== NERD_TAG || !inFactory(game)) return false;
    return switchOff(game);
}

// One committed action has been taken. Counts it while the player stands in the screen's sight,
// and on every TURN_EVERY-th turns the next creature. Returns true when one turned.
export function hypnoBeat(game) {
    if (!inFactory(game) || isOff(game) || game._pendingTransition) return false;
    if (!inSight(game, game.playerX, game.playerY)) { game._hypnoActions = 0; return false; }
    game._hypnoActions = (game._hypnoActions || 0) + 1;
    if (game._hypnoActions < TURN_EVERY) return false;
    const e = nextTarget(game);
    if (!e) return false;   // none left to turn: the count waits at the threshold
    game._hypnoActions = 0;
    turn(game, e);
    return true;
}
