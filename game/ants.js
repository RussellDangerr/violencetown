// ants.js — ants that move like a real foraging colony (plans/an1-ant-movement.md).
//
// Pure and deterministic: no DOM, no game imports. The map comes in as a small
// interface, `grid = { width, height, isWalkable(x, y), isCold(x, y) }`, and every
// random choice draws from an injected RNG (game/rng.js). A caller drives it once
// per world turn with `antTurn(ants, world, rng)`, or step by step with `stepAnt`
// and `decay`.
//
//   world = { grid, field, nest: {x, y}, home, foods: [{x, y}] }
//     field — createScentField(width, height): trail and alarm per tile
//     home  — createHomeMap(grid, nest): steps-to-nest per tile
//     foods — tiles an ant can drink from (the caller owns how much is left)

// ── Starting constants (to tune) ────────────────────────────────────────────
export const TRAIL_HALF_LIFE = 35;          // turns for trail to halve
export const ALARM_HALF_LIFE = 1.5;         // turns for alarm to halve
export const SCENT_FLOOR = 0.01;            // below this a scent is zero
export const TRAIL_NOTICE_MIN = 0.1;        // weakest trail an ant follows
export const RANDOM_STEP_CHANCE = 0.2;      // chance a trail follower steps at random
export const BRANCH_EXPONENT = 2;           // score = (threshold + trail) ^ exponent
export const BRANCH_THRESHOLD = 0.2;        // small: a faint trail already sways the choice
export const BACKTRACK_WEIGHT = 0.25;       // share of score for tiles behind the ant
export const WALK_KEEP_CHANCE = 0.6;        // wandering: keep heading
export const WALK_TURN_CHANCE = 0.3;        // wandering: turn 45°; the rest is any direction
export const TRAIL_DEPOSIT_AT_FOOD = 3;     // trail a carrier lays next to the food…
export const TRAIL_DEPOSIT_AT_NEST = 1;     // …falling to this by the nest
export const FOOD_NOTICE_RANGE = 2;         // tiles away an ant notices food
export const ALARM_STRENGTH = 8;            // alarm on a squashed ant's tile
export const ALARM_RADIUS = 3;              // tiles the alarm spreads
export const ALARM_NOTICE_MIN = 0.1;        // weakest alarm an ant reacts to
export const ALARM_TURNS = 3;               // turns an ant stays alarmed after losing the scent
export const RECRUITS_MIN = 1;              // ants a delivery releases from the nest
export const RECRUITS_MAX = 2;

// 8 headings, clockwise from north. A 45° turn is ±1.
export const DIRS = [
    [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];
const wrap8 = d => ((d % 8) + 8) % 8;
const angleGap = (a, b) => { const g = Math.abs(wrap8(a) - wrap8(b)); return Math.min(g, 8 - g); };
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

// ── The scent field ─────────────────────────────────────────────────────────

export function createScentField(width, height) {
    return { width, height, trail: new Float64Array(width * height), alarm: new Float64Array(width * height) };
}

const inField = (f, x, y) => x >= 0 && y >= 0 && x < f.width && y < f.height;
export const trailAt = (f, x, y) => (inField(f, x, y) ? f.trail[y * f.width + x] : 0);
export const alarmAt = (f, x, y) => (inField(f, x, y) ? f.alarm[y * f.width + x] : 0);

// Add trail to one tile.
export function deposit(field, x, y, amount) {
    if (inField(field, x, y)) field.trail[y * field.width + x] += amount;
}

export const decayFactor = halfLife => 0.5 ** (1 / halfLife);

// Fade both scents by one turn; anything under the floor drops to zero.
export function decay(field) {
    const kt = decayFactor(TRAIL_HALF_LIFE), ka = decayFactor(ALARM_HALF_LIFE);
    for (let i = 0; i < field.trail.length; i++) {
        const t = field.trail[i] * kt;
        field.trail[i] = t < SCENT_FLOOR ? 0 : t;
        const a = field.alarm[i] * ka;
        field.alarm[i] = a < SCENT_FLOOR ? 0 : a;
    }
}

// A squashed ant: full alarm on its tile, falling off linearly to the radius.
export function squash(field, x, y) {
    for (let dy = -ALARM_RADIUS; dy <= ALARM_RADIUS; dy++) {
        for (let dx = -ALARM_RADIUS; dx <= ALARM_RADIUS; dx++) {
            const tx = x + dx, ty = y + dy;
            if (!inField(field, tx, ty)) continue;
            const d = Math.max(Math.abs(dx), Math.abs(dy));
            field.alarm[ty * field.width + tx] += ALARM_STRENGTH * (1 - d / (ALARM_RADIUS + 1));
        }
    }
}

// ── Where an ant may stand ──────────────────────────────────────────────────

// Open to an ant: on the grid, walkable, and not cold.
export function antOpen(grid, x, y) {
    return x >= 0 && y >= 0 && x < grid.width && y < grid.height
        && grid.isWalkable(x, y) && !grid.isCold(x, y);
}

// The tiles an ant could step to from (x, y): 8-way, and a diagonal only when
// both orthogonal tiles beside it are open (no cutting a wall corner), the same
// rule every other mover follows.
export function openNeighbours(grid, x, y) {
    const out = [];
    for (let d = 0; d < 8; d++) {
        const [dx, dy] = DIRS[d];
        const nx = x + dx, ny = y + dy;
        if (!antOpen(grid, nx, ny)) continue;
        if (dx && dy && !(antOpen(grid, x + dx, y) && antOpen(grid, x, y + dy))) continue;
        out.push({ x: nx, y: ny, d });
    }
    return out;
}

// Steps to the nest from every tile, by breadth-first search over ant-open
// tiles. Unreachable tiles are Infinity.
export function createHomeMap(grid, nest) {
    const { width, height } = grid;
    const dist = new Float64Array(width * height).fill(Infinity);
    if (!antOpen(grid, nest.x, nest.y)) return { width, height, dist };
    dist[nest.y * width + nest.x] = 0;
    const queue = [[nest.x, nest.y]];
    for (let head = 0; head < queue.length; head++) {
        const [x, y] = queue[head];
        const here = dist[y * width + x];
        for (const n of openNeighbours(grid, x, y)) {
            const i = n.y * width + n.x;
            if (dist[i] !== Infinity) continue;
            dist[i] = here + 1;
            queue.push([n.x, n.y]);
        }
    }
    return { width, height, dist };
}
const homeDist = (home, x, y) =>
    (x >= 0 && y >= 0 && x < home.width && y < home.height ? home.dist[y * home.width + x] : Infinity);

// ── Ants ────────────────────────────────────────────────────────────────────

// A fresh ant. `dir` is its heading (index into DIRS), or null for an ant
// just out of the nest, which faces no particular way.
export function createAnt({ x, y, dir = null } = {}) {
    return {
        x, y, dir,
        px: null, py: null,     // the tile it just left
        carrying: false,
        pickupDist: 0,          // steps home from where it drank
        alarmed: 0,             // turns of alarm left once the scent is lost
        turnSide: 1,            // next 45° turn while wandering; alternates
    };
}

// How many ants a delivery releases from the nest.
export const recruitCount = rng => rng.range(RECRUITS_MIN, RECRUITS_MAX);

function moveTo(ant, n) {
    ant.px = ant.x; ant.py = ant.y;
    ant.dir = n.d;
    ant.x = n.x; ant.y = n.y;
}

// Neighbours minus the tile just left, unless that leaves nothing.
function forwardOptions(ant, opts) {
    const fwd = opts.filter(n => !(n.x === ant.px && n.y === ant.py));
    return fwd.length ? fwd : opts;
}

// Pick among the options with the smallest key; ties by the RNG.
function pickMin(opts, key, rng) {
    let best = Infinity, ties = [];
    for (const n of opts) {
        const k = key(n);
        if (k < best) { best = k; ties = [n]; } else if (k === best) ties.push(n);
    }
    return ties.length ? (ties.length === 1 ? ties[0] : ties[rng.int(ties.length)]) : null;
}

// Weighted pick: probability in proportion to weight.
function pickWeighted(opts, weights, rng) {
    let total = 0;
    for (const w of weights) total += w;
    let r = rng.float() * total;
    for (let i = 0; i < opts.length; i++) {
        r -= weights[i];
        if (r < 0) return opts[i];
    }
    return opts[opts.length - 1];
}

// The curving wander: keep heading, turn 45° (alternating sides), or any heading.
function wander(ant, opts, rng) {
    const r = rng.float();
    const heading = ant.dir ?? rng.int(8);
    let want;
    if (r < WALK_KEEP_CHANCE) want = heading;
    else if (r < WALK_KEEP_CHANCE + WALK_TURN_CHANCE) { want = wrap8(heading + ant.turnSide); ant.turnSide = -ant.turnSide; }
    else want = rng.int(8);
    const n = pickMin(forwardOptions(ant, opts), o => angleGap(o.d, want), rng);
    if (n) moveTo(ant, n);
    return n;
}

// More than 90° off the ant's heading.
const isBehind = (ant, o) => ant.dir != null && angleGap(o.d, ant.dir) > 2;

// How strongly a tile's trail draws an ant.
export const branchScore = (field, { x, y }) => (BRANCH_THRESHOLD + trailAt(field, x, y)) ** BRANCH_EXPONENT;

const hasTrail = (field, opts) => opts.some(o => trailAt(field, o.x, o.y) >= TRAIL_NOTICE_MIN);

// Follow the trail: pick a neighbour in proportion to (threshold + trail)^exponent,
// so a fork goes mostly to the stronger branch. Tiles behind the ant (more than
// 90° off its heading) count for a quarter, so it keeps going the way it was.
// Now and then it takes a uniformly random step instead.
function followTrail(ant, opts, field, rng) {
    if (rng.float() < RANDOM_STEP_CHANCE) {
        const pool = forwardOptions(ant, opts);
        const n = pool[rng.int(pool.length)];
        moveTo(ant, n);
        return n;
    }
    const pool = forwardOptions(ant, opts);
    const weights = pool.map(o => branchScore(field, o) * (isBehind(ant, o) ? BACKTRACK_WEIGHT : 1));
    const n = pickWeighted(pool, weights, rng);
    moveTo(ant, n);
    return n;
}

function nearestFood(ant, foods) {
    let best = null, bd = Infinity;
    for (const f of foods ?? []) {
        const d = cheb(ant.x, ant.y, f.x, f.y);
        if (d < bd) { bd = d; best = f; }
    }
    return best ? { food: best, d: bd } : null;
}

// Trail a carrier lays here: most by the food, least by the nest.
export function trailDeposit(ant, home) {
    const d = homeDist(home, ant.x, ant.y);
    const frac = ant.pickupDist > 0 && Number.isFinite(d) ? Math.min(1, d / ant.pickupDist) : 1;
    return TRAIL_DEPOSIT_AT_NEST + (TRAIL_DEPOSIT_AT_FOOD - TRAIL_DEPOSIT_AT_NEST) * frac;
}

// One turn for one ant. Mutates the ant (and the field, when it lays trail) and
// returns what it did: { action, food? } where action is one of
// 'chilled' | 'alarm' | 'home' | 'delivered' | 'drank' | 'seek' | 'trail' | 'wander' | 'stuck'.
export function stepAnt(ant, world, rng) {
    const { grid, field, nest, home, foods } = world;

    // On a cold tile it cannot move.
    if (grid.isCold(ant.x, ant.y)) return { action: 'chilled' };

    const opts = openNeighbours(grid, ant.x, ant.y);

    // Alarm: sense it on this tile or the next; while sensed, head for the strongest.
    let strongest = alarmAt(field, ant.x, ant.y);
    for (const n of opts) strongest = Math.max(strongest, alarmAt(field, n.x, n.y));
    if (strongest >= ALARM_NOTICE_MIN) {
        ant.alarmed = ALARM_TURNS;
        const here = alarmAt(field, ant.x, ant.y);
        const n = pickMin(opts, o => -alarmAt(field, o.x, o.y), rng);
        if (n && alarmAt(field, n.x, n.y) > here) moveTo(ant, n);
        return { action: 'alarm' };
    }
    if (ant.alarmed > 0) {
        ant.alarmed--;
        return { action: wander(ant, opts, rng) ? 'alarm' : 'stuck' };
    }

    // A carrier walks home, laying trail as it goes. On a trail it follows the
    // trail back, the way ants come home along the road they went out on (it
    // turned round when it drank); with no trail it heads straight for the nest.
    if (ant.carrying) {
        if (ant.x === nest.x && ant.y === nest.y) {
            deposit(field, ant.x, ant.y, TRAIL_DEPOSIT_AT_NEST);
            ant.carrying = false;
            ant.dir = null;
            ant.px = null; ant.py = null;
            return { action: 'delivered' };
        }
        const d = homeDist(home, ant.x, ant.y);
        if (Number.isFinite(d)) {
            deposit(field, ant.x, ant.y, trailDeposit(ant, home));
            if (hasTrail(field, forwardOptions(ant, opts))) {
                followTrail(ant, opts, field, rng);
                return { action: 'home' };
            }
            const closer = opts.filter(o => homeDist(home, o.x, o.y) < d);
            if (closer.length) {
                moveTo(ant, pickMin(closer, o => angleGap(o.d, ant.dir ?? o.d), rng));
                return { action: 'home' };
            }
        }
        return { action: wander(ant, opts, rng) ? 'wander' : 'stuck' };
    }

    // Food within notice range: drink when next to it, else close in.
    const near = nearestFood(ant, foods);
    if (near && near.d <= FOOD_NOTICE_RANGE) {
        if (near.d <= 1) {
            ant.carrying = true;
            ant.pickupDist = homeDist(home, ant.x, ant.y);
            ant.dir = ant.dir == null ? null : wrap8(ant.dir + 4);
            ant.px = null; ant.py = null;
            return { action: 'drank', food: near.food };
        }
        const n = pickMin(opts, o => cheb(o.x, o.y, near.food.x, near.food.y), rng);
        if (n && cheb(n.x, n.y, near.food.x, near.food.y) < near.d) { moveTo(ant, n); return { action: 'seek' }; }
    }

    // Trail ahead: follow it.
    if (hasTrail(field, opts)) {
        followTrail(ant, opts, field, rng);
        return { action: 'trail' };
    }

    return { action: wander(ant, opts, rng) ? 'wander' : 'stuck' };
}

// One world turn: every ant steps in order, then the scents fade. Returns each
// ant's result, in the same order.
export function antTurn(ants, world, rng) {
    const results = ants.map(a => stepAnt(a, world, rng));
    decay(world.field);
    return results;
}

// Convenience for building a world from a grid.
export function createWorld(grid, nest, foods = []) {
    return { grid, nest, foods, field: createScentField(grid.width, grid.height), home: createHomeMap(grid, nest) };
}
