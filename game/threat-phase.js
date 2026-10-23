// threat-phase.js — which phase the threat overlay is in, and whose sight
// justifies it.
//
// The overlay used to be always-on, with a watcher filter of "alive, not an
// ally, has eyes". In a stealth corridor that means threat. In the town square
// it meant everyone: measured on 2026-09-06, the opening plaza selected nine
// watchers, of which eight were idle townsfolk and two of those were vendors at
// +18 disposition. One was actually hostile. Half the floor was shaded because
// the shopkeeper could see you.
//
// So attention is a state now, and the overlay expresses it:
//
//   QUIET  nobody is looking, no combat, no theft being aimed  -> draw nothing
//   HAZE   someone is suspicious or searching, or you are      -> safe ground darkens
//          lining up a theft
//   ALARM  someone is chasing, or holds you in a DIRECT cone   -> it inverts;
//          the seen ground goes hot instead
//
// The inversion between HAZE and ALARM is deliberate: opposite polarities make
// the transition read as an event rather than as a colour change.
//
// Pure leaf module — imports nothing, so it is node-testable in isolation the
// way perception.js / pathing.js / rings.js are.

export const PHASE = { QUIET: 'QUIET', HAZE: 'HAZE', ALARM: 'ALARM' };

const HAZE_STATES  = new Set(['suspicious', 'searching']);
const ALARM_STATES = new Set(['chasing']);

// Alive, not on your side, and can actually see. The floor for every phase.
function canSee(w) {
    return !!w && w.entity?.isAlive?.() && !w._ally && (w.sightRange || 0) > 0;
}

// Within reach of a theft at `at` (the player's tile): the theft's spot lies
// inside the watcher's sight range, so its cone can decide whether the theft is
// seen. Distance only (Chebyshev, as perceives() measures); facing and walls are
// the field's job. No `at` keeps every watcher, as before.
function inReach(w, at) {
    if (!at || w.x == null || w.y == null) return true;
    return Math.max(Math.abs(w.x - at.x), Math.abs(w.y - at.y)) <= (w.sightRange || 0);
}

// `opts.spotted` is the caller's perceives() === DIRECT result against the
// player, passed in rather than computed here so this module stays free of map
// and geometry dependencies.
export function threatPhase(watchers, opts = {}) {
    const live = (watchers || []).filter(canSee);

    if (opts.spotted || live.some(w => ALARM_STATES.has(w.state))) return PHASE.ALARM;
    if (live.some(w => HAZE_STATES.has(w.state)))                  return PHASE.HAZE;

    // Aiming a theft brings the field back even in a calm room. This is
    // load-bearing: plans/stealth-perception-and-thieve.md rules that "the room
    // stays legible so a theft is something you can plan", and gating purely on
    // enemy state would take that away. Only watchers within reach of the theft
    // count: if nobody's sight reaches it, there is nothing to plan around.
    if (opts.aimingTheft && live.some(w => inReach(w, opts.at))) return PHASE.HAZE;

    return PHASE.QUIET;
}

// Whose sight the field is built from. Scoping this to the watchers who justify
// the phase is the single change that empties the town square.
export function alertWatchers(watchers, phase, opts = {}) {
    const live = (watchers || []).filter(canSee);
    if (phase === PHASE.QUIET) return [];

    const alert = live.filter(w => HAZE_STATES.has(w.state) || ALARM_STATES.has(w.state));
    // Aiming a theft with nobody alert falls back to every watcher within reach
    // of the theft, not just the mark. "Seen means refused" is checked against
    // all spotters (perception.js spotters()), so a bystander's cone decides
    // whether the verb is even offered; showing only the mark would hide half
    // of what the decision turns on. A watcher whose sight cannot reach the
    // theft's tile can never refuse it, so its cone is left off (ruling V1,
    // 2026-10-03: in the opening town square the fallback had put all nine
    // cones back on screen).
    if (!alert.length && opts.aimingTheft) return live.filter(w => inReach(w, opts.at));
    return alert;
}
