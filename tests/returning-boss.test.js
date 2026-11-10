// returning-boss.test.js — a beaten boss's spot fills with a different boss (RO1, ruling RO1R1 a).
// plans/ro1-returning-boss-spot.md

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SLOTS, ENTRIES, RETURNING_SPOTS, pickSlots, defaultPicks, pickReturning, defaultReturning, resolveSpawn, requiredDropFor, spotFor } from '../game/slots.js';
import { recordKill, stepRespawns, deadIds, claimSpots, spotHolds, spotSpawns, bossDropOnce, sanitizeFilledSpots, RESPAWN_STEPS } from '../game/drops.js';
import { spawnEnemy } from '../game/enemies.js';
import { ENEMY_SPRITES, spriteVariant, SHEETS } from '../game/sprites.js';
import { migrate } from '../game/save.js';

const URL_SEWER = 'sewer-map.json';
const spot = RETURNING_SPOTS['sewer.returning'];
const FILLED = { [URL_SEWER]: [{ spawn: 'wererat_return', replaces: 'wererat' }] };

// What main.js _zoneChange does with the lists, minus the Game.
function zoneChange(lists, filled) {
    const back = stepRespawns(lists);
    claimSpots(back, filled, (url, id) => spotFor(url, id));
    return back;
}

const standIn = (mugged) => {
    const [s] = spotSpawns(FILLED, URL_SEWER, RETURNING_SPOTS);
    return spawnEnemy(resolveSpawn(s, defaultPicks(), undefined, undefined, defaultReturning()), mugged);
};

describe('the placeholder', () => {
    test("is the Were-Rat's numbers under a fake name and its own tag", () => {
        const e = ENTRIES.returning_boss, w = ENTRIES.wererat;
        assert.equal(e.name, '[NAME]');
        for (const k of ['hp', 'armor', 'damage', 'gold', 'type']) assert.equal(e[k], w[k], k);
        assert.notEqual(e.tag, w.tag);
        assert.ok(e.boss);
    });

    test('the Sewer has one returning spot, outside the anchor picks', () => {
        assert.deepEqual(Object.keys(RETURNING_SPOTS), ['sewer.returning']);
        assert.equal(spot.replaces, 'wererat');
        assert.ok(!('sewer.returning' in defaultPicks()));
        assert.ok(!('sewer.returning' in pickSlots(123)));
    });

    test("it is drawn from the tinted sheet, the Were-Rat from the plain one", () => {
        const info = ENEMY_SPRITES.Wererat;
        assert.equal(spriteVariant(info, { id: 'wererat', tag: 'wererat_boss' }).sheet, 'tinyDungeon');
        const tinted = spriteVariant(info, { id: 'wererat_return', tag: 'returning_boss' });
        assert.equal(tinted.sheet, 'wereratTint');
        assert.equal(tinted.col, info.col);
        assert.ok(SHEETS.wereratTint.tint);
    });
});

describe('beat the Were-Rat and walk the wait', () => {
    test('he does not come back; the stand-in takes his spot on the last step, and not before', () => {
        const lists = {}, filled = {};
        recordKill(lists, URL_SEWER, 'wererat');
        for (let i = 1; i < RESPAWN_STEPS; i++) {
            assert.deepEqual(zoneChange(lists, filled), {}, `step ${i}`);
            assert.deepEqual(spotSpawns(filled, URL_SEWER, RETURNING_SPOTS), []);
        }
        assert.deepEqual(zoneChange(lists, filled), {}, 'he is not handed back');
        assert.deepEqual(lists, {}, 'the list is empty');
        assert.deepEqual(filled[URL_SEWER], [{ spawn: 'wererat_return', replaces: 'wererat' }]);
        assert.ok(spotHolds(filled, URL_SEWER, { id: 'wererat' }), 'the Were-Rat stays off the map');
        assert.ok(!spotHolds(filled, URL_SEWER, { id: 'e1' }));
        assert.equal(spotSpawns(filled, URL_SEWER, RETURNING_SPOTS).length, 1);
    });

    test('other kills still come back as themselves', () => {
        const lists = {}, filled = {};
        recordKill(lists, URL_SEWER, 'e1');
        let back = {};
        for (let i = 0; i < RESPAWN_STEPS; i++) back = { ...back, ...zoneChange(lists, filled) };
        assert.deepEqual(back[URL_SEWER], ['e1']);
        assert.deepEqual(filled, {});
    });

    test('the spot is only for that zone: the same id elsewhere returns normally', () => {
        assert.equal(spotFor('carnival-map.json', 'wererat'), null);
        assert.equal(spotFor(URL_SEWER, 'e1'), null);
    });

    test("the stand-in stands in his place with the Were-Rat's numbers and its own kit", () => {
        const e = standIn();
        assert.equal(e.id, 'wererat_return');
        assert.equal(e.name, '[NAME]');
        assert.deepEqual([e.x, e.y], [spot.at.x, spot.at.y]);
        assert.equal(e.entity.hp, ENTRIES.wererat.hp);
        assert.ok(e.loadout.length > 0, 'it has a kit to drop');
    });

    test('its loot drops once, and a returning boss has no item of its own', () => {
        const e = standIn();
        assert.equal(requiredDropFor(e, []), null, 'no Converter, no required item');
        assert.equal(e.tag, 'returning_boss', "so no fur either (that is keyed on the Were-Rat's tag)");
        // main.js mugs an enemy whose kit dropped, and spawnEnemy then builds it with none.
        assert.deepEqual(standIn(new Set([e.id])).loadout, [], 'a second kill finds nothing');
    });

    test('the Converter never drops a second time', () => {
        const given = new Set();
        assert.equal(bossDropOnce(given, URL_SEWER, 'wererat'), true);
        assert.equal(bossDropOnce(given, URL_SEWER, 'wererat'), false);
        assert.equal(requiredDropFor({ id: 'wererat_return', tag: 'returning_boss' }, [{ id: 'wererat', slot: 'sewer.boss' }]), null);
        assert.equal(requiredDropFor({ id: 'wererat', slot: 'sewer.boss' }, []), SLOTS['sewer.boss'].requiredDrop);
    });

    test('beaten again, the stand-in goes on the list and returns as itself', () => {
        const lists = {}, filled = {};
        recordKill(lists, URL_SEWER, 'wererat_return');
        assert.ok(deadIds(lists, URL_SEWER).has('wererat_return'));
        let back = {};
        for (let i = 0; i < RESPAWN_STEPS; i++) back = { ...back, ...zoneChange(lists, filled) };
        assert.deepEqual(back[URL_SEWER], ['wererat_return']);
        assert.deepEqual(filled, {});
    });
});

describe('the pick and the save', () => {
    test('the same seed gives the same returning boss; the slot picks do not gain a key', () => {
        for (const seed of [1, 2, 99, 4242]) {
            assert.deepEqual(pickReturning(seed), pickReturning(seed));
            assert.equal(pickReturning(seed)['sewer.returning'], 'returning_boss');
            assert.ok(!('sewer.returning' in pickSlots(seed)));
        }
    });

    test('a save keeps the filled spot, and drops anything malformed', () => {
        const filled = { [URL_SEWER]: [{ spawn: 'wererat_return', replaces: 'wererat' }, { spawn: 3 }, null] };
        assert.deepEqual(sanitizeFilledSpots(filled), FILLED);
        assert.deepEqual(sanitizeFilledSpots(null), {});
        assert.deepEqual(sanitizeFilledSpots([1]), {});
        const m = migrate({ player: {}, world: { filledSpots: filled, returningPicks: { 'sewer.returning': 'returning_boss' } } });
        assert.deepEqual(m.world.filledSpots, FILLED);
        assert.equal(m.world.returningPicks['sewer.returning'], 'returning_boss');
    });

    test('an older save with the Were-Rat already beaten loads and behaves the same way', () => {
        const old = migrate({ player: {}, world: { respawnLists: { [URL_SEWER]: [{ id: 'wererat', age: 3 }] }, bossDropsGiven: ['sewer-map.json|wererat'] } });
        assert.deepEqual(old.world.filledSpots, {}, 'nothing filled yet');
        assert.deepEqual(old.world.returningPicks, defaultReturning());
        const lists = structuredClone(old.world.respawnLists), filled = {};
        let back = {};
        for (let i = 3; i < RESPAWN_STEPS; i++) back = { ...back, ...zoneChange(lists, filled) };
        assert.deepEqual(back, {});
        assert.equal(filled[URL_SEWER][0].spawn, 'wererat_return');
        assert.equal(bossDropOnce(new Set(old.world.bossDropsGiven), URL_SEWER, 'wererat'), false, 'the Converter stays given');
    });

    test('main.js and save.js are wired to it', () => {
        const main = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
        const save = readFileSync(new URL('../game/save.js', import.meta.url), 'utf8');
        assert.match(main, /this\._claimSpots\?\.\(back\)/);
        assert.match(main, /_spotSpawns\?\.\(url\)/);
        assert.match(save, /game\._filledSpots = sanitizeFilledSpots/);
        assert.match(save, /out\.filledSpots = spots/);
    });
});
