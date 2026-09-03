// hints.js — the tutorial that is not a tutorial.
//
// The game had onboarding, but not teaching. Three unrelated things: one DOM
// overlay listing seven controls in a single breath on the frame a player is
// least able to absorb them, a quest HUD that says where to GO but never what a
// verb IS, and exactly two one-shot lines. Nothing anywhere revealed that you
// can trade, steal, fence, use an item on the world, or that enemies have a
// blind spot behind them.
//
// So the depth was invisible, which is the one thing a stranger giving this
// ninety seconds would never forgive.
//
// The fix is deliberately NOT a tutorial MODE. No gated opening, no "press W to
// walk", nothing to skip. Each line fires the first time the player is standing
// in the situation it describes — because the situation IS the lesson, and a
// player already in position only needs the thing they are doing named.
//
// Same shape as item-uses.js on purpose: one table, one row per lesson, and
// adding a lesson means adding a row. `when` reads live state and is authored
// content, so a throwing predicate is caught and simply does not fire — a
// broken hint must never take a turn down with it.

const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

// Living, not-yours, close enough to touch.
function neighbours(game) {
    return (game.enemies || []).filter(e =>
        e.entity?.isAlive?.() && !e._ally &&
        cheb(e.x, e.y, game.playerX, game.playerY) === 1);
}

// Ordered: the first matching UNSEEN hint fires, and only one per beat. A player
// who walks into a crowded market should get one sentence, not five.
export const HINTS = [
    {
        id: 'vendorNearby',
        // The economy is the deepest system in the game and the least visible —
        // a mood face over someone's head means nothing until you know it prices
        // things. This is the only hint that fires in the opening square.
        when: (game) => neighbours(game).some(e => e.vendor),
        text: "[They'll trade. Walk into them, or press E — the same screen buys, sells, gives and bribes.]",
    },
    {
        id: 'blindSpot',
        // Kept from before this table existed. The rear blind spot is the single
        // rule the whole stealth layer rests on, and the kind of rule a player
        // either stumbles into or never learns at all.
        when: (game) => neighbours(game).length > 0 && game.isHidden?.(),
        text: "[They haven't seen you. People don't look behind themselves — and a pocket is easiest to pick from back here.]",
    },
    {
        id: 'contextualUse',
        // The universal affordance nothing announced. Fires the moment something
        // in the bag would actually DO something here, so the lesson arrives
        // attached to a real opportunity rather than as a rule to remember.
        when: (game) => {
            const stack = game.inventory?.[game.selectedSlot];
            if (!stack) {
                return (game.inventory || []).some(s =>
                    s && (game._contextualUsesFor?.(s.itemDef) || []).length);
            }
            return (game._contextualUsesFor?.(stack.itemDef) || []).length > 0;
        },
        text: '[Something you are carrying works on what is in front of you. Open it and look.]',
    },
    {
        id: 'hotGoods',
        // Only ever seen by a player who has already stolen and been noticed —
        // so it is a payoff, not an instruction, and it names the fence at the
        // exact moment the town starts refusing them.
        when: (game) => Object.values(game._hot || {}).some(n => n > 0),
        text: '[Word got around about that. Honest shops will not touch it now — find someone who deals in things with a history.]',
    },
    {
        id: 'wounded',
        // The first time a fight has actually cost something. Fights run 5-8
        // turns now, so there is a middle in which to reach for a kit — which
        // was the entire point of the fight-length re-role.
        when: (game) => (game.playerHp ?? 100) < (game.playerMaxHp ?? 100) * 0.5,
        text: '[You are hurt. The bar along the bottom is live — Shift+↑↓ picks something to drink.]',
    },
];

// The first unseen hint whose situation is true right now, or null.
//
// `seen` is asked of the caller rather than read here, so this file never
// touches Settings and stays testable with a plain Set.
export function nextHint(game, seen) {
    if (!game) return null;
    for (const h of HINTS) {
        if (seen && seen(h.id)) continue;
        let on = false;
        try { on = !!h.when(game); } catch { on = false; }
        if (on) return h;
    }
    return null;
}
