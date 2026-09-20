// combat-log.js — what the dock's FIGHT face shows in place of the quest log
// (plans/combat-hud.md stage 3). Pure: an array in, an array out, node-testable
// like fight-area.js and perception.js.
//
// A fight's feed is a FILTER, not a second store (ruling H1-3). Every message
// already carries a category — main.js `_log(msg, category)` tags 'combat' on
// every damage, death and miss line, and the renderer already tints those red —
// so a combat log is a view over the history that exists, with one message
// buffer to cap and one [L] modal to keep. A parallel combat feed would be two
// of each, and two things that drift apart.
//
// It reads `_logHistory` (300 deep) rather than the 3-entry `_logStripMessages`
// ring: filtering three mixed messages down to the combat ones usually leaves
// one or none, which is not a log. The history is where the fight actually is.

// The newest `n` combat messages, oldest first so the feed reads downward like
// the quest log's does. Missing or empty history yields [], never a throw — a
// log that explodes mid-draw is worse than a log with nothing in it.
export function combatLines(history, n = 4) {
    if (!Array.isArray(history) || history.length === 0 || n <= 0) return [];
    const out = [];
    for (let i = history.length - 1; i >= 0 && out.length < n; i--) {
        const m = history[i];
        if (m && m.category === 'combat') out.push(m);
    }
    return out.reverse();
}

// The log category a world message should be filed under. npc.js and ai.js
// already tag their reports — a combat report says so — and this is the ONE
// place that answer becomes a log category.
//
// It exists because the answer used to be dropped: _routeWorldMessages branched
// on m.category === 'combat' and then called _log(m.text) without it, so the
// combat log filtered a history in which no fight was ever tagged and came up
// empty in real play. A rule with one home cannot be half-applied.
//
// An unknown category passes THROUGH rather than being flattened to 'system',
// so a category added later reaches the log strip intact and can be styled;
// _logStripColor already falls back for anything it does not recognise.
export function logCategory(m, fallback = 'system') {
    if (m && typeof m === 'object' && typeof m.category === 'string' && m.category) return m.category;
    return fallback;
}
