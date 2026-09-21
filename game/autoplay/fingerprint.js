// fingerprint.js — one short hash of where a run ended. Two runs share a
// fingerprint exactly when their saves and world clocks agree, which is what
// "the same seed replays the same run" means in practice.

import { serialize } from '../save.js';

// FNV-1a, 32-bit, as 8 hex digits.
export function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

// Everything a save carries except when it was written, plus the two world
// clocks a save leaves out.
export function runState(game) {
    const save = serialize(game);
    delete save.savedAt;
    return { save, dayClockMs: game._dayClockMs ?? null, worldTick: game.worldTick ?? null };
}

export const fingerprint = (game) => hash32(JSON.stringify(runState(game)));
