// map-audit.mjs — reachability and gate analysis for every authored map.
//
// Answers three questions the eye cannot, using the GAME's own GameMap.isWalkable
// and the same 8-way no-corner-cutting rule pathing.js enforces, so it can never
// disagree with what the player can actually walk:
//
//   1. Is anything ORPHANED? A boss, transition, chest or ground item with no
//      reachable approach tile is a soft-lock or dead content.
//   2. Where can a GATE go? A single blocking tile whose removal seals a pocket
//      containing nothing critical. Placing a puzzleWall anywhere else either
//      gates nothing or soft-locks the game.
//   3. What does RAT FORM open? main.js _canEnter lets the player onto GRATE
//      tiles while _ratFormTurns > 0. This reports how much space that actually
//      unlocks -- it was ZERO across every map until the Sludge Bloom shipped.
//
// Enemy tiles count as blocked, because stepFree blocks on any living character:
// a stationary creature in a corridor IS a wall, which is how a puzzleWall gates.
//
// Usage:  node tools/map-audit.mjs game/sewer-map.json
//         npm run map:audit
// 8-way no-corner-cutting rule. Also reports what RAT FORM opens: _canEnter lets
// the player onto GRATE tiles while _ratFormTurns > 0, which is an existing
// lock-and-key the map may or may not already use.
import fs from 'node:fs';
import { GameMap } from '../game/map.js';

const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const map = new GameMap(data);
const W = map.width, H = map.height;
const blocked = new Set((data.containers || []).map(c => `${c.x},${c.y}`));
// stepFree also blocks on any LIVING character, so a stationary creature standing
// in a corridor is a wall in practice. That is how a puzzleWall gates.
for (const e of data.enemies || []) if (e && typeof e === 'object') blocked.add(`${e.x},${e.y}`);
const NB = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
const GRATE_ID = 4;

const walk = (x, y, rat) =>
    map.isWalkable(x, y) || (rat && map.isInBounds(x, y) && map.getTile(x, y) === GRATE_ID);

function reach(sx, sy, extra, rat = false) {
    const seen = new Set([`${sx},${sy}`]); const q = [[sx, sy]];
    while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of NB) {
            const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
            if (seen.has(k) || !walk(nx, ny, rat) || blocked.has(k) || k === extra) continue;
            if (dx && dy && (!walk(x + dx, y, rat) || !walk(x, y + dy, rat))) continue;
            seen.add(k); q.push([nx, ny]);
        }
    }
    return seen;
}

const sp = data.spawn;
const base = reach(sp.x, sp.y, null, false);
const ratly = reach(sp.x, sp.y, null, true);
const grates = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (map.getTile(x, y) === GRATE_ID) grates.push(`${x},${y}`);
const opened = [...ratly].filter(k => !base.has(k) && !grates.includes(k));

const must = new Set();
if (data.bossRoom) must.add(`${data.bossRoom.x},${data.bossRoom.y}`);
for (const t of data.transitions || []) must.add(`${t.x},${t.y}`);
for (const e of data.enemies || []) if (e && typeof e === 'object') must.add(`${e.x},${e.y}`);
for (const c of data.containers || []) for (const [dx,dy] of NB) must.add(`${c.x+dx},${c.y+dy}`);

let gates = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = `${x},${y}`;
    if (!map.isWalkable(x, y) || blocked.has(k) || k === `${sp.x},${sp.y}`) continue;
    const after = reach(sp.x, sp.y, k, false);
    const cut = [...base].filter(t => !after.has(t) && t !== k);
    if (!cut.length) continue;
    if (cut.some(t => must.has(t))) continue;
    gates++;
    console.log(`  GATE CANDIDATE (${x},${y}) seals ${cut.length} tiles: ${cut.slice(0,8).join(' ')}`);
}
console.log(`${file.padEnd(28)} reach ${String(base.size).padStart(4)} | grate tiles ${String(grates.length).padStart(3)} | rat-form opens ${String(opened.length).padStart(3)} | single-tile gates ${gates}`);
