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
// The swarm (plans/an2-ant-swarm-sweet-food.md).
export const ANT_HP = 1;                    // ANR3: one hit squashes it
export const ANT_BITE = 1;                  // ANR3: a 1-damage bite
export const SWARM_SIZE = 3;                // placeholder: ants a swarm sends at first
export const REINFORCE_CHANCE = 0.5;        // placeholder: chance a squash sends RECRUITS_MIN..MAX more
export const BRUSH_LANDING = 2;             // placeholder: tiles from the player a brushed ant lands
export const COLD_TILE_MIN = 70;            // the frozen tiles in data.js (SNOW 70, ICE 71)…
export const COLD_TILE_MAX = 79;            // …and the rest of their band

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

// ── The swarm (plans/an2-ant-swarm-sweet-food.md) ───────────────────────────
//
// While the player carries sweet food on a warm tile, ants walk in from the
// map's edge and come for it. Still pure: the caller hands in its live ants
// (any objects with x, y — the game passes its Enemy objects) and an `env`
// that owns everything outside this file:
//
//   env = {
//     grid,                    // the static map: { width, height, isWalkable, isCold }
//     player: { x, y },
//     sweet,                   // true while sweet food is in the bag
//     entries: [{ x, y }],     // the map's doors; the open edge is added here
//     isFree(x, y),            // nothing standing there (player, creature, container)
//     spawn(x, y) -> ant,      // make a new ant there and return it
//     move(ant, x, y),         // move an ant (the caller animates it)
//     bite(ant),               // one bite on the player
//     remove(ant),             // the ant leaves the map
//   }
//
// Per-ant state rides on the ant under underscore names: _antBrain (AN1's
// ant), _latched with its _latchDx/_latchDy offset, _brushed, _leaving.

export const ANT_TYPE = 'Ant';
export const ANT_TAG = 'ant';
// Nothing in the item table marks food as sweet yet, so this is the list.
export const SWEET_FOODS = new Set(['tigers_blood_ice_cone']);
// The swarm's numbers sit with the others at the top of the file.

export const isAnt = e => !!e && e.tag === ANT_TAG;
export const isColdTile = id => typeof id === 'number' && id >= COLD_TILE_MIN && id <= COLD_TILE_MAX;

// Is there sweet food in the bag? Slots are { itemDef } or empty.
export function carriesSweet(inventory) {
    return (inventory || []).some(s => s && s.itemDef && SWEET_FOODS.has(s.itemDef.id));
}

// Where ants walk in: every ant-open tile on the map's outer edge, then the
// caller's extra tiles (doors), without repeats, in that order.
export function entryTiles(grid, extra = []) {
    const out = [], seen = new Set();
    const add = (x, y) => {
        const k = y * grid.width + x;
        if (seen.has(k) || !antOpen(grid, x, y)) return;
        seen.add(k);
        out.push({ x, y });
    };
    for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
            if (x === 0 || y === 0 || x === grid.width - 1 || y === grid.height - 1) add(x, y);
        }
    }
    for (const t of extra) add(t.x, t.y);
    return out;
}

// The entry tile `from` reaches in the fewest ant steps (from's own tile
// counts as open, so it can be the player's). Ties go to the earlier entry.
export function pickNest(grid, entries, from) {
    if (!entries.length) return null;
    const { width, height } = grid;
    const dist = new Float64Array(width * height).fill(Infinity);
    dist[from.y * width + from.x] = 0;
    const queue = [[from.x, from.y]];
    for (let head = 0; head < queue.length; head++) {
        const [x, y] = queue[head];
        for (const n of openNeighbours(grid, x, y)) {
            const i = n.y * width + n.x;
            if (dist[i] !== Infinity) continue;
            dist[i] = dist[y * width + x] + 1;
            queue.push([n.x, n.y]);
        }
    }
    let best = null, bd = Infinity;
    for (const e of entries) {
        const d = dist[e.y * width + e.x];
        if (d < bd) { bd = d; best = e; }
    }
    return best ? { x: best.x, y: best.y } : null;
}

// The trail a scout lays walking home from `from` (the food) to the nest by
// the shortest route: AN1's carrier deposit, most by the food, least by the
// nest. A swarm starts with it, as if a scout had already found the food.
// Returns the steps it took.
export function layScoutTrail(world, from, rng) {
    const { home, field, nest } = world;
    const start = homeDist(home, from.x, from.y);
    if (!Number.isFinite(start)) return 0;
    const scout = createAnt({ x: from.x, y: from.y });
    scout.carrying = true;
    scout.pickupDist = start;
    let steps = 0;
    while (!(scout.x === nest.x && scout.y === nest.y) && steps <= start) {
        deposit(field, scout.x, scout.y, trailDeposit(scout, home));
        const d = homeDist(home, scout.x, scout.y);
        const next = pickMin(openNeighbours(world.grid, scout.x, scout.y).filter(o => homeDist(home, o.x, o.y) < d),
            o => homeDist(home, o.x, o.y), rng);
        if (!next) break;
        moveTo(scout, next);
        steps++;
    }
    deposit(field, nest.x, nest.y, TRAIL_DEPOSIT_AT_NEST);
    return steps;
}

// A swarm: AN1's world around one nest, on or off, and how many ants are
// still to walk in.
export function createSwarm(grid, nest) {
    return { world: createWorld(grid, nest), active: false, toCome: 0 };
}

// A squashed ant: AN1's alarm on its tile and around it, and while the swarm
// is on, now and then one or two more ants to walk in. Returns how many.
export function squashAnt(swarm, x, y, rng) {
    if (!swarm) return 0;
    squash(swarm.world.field, x, y);
    if (!swarm.active || rng.float() >= REINFORCE_CHANCE) return 0;
    const n = recruitCount(rng);
    swarm.toCome += n;
    return n;
}

const nextTo = (a, p) => cheb(a.x, a.y, p.x, p.y) === 1;

// The grid an ant steps on this turn: the map, less every occupied tile.
const liveGrid = env => ({
    width: env.grid.width, height: env.grid.height,
    isWalkable: (x, y) => env.grid.isWalkable(x, y) && env.isFree(x, y),
    isCold: (x, y) => env.grid.isCold(x, y),
});

// Brush every latched ant off (the turn is the caller's to spend). Each lands
// BRUSH_LANDING tiles from the player, on its own side if it can, else on any
// open free tile at that distance, else where it is; and it does not bite on
// the turn it was brushed. Returns the ants brushed.
export function brushOff(ants, env) {
    const p = env.player, grid = liveGrid(env);
    const brushed = [];
    for (const a of ants) {
        if (!a._latched) continue;
        a._latched = false;
        a._brushed = 1;
        brushed.push(a);
        const want = { x: p.x + Math.sign(a.x - p.x) * BRUSH_LANDING, y: p.y + Math.sign(a.y - p.y) * BRUSH_LANDING };
        let land = antOpen(grid, want.x, want.y) ? want : null;
        for (let dy = -BRUSH_LANDING; !land && dy <= BRUSH_LANDING; dy++) {
            for (let dx = -BRUSH_LANDING; !land && dx <= BRUSH_LANDING; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== BRUSH_LANDING) continue;
                if (antOpen(grid, p.x + dx, p.y + dy)) land = { x: p.x + dx, y: p.y + dy };
            }
        }
        if (land) env.move(a, land.x, land.y);
        if (a._antBrain) { a._antBrain.px = null; a._antBrain.py = null; }
    }
    return brushed;
}

// Keep a latched ant beside the player: its old side if open, else the first
// open free tile around them. False when there is none (it falls off).
function holdOn(a, env, grid) {
    const p = env.player;
    for (const [dx, dy] of [[a._latchDx, a._latchDy], ...DIRS]) {
        const x = p.x + dx, y = p.y + dy;
        if (x === a.x && y === a.y) { a._latchDx = dx; a._latchDy = dy; return true; }
        if (!antOpen(grid, x, y)) continue;
        env.move(a, x, y);
        a._latchDx = dx; a._latchDy = dy;
        return true;
    }
    return false;
}

// A leaving ant heads for the nest by the shortest open route and leaves the
// map there.
function walkOut(a, swarm, env, grid, rng) {
    const { nest, home } = swarm.world;
    if (a.x === nest.x && a.y === nest.y) { env.remove(a); return 'left'; }
    const d = homeDist(home, a.x, a.y);
    const n = pickMin(openNeighbours(grid, a.x, a.y).filter(o => homeDist(home, o.x, o.y) < d),
        o => homeDist(home, o.x, o.y), rng);
    if (n) env.move(a, n.x, n.y);
    return 'leaving';
}

// One world turn of the swarm. Returns { swarm, results }: the swarm to keep
// (made here when one is needed) and what each ant did, in order — 'bite' |
// 'latch' | 'dazed' | 'fell' | 'leaving' | 'left' | one of stepAnt's actions.
// With no sweet food and no ant it does nothing and draws nothing from the RNG.
export function swarmTurn(swarm, ants, env, rng) {
    const p = env.player;
    const on = !!env.sweet && !env.grid.isCold(p.x, p.y);
    if (!on && !ants.length) {
        if (swarm) { swarm.active = false; swarm.toCome = 0; }
        return { swarm, results: [] };
    }

    // A swarm needs a nest to walk in from, and out to.
    if (!swarm) {
        const nest = pickNest(env.grid, entryTiles(env.grid, env.entries || []), p);
        if (!nest) {
            for (const a of ants) env.remove(a);
            return { swarm: null, results: ants.map(() => 'left') };
        }
        swarm = createSwarm(env.grid, nest);
    }
    const { world } = swarm;

    // Switching on: the scout's trail, and the ants still to come.
    if (on && !swarm.active) {
        swarm.active = true;
        swarm.toCome = Math.max(0, SWARM_SIZE - ants.length);
        for (const a of ants) a._leaving = false;
        layScoutTrail(world, p, rng);
    }
    // Switching off: every ant lets go and walks out.
    if (!on && swarm.active) {
        swarm.active = false;
        swarm.toCome = 0;
    }
    if (!swarm.active) for (const a of ants) { a._latched = false; a._leaving = true; }

    // The sweet food drips: the player's tile smells like the food end of a trail.
    if (swarm.active) deposit(world.field, p.x, p.y, TRAIL_DEPOSIT_AT_FOOD);

    const grid = liveGrid(env);
    const results = [];
    for (const a of ants) {
        const brain = a._antBrain || (a._antBrain = createAnt({ x: a.x, y: a.y }));
        brain.x = a.x; brain.y = a.y;
        brain.carrying = false;

        if (a._leaving) { results.push(walkOut(a, swarm, env, grid, rng)); continue; }

        // Brushed off this turn: it lies where it landed.
        if (a._brushed > 0) { a._brushed--; results.push('dazed'); continue; }

        if (a._latched) {
            if (!holdOn(a, env, grid)) { a._latched = false; results.push('fell'); continue; }
            env.bite(a);
            results.push('bite');
            continue;
        }
        if (nextTo(a, p)) {
            a._latched = true;
            a._latchDx = a.x - p.x; a._latchDy = a.y - p.y;
            env.bite(a);
            results.push('latch');
            continue;
        }

        // AN1's rules, with the player as the food.
        const r = stepAnt(brain, { ...world, grid, foods: [p] }, rng);
        brain.carrying = false;
        if (brain.x !== a.x || brain.y !== a.y) env.move(a, brain.x, brain.y);
        results.push(r.action);
    }

    // Arrivals: one ant a turn walks in at the nest while any are still to come.
    if (swarm.active && swarm.toCome > 0 && env.isFree(world.nest.x, world.nest.y)) {
        const a = env.spawn(world.nest.x, world.nest.y);
        if (a) { a._antBrain = createAnt({ x: a.x, y: a.y }); swarm.toCome--; }
    }

    decay(world.field);
    return { swarm, results };
}
