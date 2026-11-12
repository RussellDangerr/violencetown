// away.js (CK1) — how long the player was away, in whole hours.
//
// The save already stamps `savedAt`, and the game saves when the tab is hidden, so the time
// away is the gap between that stamp and now. It is read once per return (a load, or the tab
// becoming visible again) and never by counting timers. Nothing here touches the main RNG.

export const MS_PER_HOUR = 3600 * 1000;
// PLACEHOLDER: 7 days. The top of the clamp; Caelan has not chosen the real number.
export const MAX_AWAY_HOURS = 24 * 7;

// Whole hours from `savedAt` to `now`. A clock set backwards, or a missing or garbled stamp,
// gives 0; a long absence is capped at MAX_AWAY_HOURS.
export function hoursAway(savedAt, now) {
    if (typeof savedAt !== 'number' || typeof now !== 'number') return 0;
    if (!Number.isFinite(savedAt) || !Number.isFinite(now)) return 0;
    const hours = Math.floor((now - savedAt) / MS_PER_HOUR);
    if (!(hours > 0)) return 0;
    return Math.min(hours, MAX_AWAY_HOURS);
}

// Work out the hours away and keep them on the game as `hoursAway`. Returns the number.
export function readAway(game, savedAt, now = Date.now()) {
    game.hoursAway = hoursAway(savedAt, now);
    return game.hoursAway;
}
