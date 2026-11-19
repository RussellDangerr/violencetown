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

import { buildXmbBar } from './xmb.js';
import { takeable } from './fight-panels.js';
import { arcOn } from './fight-arc.js';

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
        text: "They'll trade. Walk into them, or press E. The same screen buys, sells, gives and bribes.",
    },
    {
        id: 'blindSpot',
        // Kept from before this table existed. The rear blind spot is the single
        // rule the whole stealth layer rests on, and the kind of rule a player
        // either stumbles into or never learns at all.
        when: (game) => neighbours(game).length > 0 && game.isHidden?.(),
        text: "They haven't seen you. Standing behind someone keeps you out of their sight, which is the best place to thieve from.",
    },
    {
        id: 'thieveHere',
        // The verb the blind-spot line only hints at. Fires on the same footing
        // as the wheel's lit Thieve slices (fight-panels.takeable), so the line
        // never promises a pocket that is empty. Placed after blindSpot so the
        // pacing gap teaches the stance first and the verb a few turns later.
        when: (game) => !!game.isHidden?.()
            && neighbours(game).some(e => Object.values(takeable(e)).some(Boolean)),
        text: 'You are hidden beside someone with something to take. Open the wheel and pick Thieve: Coin, Kit or Gear.',
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
        text: 'Something you are carrying can be used on what is in front of you. Open your bag to see the use.',
    },
    {
        id: 'hotGoods',
        // Only ever seen by a player who has already stolen and been noticed —
        // so it is a payoff, not an instruction, and it names the fence at the
        // exact moment the town starts refusing them.
        when: (game) => Object.values(game._hot || {}).some(n => n > 0),
        text: 'Shops will not buy stolen goods now. Sell them to a fence.',
    },
    {
        id: 'wounded',
        // The first time a fight has actually cost something. Fights run 5-8
        // turns now, so there is a middle in which to reach for a kit — which
        // was the entire point of the fight-length re-role.
        // The bar is only drawn when it has something in it, so the hint waits
        // for the same check the bar's own drawing uses (renderer _drawXmbBar).
        when: (game) => (game.playerHp ?? 100) < (game.playerMaxHp ?? 100) * 0.5
            && buildXmbBar(game.inventory).columns.length > 0,
        text: 'You are below half health. The bar along the bottom lists what you can drink. Shift+Up and Shift+Down pick an item.',
    },
    {
        id: 'ringFashion',
        // The Were-Rat's fur is a ring waiting to be made. Quiet once any ring
        // exists, so it never nags a player who already found Platero.
        when: (game) => (game.ownedRings?.size || 0) === 0
            && (game.inventory || []).some(s => s?.itemDef?.id === 'wererat_fur'),
        text: 'Tuft of Wererat Fur can be made into a ring by Platero, the silversmith in Downtown.',
    },
    {
        id: 'fightArc',
        // The numbered arc under you appears the moment a fight starts, and the
        // number keys fire it. Same test the arc itself draws by (fight-arc arcOn).
        when: (game) => arcOn(game),
        text: 'The numbered arc under you lists your attacks. Press a number key to use that attack.',
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
