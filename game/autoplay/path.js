// path.js — how the autoplay gets from here to there. A 4-way breadth-first
// search, because the player moves by key taps and a diagonal step needs two
// keys held at once. Pure: the caller says which tiles are open.

export const DIR_CODES = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const STEPS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];

// The directions to walk from `from` to `to`: [] when already there, null when
// no route exists. `isOpen(x, y)` decides every tile except `from`.
export function pathTo(isOpen, from, to, { maxNodes = 20000 } = {}) {
    if (from.x === to.x && from.y === to.y) return [];
    const key = (x, y) => `${x},${y}`;
    const prev = new Map([[key(from.x, from.y), null]]);
    const queue = [from];
    for (let head = 0; head < queue.length && head < maxNodes; head++) {
        const cur = queue[head];
        for (const [dir, dx, dy] of STEPS) {
            const x = cur.x + dx, y = cur.y + dy, k = key(x, y);
            if (prev.has(k) || !isOpen(x, y)) continue;
            prev.set(k, { from: cur, dir });
            if (x === to.x && y === to.y) {
                const dirs = [];
                for (let s = prev.get(k); s; s = prev.get(key(s.from.x, s.from.y))) dirs.push(s.dir);
                return dirs.reverse();
            }
            queue.push({ x, y });
        }
    }
    return null;
}

// The cheapest 4-way route when tiles cost different amounts — the sneak's
// path, where a tile in someone's sight costs many steps. `costAt(x, y)` is a
// tile's price, Infinity for closed. Returns { dirs, tiles, cost } (tiles
// exclude `from`) or null. Equal costs keep BFS order: up, down, left, right.
export function cheapestPath(costAt, from, to, { maxNodes = 20000 } = {}) {
    if (from.x === to.x && from.y === to.y) return { dirs: [], tiles: [], cost: 0 };
    const key = (x, y) => `${x},${y}`;
    const best = new Map([[key(from.x, from.y), 0]]);
    const prev = new Map([[key(from.x, from.y), null]]);
    const done = new Set();
    const queue = [{ x: from.x, y: from.y, cost: 0 }];
    for (let popped = 0; queue.length && popped < maxNodes; popped++) {
        const cur = queue.shift();
        const ck = key(cur.x, cur.y);
        if (done.has(ck)) continue;
        done.add(ck);
        if (cur.x === to.x && cur.y === to.y) {
            const dirs = [], tiles = [];
            for (let s = prev.get(ck), at = cur; s; at = s.from, s = prev.get(key(s.from.x, s.from.y))) {
                dirs.push(s.dir);
                tiles.push({ x: at.x, y: at.y });
            }
            return { dirs: dirs.reverse(), tiles: tiles.reverse(), cost: cur.cost };
        }
        for (const [dir, dx, dy] of STEPS) {
            const x = cur.x + dx, y = cur.y + dy, k = key(x, y);
            if (done.has(k)) continue;
            const c = cur.cost + costAt(x, y);
            if (!(c < Infinity) || (best.has(k) && best.get(k) <= c)) continue;
            best.set(k, c);
            prev.set(k, { from: { x: cur.x, y: cur.y }, dir });
            let i = queue.length;
            while (i > 0 && queue[i - 1].cost > c) i--;   // equal costs stay first-in, first-out
            queue.splice(i, 0, { x, y, cost: c });
        }
    }
    return null;
}
