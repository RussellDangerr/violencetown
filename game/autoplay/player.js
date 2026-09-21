// player.js — the standard fighter (plans/quest1-autoplay.md §7, ruling Q1-2).
// One decision per call, from a plain view of the game:
//   1. below the heal threshold, with food: eat
//   2. a hostile beside you (or the quarry): hit it — the quarry first,
//      otherwise the weakest
//   3. otherwise work the current goal: get to its map, then use / kill / take
//      / reach it
// Pure — run.js builds the view from the live game — so every rule is tested
// in node.

import { pathTo } from './path.js';

export const KNOBS = { healBelow: 0.4 };
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
    const beside = view.enemies.filter((e) => cheb(e, view.player) === 1 && (e.hostile || (quarry && e.tag === quarry)));
    if (beside.length) {
        const t = beside.find((e) => quarry && e.tag === quarry) || beside.reduce((a, b) => (b.hp < a.hp ? b : a));
        return { kind: 'attack', at: { x: t.x, y: t.y }, dir: dirTo(view.player, t) };
    }
    if (!goal) return { kind: 'wait', why: 'every goal of this stage is met, and the quest has not moved on' };

    const where = goal.reach || goal.map;
    if (where && view.mapUrl !== where) {
        return toward(view, view.transitions.filter((t) => t.toMap === where), `the way to ${where}`);
    }
    if (goal.kill) {
        const t = view.enemies.find((e) => e.tag === goal.kill);
        return toward(view, around(t), `the ${goal.kill}`);
    }
    if (goal.take) {
        return toward(view, view.items.filter((i) => i.type === goal.take), goal.take);
    }
    if (goal.use) {
        const stands = standsFor(view, goal.use);
        const here = stands.find((s) => s.x === view.player.x && s.y === view.player.y);
        if (here) return { kind: 'use', dir: here.dir };
        return toward(view, stands, goal.use);
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

// One step along the shortest open path to any of `tiles`. Characters block;
// barricades do not — walking into one is how it breaks.
function toward(view, tiles, what) {
    const occupied = (x, y) => view.enemies.some((e) => e.x === x && e.y === y);
    const isOpen = (x, y) => (view.isWalkable(x, y) || view.tileAt(x, y) === BARRICADE) && !occupied(x, y);
    let best = null;
    for (const t of tiles) {
        const p = pathTo(isOpen, view.player, t);
        if (p && (!best || p.length < best.length)) best = p;
    }
    if (!best) return { kind: 'wait', why: `no way to ${what} from ${view.player.x},${view.player.y}` };
    if (!best.length) return { kind: 'wait', why: `at ${what}, and nothing happened` };
    return { kind: 'step', dir: best[0] };
}
