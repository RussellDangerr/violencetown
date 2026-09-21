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
