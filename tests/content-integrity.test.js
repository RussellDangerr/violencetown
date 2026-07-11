// content-integrity.test.js — CD-2. Rides `node --test` (npm test). Reads the 12
// canonical map JSONs off disk and runs the shared, browser-safe validator
// (game/content-validate.js) that walks the content graph for dangling ids.
//
// The same validateContent() also runs in the browser (game/_content-check.html)
// so the check is verifiable on this node-less dev machine too — the ONLY
// environment-specific part is HOW the map JSON is loaded (fs here, fetch there).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { validateContent } from '../game/content-validate.js';

// `*-map.json` matches the 12 real maps and naturally excludes the stale
// `*-map-TheDangerrZone.json` snapshots (they end in `-TheDangerrZone.json`).
const gameDir = fileURLToPath(new URL('../game/', import.meta.url));
const mapFiles = readdirSync(gameDir).filter(f => f.endsWith('-map.json')).sort();
const maps = mapFiles.map(file => ({ file, data: JSON.parse(readFileSync(join(gameDir, file), 'utf8')) }));

test('content graph has no dangling ids (quests / maps / dialogue resolve)', () => {
    assert.ok(maps.length >= 12, `expected the 12 canonical maps, found ${maps.length}`);
    const { problems, warnings } = validateContent(maps);
    if (warnings.length) console.warn('\n[content-integrity WARN]\n' + warnings.join('\n') + '\n');
    assert.deepEqual(problems, [], '\nDangling content references:\n' + problems.join('\n') + '\n');
});
