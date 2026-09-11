// world-integrity.test.js — every exit leads somewhere real, and every weapon
// can actually be had.
//
// Two kinds of content that fail silently. An exit whose `toMap` names a file
// that is not there throws only when a player walks into it. And the Ray Gun
// was a fully built weapon — damage, a granted trick, a description — that no
// map, loadout, shop or chest ever offered, so for months it existed only in
// weapons.js. Neither was caught, because nothing looked.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GameMap } from '../game/map.js';
import { WEAPONS } from '../game/weapons.js';

const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');

// `*-map.json` matches the real maps and excludes the stale
// `*-map-TheDangerrZone.json` snapshots, which end in `-TheDangerrZone.json`.
const mapFiles = readdirSync(GAME_DIR).filter(f => f.endsWith('-map.json')).sort();
const maps = mapFiles.map(file => ({ file, data: JSON.parse(readFileSync(join(GAME_DIR, file), 'utf8')) }));

describe('exits', () => {
    test('every exit names a map that exists', () => {
        const known = new Set(mapFiles);
        const broken = maps.flatMap(({ file, data }) => (data.transitions || [])
            .filter(t => !known.has(t.toMap))
            .map(t => `${file} (${t.x}, ${t.y}) -> ${t.toMap}`));
        assert.deepEqual(broken, [], `exits to nowhere:\n  ${broken.join('\n  ')}`);
    });

    test('every exit lands you on ground you can stand on', () => {
        const byFile = Object.fromEntries(maps.map(({ file, data }) => [file, new GameMap(data, file)]));
        const bad = maps.flatMap(({ file, data }) => (data.transitions || [])
            .filter(t => byFile[t.toMap] && !byFile[t.toMap].isWalkable(t.toX, t.toY))
            .map(t => `${file} (${t.x}, ${t.y}) -> ${t.toMap} (${t.toX}, ${t.toY})`));
        assert.deepEqual(bad, [], `exits that land in a wall:\n  ${bad.join('\n  ')}`);
    });
});

// Weapons handed out by code rather than placed in data. Each entry names the
// code path, so a sweep of the maps can still account for every weapon.
const GRANTED_IN_CODE = {
    wooden_sword: 'the starting weapon — equipped on a new game (main.js)',
};

describe('weapons', () => {
    test('every weapon can be obtained somewhere', () => {
        const sources = new Set(Object.keys(GRANTED_IN_CODE));
        const note = (id) => { if (typeof id === 'string') sources.add(id); else if (id?.type) sources.add(id.type); };
        for (const { data } of maps) {
            for (const i of data.items || []) note(i.type);                       // lying on the ground
            for (const e of data.enemies || []) {
                for (const l of e.loadout || []) note(l);                         // dropped on death (Law 6f)
                for (const s of e.stock || []) note(s);                           // for sale
            }
            for (const c of data.containers || []) for (const x of c.contents || []) note(x);
            for (const x of data.examinables || []) note(x.grants);
        }
        const dead = Object.keys(WEAPONS).filter(id => !sources.has(id));
        assert.deepEqual(dead, [], `weapons no player can get: ${dead.join(', ')}`);
    });

    test('every weapon can be wielded again from the bag', () => {
        // Use (resolveEquip) and the GEAR chooser (inspector.js equipOptions) both
        // key on useType 'equip'. The starting sword had none, so the first time a
        // player picked up any other weapon, the sword went to the bag for good.
        const stuck = Object.values(WEAPONS).filter(w => w.useType !== 'equip' || w.equipSlot !== 'weapon').map(w => w.id);
        assert.deepEqual(stuck, [], `weapons that can never be re-equipped: ${stuck.join(', ')}`);
    });

    test('the code-granted list has not gone stale', () => {
        for (const id of Object.keys(GRANTED_IN_CODE)) assert.ok(WEAPONS[id], `${id} is no longer a weapon — remove it from GRANTED_IN_CODE`);
    });
});
