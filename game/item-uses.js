// item-uses.js — "use THIS on THAT".
//
// The game had no such verb. targetVerbs() could only ever produce Examine /
// Talk / Trade / Bribe / Hit / Throw / Take / Open, so every item-on-world
// interaction that existed was a hardcoded bump special-case: the car (tile 19),
// the barricade (tile 23), a container. Nothing else could be tried, which meant
// standing at a wall of sludge holding a bar of soap was a dead end.
//
// The design ruling (Caelan, 2026-09-02) inverts the usual adventure-game
// secret. Normally the GESTURE is hidden — you must somehow guess that this item
// wants to be used on that character. Here the gesture is universal and
// published: you can always try the thing in your hand on the thing in front of
// you. What is hidden is the CONSEQUENCE. The player's instinct to try an item
// somewhere odd is the mechanic; this table is where those payoffs get authored.
//
// So: one row per authored interaction. Adding a secret means adding a row here
// and nothing else — no change to the overlay, the verb list, or main.js.

// Reading order for candidate targets: what you FACE first, then everything
// adjacent. Facing wins so that a deliberate look resolves before a bystander.
const FACE = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// A target is the shape _targetAt() returns: { x, y, npc, item, examinable, container }.
const isSludge = (npc) => !!npc && (npc.sludgy === true
    || /sludge/i.test(String(npc.type || ''))
    || /sludge/i.test(String(npc.name || '')));

export const ITEM_USES = [
    {
        id: 'soap-on-sludge',
        item: 'soap',
        // A bar of lye against a wall made of the exact thing lye dissolves.
        // Deliberately NOT restricted to puzzleWall: if a future sludge creature
        // shows up, soap should work on it too without a code change here.
        match: (t) => isSludge(t.npc),
        label: (t) => `Scrub ${t.npc.name || t.npc.type}`,
        apply: (game, t, ctx) => {
            const e = t.npc.entity;
            // However much sludge there is. Written against the target's own
            // numbers rather than a magic constant so re-tuning the Bloom's HP
            // or armor can never quietly turn a solution into a near-miss.
            const enough = (e.hp ?? 0) + (e.armor ?? 0) + 1;
            game.combatAttack(t.npc, enough, { type: 'clean' });
            game._removeFromSlot(ctx.slot);      // a bar is spent on a wall this size
            game.selectedSlot = -1;
            game._advanceWorld();                 // scrubbing is work; it costs the turn
        },
    },
    {
        id: 'alcohol-in-tank',
        item: 'alcohol',
        // Reachable on TOUCH, which is the point. The pour was bump-only, and the
        // on-screen d-pad is gone (index.html: "tap the world to move"), so this
        // step of the finale could not be performed at all without a keyboard.
        match: (t, game) => !!t.examinable && t.examinable.id === 'car'
            && !!game.questEngine?.getFlag?.('carFixed')
            && game.carFuel !== 'alcohol',
        label: 'Pour it in the tank',
        // _interactCar owns the whole effect — it finds the bottle, spends it,
        // sets carFuel and logs. Calling it keeps ONE spelling of the pour
        // rather than a second one that could drift out of step with the bump.
        apply: (game) => {
            game.selectedSlot = -1;
            game._interactCar();
        },
    },
];

// Every authored use that applies right now, for `itemDef` in the player's hand.
//
// Returns [{ id, label, target, apply }] in reading order. Empty is the normal
// case and is not a failure — most items have nothing to say to most tiles.
export function contextualUses(itemDef, game) {
    if (!itemDef || !game || typeof game._targetAt !== 'function') return [];

    const seen = new Set();
    const targets = [];
    const consider = (x, y) => {
        const key = x + ',' + y;
        if (seen.has(key)) return;
        seen.add(key);
        const t = game._targetAt(x, y);
        if (t) targets.push(t);
    };

    const [fx, fy] = FACE[game.facing] || FACE.down;
    consider(game.playerX + fx, game.playerY + fy);
    for (const [dx, dy] of Object.values(FACE)) consider(game.playerX + dx, game.playerY + dy);

    const out = [];
    for (const t of targets) {
        for (const row of ITEM_USES) {
            if (row.item !== itemDef.id) continue;
            // A row's match() reads live world state and is authored content, so
            // a bad predicate must not be able to take the overlay down with it —
            // a broken secret should just not offer itself.
            let ok = false;
            try { ok = !!row.match(t, game); } catch { ok = false; }
            if (!ok) continue;
            out.push({
                id: row.id,
                label: typeof row.label === 'function' ? row.label(t, game) : row.label,
                target: t,
                apply: row.apply,
            });
        }
    }
    return out;
}
