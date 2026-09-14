// fight-area.js — who is in a fight, and what they can see (plans/fight-fog.md §1).
//
// A fight's area is every tile at least one fighter perceives: the same
// perceives() the chase AI and the threat overlay ask, so standing outside it
// genuinely means none of them can see you there. The renderer draws the fog
// from it; F3 (who gets pulled into a fight) will read it too.
//
// Pure: game data in, numbers out. Node-testable like perception.js.

import { isHunting } from './ai.js';

// How many tiles past the view's edge the area reaches, so the fog's blur and
// a step's scroll never show where it stops.
export const FIGHT_MARGIN = 3;

// The enemies in the fight: the ones isCombatActive counts (alive, not
// ambient, hunting you), less allies and anyone without eyes — the threat
// overlay's watcher filter. A fight is on while this is non-empty.
export function fighters(enemies) {
    return (enemies || []).filter(e =>
        !!e && !e.ambient && !e._ally && isHunting(e)
        && !!e.entity?.isAlive?.() && (e.sightRange || 0) > 0);
}
