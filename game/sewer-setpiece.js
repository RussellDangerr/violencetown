// sewer-setpiece.js — the "escape the sewer" gauntlet (Phase D).
//
// Fires from the fix_car quest's escape stage onEnter, once the player grabs
// the converter off the Were-Rat. The fungi twist into rats, a portcullis
// slams down mid-hall, the climb-out is barricaded, and rats pour from the
// walls in two waves (10, then +5 once 5 are down). The player tears through
// the barricade (bump it) and climbs out the west exit.
//
// State lives on game._sewerEscape and is persisted in the save, so a
// mid-gauntlet reload reconstructs the wave counter + barricade HP. Tiles
// mutate via game.setTile (recorded as diffs); rats are normal Enemies, so
// rendering + combat + save all work for free.

import { Enemy } from './enemies.js';

const FLOOR = 1, PORTCULLIS = 22, BARRICADE = 23;

// Wall-adjacent floor cells along the main hall where rats "pour from the walls".
const RAT_SPAWNS = [
    { x: 3, y: 9 }, { x: 6, y: 9 }, { x: 10, y: 9 }, { x: 13, y: 9 }, { x: 16, y: 9 },
    { x: 3, y: 11 }, { x: 6, y: 11 }, { x: 10, y: 11 }, { x: 13, y: 11 }, { x: 16, y: 11 },
    { x: 8, y: 9 }, { x: 8, y: 11 },
];
// The climb-out is reached via (1,10) -> (0,10). Barricade the column-1 neck.
const BARRICADE_CELLS = [{ x: 1, y: 9 }, { x: 1, y: 10 }, { x: 1, y: 11 }];
const BARRICADE_HP = 2;                       // bumps to clear one cell
const PORTCULLIS_CELL = { x: 13, y: 10 };     // slams down mid-hall (3-wide, so a one-cell pinch, not a trap)

let _ratSeq = 0;

function makeRat(x, y) {
    return new Enemy({ id: 'rat_' + (_ratSeq++), type: 'Rat', x, y, hp: 16, damage: 6, sightRange: 10, tag: 'sewer_rat' });
}

function spawnRats(game, n) {
    const occupied = (x, y) =>
        (game.playerX === x && game.playerY === y) ||
        game.enemies.some(e => e.entity.isAlive() && e.x === x && e.y === y);
    // Seeded Fisher-Yates so spawn picks are deterministic/resumable.
    const pts = RAT_SPAWNS.slice();
    for (let i = pts.length - 1; i > 0; i--) {
        const j = game.rng.int(i + 1);
        [pts[i], pts[j]] = [pts[j], pts[i]];
    }
    let spawned = 0;
    for (const p of pts) {
        if (spawned >= n) break;
        if (game.map.isWalkable(p.x, p.y) && !occupied(p.x, p.y)) {
            game.enemies.push(makeRat(p.x, p.y));
            spawned++;
        }
    }
    return spawned;
}

// The escape stage's onEnter. Runs once (never on save-restore).
export function startSewerEscape(game) {
    if (game._sewerEscape && game._sewerEscape.active) return;   // idempotent
    game._sewerEscape = { active: true, ratsKilled: 0, wave2Spawned: false, barricadeHp: {} };

    // 1. Fungi -> rats (Fungus King excepted; he stays as the mid-fight beast).
    for (const e of game.enemies.slice()) {
        if (e.entity.isAlive() && /Fungus/.test(e.type) && e.type !== 'Fungus King') {
            e.entity.alive = false;
            game.enemies.push(makeRat(e.x, e.y));
        }
    }

    // 2. Portcullis slams down; the climb-out is barricaded.
    game.setTile(PORTCULLIS_CELL.x, PORTCULLIS_CELL.y, PORTCULLIS);
    for (const c of BARRICADE_CELLS) {
        game.setTile(c.x, c.y, BARRICADE);
        game._sewerEscape.barricadeHp[c.x + ',' + c.y] = BARRICADE_HP;
    }

    // 3. First wave.
    spawnRats(game, 10);
    game._log('[Steel SLAMS down. The fungus-folk twist into RATS. The exit is barricaded!]', 'combat');
    if (game._triggerScreenShake) game._triggerScreenShake(300, 6);
}

// From the enemy-kill site: tracks rat kills, spawns wave 2 at 5.
export function onSewerEnemyKilled(game, enemy) {
    const st = game._sewerEscape;
    if (!st || !st.active || enemy.tag !== 'sewer_rat') return;
    st.ratsKilled++;
    if (st.ratsKilled >= 5 && !st.wave2Spawned) {
        st.wave2Spawned = true;
        if (spawnRats(game, 5) > 0) game._log('[More rats boil out of the walls!]', 'combat');
    }
}

// From the move handler when the player bumps a BARRICADE tile. Clears the cell
// when its HP reaches 0 (setTile records a diff so it persists).
export function hitBarricade(game, x, y) {
    const st = game._sewerEscape;
    const key = x + ',' + y;
    const hp = (st && st.barricadeHp[key] != null) ? st.barricadeHp[key] : 1;
    if (hp - 1 <= 0) {
        game.setTile(x, y, FLOOR);
        if (st) delete st.barricadeHp[key];
        game._log('[You tear through the barricade!]', 'combat');
    } else {
        if (st) st.barricadeHp[key] = hp - 1;
        game._log('[You batter the barricade. It buckles.]');
    }
}
