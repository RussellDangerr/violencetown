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
import { resolveItemDef } from '../game/item-registry.js';
import { buyPrice } from '../game/trade.js';
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

test('a loadout naming an unknown item is a hard problem', () => {
    const { problems } = validateContent([{ file: 'x-map.json', data: { enemies: [
        { id: 'e1', type: 'Thug', damage: 5, loadout: ['not_an_item'] },
    ] } }]);
    assert.ok(problems.some(p => /not_an_item/.test(p)), problems.join('\n'));
});
test('a real loadout passes clean', () => {
    const { problems } = validateContent([{ file: 'x-map.json', data: { enemies: [
        { id: 'e1', type: 'Thug', damage: 5, gold: 3, loadout: ['tunnel_mushroom'] },
    ] } }]);
    // validateContent also walks the real global QUESTS/DIALOGUES graph, which
    // references real maps/npcs outside this test's one synthetic map — noise
    // pre-existing before Task 15 and unrelated to loadouts (confirmed: the same
    // noise appears with no loadout field at all). Scope the assertion to what
    // this test actually covers: authoring a real item id raises no unknown-item
    // complaint about it.
    assert.ok(!problems.some(p => p.includes('carries unknown item')), problems.join('\n'));
});

// A weapon authored into vendor or chest stock used to validate clean while
// silently failing in play: the old buy path did a bare ITEMS lookup and
// no-opped on a weapon, so content-validate carried a WARNING about the gap.
//
// The gap is CLOSED. The offer screen builds its rows through _resolveItemDef
// (WEAPONS || ITEMS), so a stocked weapon is a real, priced, buyable row — and
// the warning that described the gap went with the path that had it. This test
// now pins the FIX rather than the advisory.
test('a weapon authored into vendor/chest stock is fully supported — no problem, no warning', () => {
    // The retired path must stay retired: if _buyFromVendor comes back, the
    // bare-ITEMS gap may come back with it.
    const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
    assert.ok(!/_buyFromVendor\(/.test(mainSrc),
        'the bare-ITEMS vendor buy path is back — the weapon-in-stock gap may be back with it');

    const { problems, warnings } = validateContent([{ file: 'x-map.json', data: { enemies: [
        { id: 'e1', type: 'Merchant', vendor: true, stock: ['lion_whip'] },
    ] } }]);
    assert.ok(!problems.some(p => p.includes('stocks unknown item')), problems.join('\n'));
    assert.ok(!warnings.some(w => /stocks weapon/.test(w)),
        'a stocked weapon still warns, but the path that could not resolve it is gone:\n' + warnings.join('\n'));

    // And it really does resolve, at a real price — the thing the warning
    // existed to say was impossible.
    const def = resolveItemDef('lion_whip');
    assert.ok(def && def.baseValue > 0, 'lion_whip does not resolve to a priceable def');
    assert.ok(buyPrice(def, 40) > 0, 'a stocked weapon cannot be bought');
});

// loadout and examinable.grants ARE fixed (resolveLoadout, _grantFromExaminable
// both resolve WEAPONS now) — a weapon there gets no such warning.
test('a weapon in a loadout or an examinable grant raises no stock-style warning', () => {
    const { warnings } = validateContent([{ file: 'x-map.json', data: {
        enemies: [{ id: 'e1', type: 'Thug', damage: 5, gold: 3, loadout: ['lion_whip'] }],
        examinables: [{ id: 'x1', x: 0, y: 0, grants: 'lion_whip' }],
    } }]);
    assert.ok(!warnings.some(w => /lion_whip/.test(w)), warnings.join('\n'));
});
