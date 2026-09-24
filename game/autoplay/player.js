// player.js — the autoplay's players (plans/quest1-autoplay.md §7). One
// decision per call, from a plain view of the game:
//   1. below the heal threshold, with food: eat
//   2. something to fight within reach: spend what you carry on it (ruling
//      Q1-10) — drink, then a spell while the MP lasts, then a throw, then the
//      sword. The quarry first, otherwise the weakest
//   3. otherwise work the current goal: get to its map, then use / kill / take
//      / reach it
// The fighter (ruling Q1-2) does exactly that. The sneak (ruling Q1-8) walks
// the least-seen route and fights only what has already seen it.
// Pure — run.js builds the view from the live game — so every rule is tested
// in node.

import { pathTo, cheapestPath } from './path.js';

// `spells` is the order a player reaches for its spells: the first one known,
// affordable and in range is cast. Fireball first — 20 through a 3x3 burst for
// 12 MP beats Cone of Cold's 14 for 10 against armour (plans/quest1-autoplay.md
// Q1-10). An empty list is a player who only swings.
const ARSENAL = ['fireball', 'coneofcold'];
export const FIGHTER = { healBelow: 0.4, sneak: false, spells: ARSENAL, items: true };
export const SNEAK = { healBelow: 0.4, sneak: true, spells: ARSENAL, items: true };
export const KNOBS = FIGHTER;

// What a tile costs the sneak, in steps. `seenAt` is the worst verdict any
// hostile holds on a tile (perception.js): DIRECT is its cone, PERIPHERAL its
// flank, NONE behind it. A sightline is worth a 40-step detour; a flank glance
// — two in a row turn them — is worth 4. All-or-nothing routes do not work:
// the tiles beside a boss are always in someone's sight, so "only unseen
// tiles" never arrives and falls back to walking straight in.
const SIGHT_COST = { NONE: 1, PERIPHERAL: 4, DIRECT: 40 };
const EXPOSURE = { NONE: 'unseen', PERIPHERAL: 'glimpsed', DIRECT: 'seen' };
const RANK = { NONE: 0, PERIPHERAL: 1, DIRECT: 2 };
export const BARRICADE = 23;   // sewer-setpiece.js: two bumps and it is floor

const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const dirTo = (from, to) =>
    Object.keys(STEP).find((d) => from.x + STEP[d][0] === to.x && from.y + STEP[d][1] === to.y) || null;
const around = (p) => Object.entries(STEP).map(([dir, [dx, dy]]) => ({ x: p.x + dx, y: p.y + dy, dir }));

export function goalDone(view, goal) {
    if (goal.kill) return view.mapUrl === goal.map && !view.enemies.some((e) => e.tag === goal.kill);
    if (goal.take) return view.inventory.includes(goal.take);
    if (goal.reach) return view.mapUrl === goal.reach;
    return false;   // `use` ends when the quest engine moves on
}

export const currentGoal = (view, goals) => goals.find((g) => !goalDone(view, g)) || null;

export function decide(view, goals, knobs = KNOBS) {
    if (view.hp < knobs.healBelow * view.maxHp && view.canEat) return { kind: 'eat' };

    const goal = currentGoal(view, goals);
    // The quarry is what the goal is about: the enemy to kill, or a hostile
    // standing on the item to take — the drop lands under whoever is there,
    // and an enemy that walks onto it blocks the path as surely as a wall
    // (measured, seed 3: the Fungus King stood on the converter and the
    // fighter waited sixty turns beside nothing).
    const onTake = (e) => goal && goal.take && e.hostile
        && view.items.some((i) => i.type === goal.take && i.x === e.x && i.y === e.y);
    const quarry = (e) => !!goal && ((goal.kill && e.tag === goal.kill) || onTake(e));
    const fights = (e) => quarry(e) || (e.hostile && (!knobs.sneak || e.aware));
    const beside = view.enemies.filter((e) => cheb(e, view.player) === 1 && fights(e));
    const spent = spend(view, fights, quarry, knobs);
    if (spent) return spent;
    if (beside.length) {
        const t = pick(beside, quarry);
        return { kind: 'attack', at: { x: t.x, y: t.y }, dir: dirTo(view.player, t) };
    }
    if (!goal) return { kind: 'wait', why: 'every goal of this stage is met, and the quest has not moved on' };

    const where = goal.reach || goal.map;
    if (where && view.mapUrl !== where) {
        return toward(view, view.transitions.filter((t) => t.toMap === where), `the way to ${where}`, knobs);
    }
    if (goal.kill) {
        const t = view.enemies.find((e) => e.tag === goal.kill);
        return toward(view, around(t), `the ${goal.kill}`, knobs);
    }
    if (goal.take) {
        const blocker = view.enemies.find(onTake);
        if (blocker) return toward(view, around(blocker), `the ${goal.take}, past what stands on it`, knobs);
        return toward(view, view.items.filter((i) => i.type === goal.take), goal.take, knobs);
    }
    if (goal.use) {
        const stands = standsFor(view, goal.use);
        const here = stands.find((s) => s.x === view.player.x && s.y === view.player.y);
        if (here) return { kind: 'use', dir: here.dir };
        return toward(view, stands, goal.use, knobs);
    }
    return { kind: 'wait', why: `a goal this player does not know: ${JSON.stringify(goal)}` };
}

const pick = (enemies, quarry) =>
    enemies.find(quarry) || enemies.reduce((a, b) => (b.hp < a.hp ? b : a));

// Ruling Q1-10: burn the MP, use every item. What is worth spending on: the
// quarry, anything hunting you, and anything beside you that this player
// fights. The sneak spends on the quarry only once it is beside it or has
// been seen — a fireball from the dark gives the approach away.
function spend(view, fights, quarry, knobs) {
    const d = (e) => cheb(e, view.player);
    const worth = view.enemies.filter((e) => fights(e) && (d(e) === 1 || e.aware || (quarry(e) && !knobs.sneak)));
    if (!worth.length) return null;
    // In range, and somewhere the reticle can actually be walked to — a wall
    // between can cut a tile in range off from where it starts (measured,
    // seed 2: "no way to aim at 8,4").
    const within = (range, what) => worth.filter((e) => d(e) <= range && (!view.canAim || view.canAim(what, e)));

    if (knobs.items && view.canDrink) return { kind: 'drink' };
    for (const key of knobs.spells || []) {
        const sp = (view.spells || []).find((s) => s.key === key);
        if (!sp || (view.mp ?? 0) < sp.cost) continue;
        const inReach = within(sp.range, key).filter((e) => catches(sp, view.player, e));
        if (inReach.length) { const t = pick(inReach, quarry); return { kind: 'cast', spell: key, at: { x: t.x, y: t.y } }; }
    }
    if (knobs.items && view.throwRange) {
        const inReach = within(view.throwRange, 'throw');
        if (inReach.length) { const t = pick(inReach, quarry); return { kind: 'throw', at: { x: t.x, y: t.y } }; }
    }
    return null;
}

// Does a spell aimed at `t` hit it? A burst centres on its reticle, so always.
// A cone is cardinalised to the dominant axis and widens one tile a side per
// step (wheel-model coneTiles), so an exact diagonal falls just outside it —
// measured: two Cones of Cold fizzled on diagonals before this.
function catches(sp, p, t) {
    if (sp.shape !== 'cone') return true;
    const a = Math.abs(t.x - p.x), b = Math.abs(t.y - p.y);
    return Math.min(a, b) < Math.max(a, b);
}

// Open tiles with a side neighbour that is `id` — where E reaches it.
function standsFor(view, id) {
    const out = [];
    for (let y = 0; y < view.height; y++) {
        for (let x = 0; x < view.width; x++) {
            if (!view.isWalkable(x, y)) continue;
            for (const n of around({ x, y })) {
                if (view.targetIdAt(n.x, n.y) === id) out.push({ x, y, dir: n.dir });
            }
        }
    }
    return out;
}

// One step toward the nearest of `tiles`. Characters and chests block —
// walking into either starts a verb, not a step. Barricades do not — walking
// into one is how it breaks. The fighter takes the shortest path; the sneak
// the least-seen one, and its step says the worst sight on the way
// (`exposure`).
function toward(view, tiles, what, knobs = KNOBS) {
    const occupied = (x, y) => view.enemies.some((e) => e.x === x && e.y === y)
        || (view.containers || []).some((c) => c.x === x && c.y === y);
    const passable = (x, y) => (view.isWalkable(x, y) || view.tileAt(x, y) === BARRICADE) && !occupied(x, y);
    const nowhere = { kind: 'wait', why: `no way to ${what} from ${view.player.x},${view.player.y}` };
    const arrived = { kind: 'wait', why: `at ${what}, and nothing happened` };

    if (!knobs.sneak) {
        let best = null;
        for (const t of tiles) {
            const p = pathTo(passable, view.player, t);
            if (p && (!best || p.length < best.length)) best = p;
        }
        if (!best) return nowhere;
        return best.length ? { kind: 'step', dir: best[0] } : arrived;
    }

    const seen = (x, y) => (view.seenAt ? view.seenAt(x, y) : 'NONE');
    const costAt = (x, y) => (passable(x, y) ? SIGHT_COST[seen(x, y)] ?? 1 : Infinity);
    let best = null;
    for (const t of tiles) {
        const p = cheapestPath(costAt, view.player, t);
        if (p && (!best || p.cost < best.cost)) best = p;
    }
    if (!best) return nowhere;
    if (!best.dirs.length) return arrived;
    const worst = best.tiles.reduce((w, t) => (RANK[seen(t.x, t.y)] > RANK[w] ? seen(t.x, t.y) : w), 'NONE');
    return { kind: 'step', dir: best.dirs[0], exposure: EXPOSURE[worst] };
}
