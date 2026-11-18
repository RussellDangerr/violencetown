#!/usr/bin/env node
// item-sources.mjs — where every item comes from (plans/pc10-describe-item.md).
//
//   node tools/item-sources.mjs          writes game/item-sources.json
//   node tools/item-sources.mjs --check  exits 1 if the file is stale
//
// For each item id: who drops it, who sells it, which zones it is found in.
// Read from the same data the game reads:
//   dropped by  map enemy spawns and slots.js ENTRIES, each spawned through enemies.js
//               spawnEnemy, so the kit is what the game really hands out: the stock kit by
//               armour band (the tier table) where a spawn authors none, and a worn armour piece
//               moved out of the kit (worn gear is not dropped). A boss slot's required drop
//               goes to every boss in the slot's pool.
//   sold by     map spawns with `vendor: true` and a `stock`.
//   found in    map ground items, chest contents and examinables that grant an item.
// Not read: npc.js THROWS_CARRIED. It says what an enemy throws instead of eating, and who
// carries the item is already in the loadouts above.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GAME = path.join(HERE, '..', 'game');
export const OUT = path.join(GAME, 'item-sources.json');

const title = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

// A map's zone name as a player reads it: no brackets, not shouting. A placeholder zone name
// ([TEXT]) falls back to the file's own name.
export function zoneLabel(file, raw) {
    const t = String(raw || '').replace(/[\[\]]/g, '').trim();
    if (!t || /^TEXT$/i.test(t)) return title(file.replace(/-map\.json$/, '').replace(/-/g, ' '));
    return title(t);
}

export async function buildItemSources() {
    const { spawnEnemy } = await import('../game/enemies.js');
    const { ENTRIES, SLOTS, labelOf } = await import('../game/slots.js');

    const maps = readdirSync(GAME).filter(f => f.endsWith('-map.json')).sort();
    const out = {};
    const row = id => (out[id] ??= { droppedBy: new Set(), soldBy: new Set(), foundIn: new Set() });
    const dropKit = (spawn, label) => {
        const e = spawnEnemy(structuredClone(spawn), new Set());
        for (const id of e.loadout || []) row(id).droppedBy.add(label);
    };

    const entryIds = new Set();
    for (const f of maps) {
        const m = JSON.parse(readFileSync(path.join(GAME, f), 'utf8'));
        const zone = zoneLabel(f, m.zoneName);
        for (const sp of m.enemies || []) {
            if (sp.entry) { entryIds.add(sp.entry); continue; }
            if (sp.slot) continue;                                    // its pool is read below
            if (sp.vendor && Array.isArray(sp.stock)) {
                for (const id of sp.stock) row(id).soldBy.add(labelOf(sp));
            }
            dropKit(sp, labelOf(sp));
        }
        for (const it of m.items || []) row(it.type).foundIn.add(zone);
        for (const c of m.containers || []) for (const id of c.contents || []) row(id).foundIn.add(zone);
        for (const ex of m.examinables || []) if (ex.grants) row(ex.grants).foundIn.add(zone);
    }
    for (const slot of Object.values(SLOTS)) for (const p of slot.pool || []) entryIds.add(p.entry);
    for (const id of [...entryIds].sort()) {
        const entry = ENTRIES[id];
        if (!entry) continue;
        dropKit(entry, labelOf(entry));
    }
    for (const slot of Object.values(SLOTS)) {
        if (!slot.requiredDrop) continue;
        for (const p of slot.pool || []) if (ENTRIES[p.entry]) row(slot.requiredDrop).droppedBy.add(labelOf(ENTRIES[p.entry]));
    }

    const sorted = {};
    for (const id of Object.keys(out).sort()) {
        const o = {};
        for (const [k, v] of Object.entries(out[id])) if (v.size) o[k] = [...v].sort();
        if (Object.keys(o).length) sorted[id] = o;
    }
    return sorted;
}

export const render = (data) => JSON.stringify(data, null, 2) + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const data = await buildItemSources();
    if (process.argv.includes('--check')) {
        const same = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') === render(data);
        console.log(same ? 'item-sources.json is current' : 'item-sources.json is stale: run node tools/item-sources.mjs');
        process.exit(same ? 0 : 1);
    }
    writeFileSync(OUT, render(data));
    console.log(`wrote item-sources.json (${Object.keys(data).length} items)`);
}
