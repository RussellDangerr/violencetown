// puddles.js — a thrown Sludge Brain leaves a puddle (plans/poisons.md). Pure.
//
// A puddle is zone state, not a map edit: `game._puddles` holds
// { x, y, kind, turnsLeft } and is cleared when you leave the zone. Each
// committed action dries every puddle by one; whoever stands in one when the
// action ends gets its kind's effect (sludge: the Sludge DoT, a heal for the
// things that live in the sewer).

export const PUDDLE_TURNS = 8;

// The tiles a puddle covers: where it landed, plus the two forward diagonals of
// the throw — a small fan opening away from the thrower. The throw's direction
// is the sign of (landing - thrower) on each axis. A straight throw's diagonals
// are its two 45-degree turns (east -> north-east and south-east); a diagonal
// throw's are its two cardinal halves (south-east -> east and south). A throw
// that lands on the thrower has no direction and covers just that tile.
// `isOpen(x, y)` drops walls and anything off the map.
export function puddleTiles(from, at, isOpen = () => true) {
    const sx = Math.sign(at.x - from.x), sy = Math.sign(at.y - from.y);
    let wings;
    if (sx === 0 && sy === 0) wings = [];
    else if (sx === 0) wings = [[-1, sy], [1, sy]];
    else if (sy === 0) wings = [[sx, -1], [sx, 1]];
    else wings = [[sx, 0], [0, sy]];
    return [[0, 0], ...wings]
        .map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy }))
        .filter(t => isOpen(t.x, t.y));
}

// Lay (or refresh) a puddle on each tile. A tile already wet with the same
// kind is topped back up rather than doubled.
export function layPuddle(list, tiles, kind, turns = PUDDLE_TURNS) {
    for (const t of tiles) {
        const p = list.find(q => q.x === t.x && q.y === t.y && q.kind === kind);
        if (p) p.turnsLeft = Math.max(p.turnsLeft, turns);
        else list.push({ x: t.x, y: t.y, kind, turnsLeft: turns });
    }
    return list;
}

export function puddleAt(list, x, y) {
    return (list || []).find(p => p.x === x && p.y === y) || null;
}

// One action passes: every puddle dries by one, and the dry ones are gone.
export function dryPuddles(list) {
    for (const p of list) p.turnsLeft--;
    return list.filter(p => p.turnsLeft > 0);
}
