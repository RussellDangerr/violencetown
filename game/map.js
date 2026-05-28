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
    }

    // ── Container & Region lookups ───────────────────────────────────────────
    //
    // Convenience helpers for systems that need to find containers/regions by
    // position or name. Containers themselves live on the game state (live);
    // these helpers query the map's spawn data, useful for finding *which*
    // container is at a given spot before resolving it to its live instance.

    getContainerSpawnAt(x, y) {
        return this.containerSpawns.find(c => c.x === x && c.y === y) || null;
    }

    getRegion(name) {
        return this.regions.find(r => r.name === name) || null;
    }

    getRegionContaining(x, y) {
        return this.regions.find(r =>
            x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
        ) || null;
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
        return this.getTileDef(x, y).walkable;
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
