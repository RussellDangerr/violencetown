// map.js — Static map loader for hand-crafted levels
// Sewer demo prototype

import { TILE_BY_ID } from './data.js';

export class GameMap {
    constructor(mapData, mapUrl) {
        this.url     = mapUrl;
        this.width   = mapData.width;
        this.height  = mapData.height;
        this.spawn   = mapData.spawn;
        this.bossRoom = mapData.bossRoom || null;
        this.zoneName = mapData.zoneName || 'UNKNOWN';
        this.tiles   = new Uint8Array(mapData.tiles);

        this.enemySpawns = mapData.enemies || [];
        this.itemSpawns  = mapData.items || [];

        // Containers: [{ id, type, x, y, contents: [...] }]
        // Read as spawn data; live mutable containers live on the game state
        // (game.containers) so chest contents don't pollute the map definition.
        this.containerSpawns = mapData.containers || [];

        // Regions: [{ name, x, y, w, h, sealed? }] — rectangular sub-areas of
        // the map. NPCs may reference by name to constrain wander/work scope.
        // Pure metadata; no behavior at the map level.
        this.regions = mapData.regions || [];

        // Transitions: [{ x, y, toMap, toX, toY, label }]
        this.transitions = mapData.transitions || [];

        // Examinables: [{ id, x, y, text }] — points of interest the Examine
        // skill (examine.js) inspects. Copied live onto game.examinables.
        this.examinableSpawns = mapData.examinables || [];

        // Props: [{ type, x, y, solid? }] — tall, ground-anchored overlay objects
        // (trees, posts) the renderer depth-sorts with the cast for walk-behind
        // (depth/verticality). Static map data, like tiles — re-snapshotted on
        // every load, no save state. A prop's base tile blocks movement unless
        // `solid: false`; `propBlocked` is the O(1) lookup isWalkable consults.
        this.propSpawns  = mapData.props || [];
        this.propBlocked = new Set(
            this.propSpawns.filter(p => p.solid !== false).map(p => `${p.x},${p.y}`)
        );

        // Lights: [{ x, y, radius?, r?, g?, b? }] — emissive points (lamps, lit
        // windows, door spill) the day/night lighting grade adds as warm additive
        // glows after dusk (renderer._drawLighting). Static map data; no effect
        // while it's day (game._nightLevel === 0).
        this.lights = mapData.lights || [];

        // Densify the sparse hand-authored transition tiles into full, edge-butted
        // openings so the player can't slip past an exit. Runs after tiles + props
        // are loaded (isWalkable needs both).
        this.densifyTransitions();
    }

    // ── Transition densification ─────────────────────────────────────────────
    //
    // Hand-authored maps mark only a few sparse tiles of each door — every other
    // tile, or one tile in from the wall — so the player can walk along an edge,
    // slip *between* the exits, and miss the zone change entirely. For each door
    // (transitions that share a destination), this finds the exit direction (the
    // nearest map border), steps to the EDGE-MOST walkable tile that way, and fills
    // EVERY walkable tile of the contiguous opening there with a transition. Result:
    // the whole opening triggers, the marker sits on the last tile before the wall,
    // and there are no gaps to walk through. Idempotent-ish; replaces `transitions`.
    densifyTransitions() {
        if (!this.transitions.length) return;
        const W = this.width, H = this.height;
        const groups = new Map();
        for (const t of this.transitions) {
            const k = `${t.toMap}|${t.toX}|${t.toY}`;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(t);
        }
        const out = [];
        for (const group of groups.values()) {
            const s = group[0];
            const xs = group.map(t => t.x), ys = group.map(t => t.y);
            const xMin = Math.min(...xs), xMax = Math.max(...xs);
            const yMin = Math.min(...ys), yMax = Math.max(...ys);
            const cx = (xMin + xMax) / 2, cy = (yMin + yMax) / 2;
            // Exit direction = toward the nearest map border.
            const dist = [cx, W - 1 - cx, cy, H - 1 - cy];
            const near = Math.min(...dist);
            let ex = 0, ey = 0;
            if (near === dist[0]) ex = -1; else if (near === dist[1]) ex = 1;
            else if (near === dist[2]) ey = -1; else ey = 1;
            // Spread the source so custom fields survive densification (e.g. the
            // `requires`/`requiresMsg` item-gate on the canyon climb-out).
            const make = (x, y) => out.push({ ...s, x, y });
            if (ex !== 0) {
                // Horizontal exit: walk to the edge column, fill the vertical opening.
                const probeY = ys[Math.floor(ys.length / 2)];
                let ax = ex < 0 ? xMin : xMax;
                while (this.isWalkable(ax + ex, probeY)) ax += ex;
                let y0 = yMin, y1 = yMax;
                while (this.isWalkable(ax, y0 - 1)) y0--;
                while (this.isWalkable(ax, y1 + 1)) y1++;
                for (let y = y0; y <= y1; y++) if (this.isWalkable(ax, y)) make(ax, y);
            } else {
                // Vertical exit: walk to the edge row, fill the horizontal opening.
                const probeX = xs[Math.floor(xs.length / 2)];
                let ay = ey < 0 ? yMin : yMax;
                while (this.isWalkable(probeX, ay + ey)) ay += ey;
                let x0 = xMin, x1 = xMax;
                while (this.isWalkable(x0 - 1, ay)) x0--;
                while (this.isWalkable(x1 + 1, ay)) x1++;
                for (let x = x0; x <= x1; x++) if (this.isWalkable(x, ay)) make(x, ay);
            }
        }
        this.transitions = out;
    }

    // ── Container & Region lookups ───────────────────────────────────────────
    //
    // Convenience helpers for systems that need to find containers/regions by
    // position or name. Containers themselves live on the game state (live);
    // these helpers query the map's spawn data, useful for finding *which*
    // container is at a given spot before resolving it to its live instance.

    getRegion(name) {
        return this.regions.find(r => r.name === name) || null;
    }

    getTile(x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
        return this.tiles[y * this.width + x];
    }

    getTileDef(x, y) {
        const id = this.getTile(x, y);
        return TILE_BY_ID[id] || TILE_BY_ID[0];
    }

    isWalkable(x, y) {
        // A solid prop (tree trunk, post) blocks its base tile even though the
        // ground tile underneath stays walkable, so the player bumps the trunk
        // but can still stand — and be occluded — on the tiles around it.
        return this.getTileDef(x, y).walkable && !this.propBlocked.has(`${x},${y}`);
    }

    isInBounds(x, y) {
        return x >= 0 && y >= 0 && x < this.width && y < this.height;
    }

    // Check if a position has a map transition
    getTransition(x, y) {
        return this.transitions.find(t => t.x === x && t.y === y) || null;
    }
}

// ── Loader ───────────────────────────────────────────────────────────────────

export async function loadMap(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load map: ${resp.status}`);
    const data = await resp.json();
    return new GameMap(data, url);
}
