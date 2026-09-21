// player.js — the autoplay's players (plans/quest1-autoplay.md §7). One
// decision per call, from a plain view of the game:
//   1. below the heal threshold, with food: eat
//   2. a hostile beside you (or the quarry): hit it — the quarry first,
//      otherwise the weakest
//   3. otherwise work the current goal: get to its map, then use / kill / take
//      / reach it
// The fighter (ruling Q1-2) does exactly that. The sneak (ruling Q1-8) walks
// the least-seen route and fights only what has already seen it.
// Pure — run.js builds the view from the live game — so every rule is tested
// in node.

import { pathTo, cheapestPath } from './path.js';

export const FIGHTER = { healBelow: 0.4, sneak: false };
export const SNEAK = { healBelow: 0.4, sneak: true };
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
    const quarry = goal && goal.kill;
    const fights = (e) => (quarry && e.tag === quarry) || (e.hostile && (!knobs.sneak || e.aware));
    const beside = view.enemies.filter((e) => cheb(e, view.player) === 1 && fights(e));
    if (beside.length) {
        const t = beside.find((e) => quarry && e.tag === quarry) || beside.reduce((a, b) => (b.hp < a.hp ? b : a));
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
