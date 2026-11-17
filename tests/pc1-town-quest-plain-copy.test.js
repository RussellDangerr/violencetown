// pc1-town-quest-plain-copy.test.js — PC1: Town and the quests say plainly what things are.
// Placeholder copy is plain, never [TEXT] (plans/pc1-town-quest-plain-copy.md).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUESTS, BETWEEN_QUESTS, ACT2_QUESTS } from '../game/quests.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const town = JSON.parse(read('../game/town-map.json'));
const examinable = (id) => town.examinables.find(e => e.id === id);

describe('no [TEXT] reaches a player from town-map.json or quests.js', () => {
    test('town-map.json carries none', () => {
        assert.ok(read('../game/town-map.json').length > 1000, 'read the file');
        assert.ok(!read('../game/town-map.json').includes('[TEXT]'));
    });

    test('quests.js carries none except the two internal examinable ids', () => {
        const src = read('../game/quests.js');
        const left = src.split('\n').filter(l => l.includes('[TEXT]'));
        assert.equal(left.length, 2, left.join(' | '));
        assert.ok(left[0].includes('claimId'));
        assert.ok(left[1].includes('boothId'));
    });

    test('the Act 2 claim and booth ids are unchanged', () => {
        assert.equal(ACT2_QUESTS.FACTORY.claimId, '[TEXT]_claim_factory');
        assert.equal(ACT2_QUESTS.CARNIVAL.boothId, '[TEXT]_booth_carnival');
    });
});

describe('Town says what things are', () => {
    test('the car is your car, and says what to do about it', () => {
        assert.equal(examinable('car').text,
            'This is your car. You need to go to the sewer and kill the Were-Rat so that it drops the cataclysmic converter.');
    });

    test('the bridge, the driver and the fuel card', () => {
        assert.equal(examinable('bridge').text,
            'This is the bridge north out of Town. A barricade blocks it. Fix your car, then drive north across the bridge.');
        assert.equal(town.enemies.find(e => e.id === 'townie-driver').name, 'Taxi driver');
        assert.ok(examinable('fuel_note').text.endsWith(
            'Hooch sells it here. Pour a bottle into your car\'s tank before you drive over the bridge.\\"]'.replace('\\"', '"')));
    });

    test('examinable ids are unchanged', () => {
        for (const id of ['car', 'bridge', 'fuel_note']) assert.ok(examinable(id), id);
    });
});

describe('every quest line says what to do and where', () => {
    test('quest and stage ids are unchanged', () => {
        assert.deepEqual(Object.keys(QUESTS), ['canyon_escape', 'deliver_burger', 'fix_car']);
        assert.deepEqual(QUESTS.fix_car.stages.map(s => s.id),
            ['examine_car', 'recover_converter', 'escape_sewer', 'return_to_car']);
        assert.deepEqual(QUESTS.deliver_burger.stages.map(s => s.id), ['get_burger', 'get_cone', 'handoff']);
    });

    test('Special Delivery', () => {
        const [burger] = QUESTS.deliver_burger.stages;
        assert.equal(burger.objective, 'Get the burger and fries');
        assert.equal(burger.location, 'Downtown');
        assert.equal(burger.description,
            'You need the burger and fries for the delivery. Your boss gives them to you before you cross the bridge. Keep them in your bag.');
        const logs = [];
        QUESTS.deliver_burger.onComplete({ gold: 0, _log: (t) => logs.push(t) });
        assert.deepEqual(logs, ['Delivery done. +50 GP.']);
    });

    test('Fix the car', () => {
        assert.equal(QUESTS.fix_car.title, 'Fix the car');
        const s = Object.fromEntries(QUESTS.fix_car.stages.map(x => [x.id, x]));
        assert.equal(s.return_to_car.objectiveShelved, 'Buy the converter back from Macc');
        const logs = [];
        const flags = {};
        QUESTS.fix_car.onComplete({ questEngine: { state: { flags } }, _log: (t) => logs.push(t) });
        assert.deepEqual(logs, ['The car runs. The bridge north is open.']);
        assert.equal(flags.carFixed, true);
    });

    test('the between-quests rows that were placeholders', () => {
        const row = (id) => BETWEEN_QUESTS.find(r => r.id === id).objective;
        assert.equal(row('back_to_town'), 'Go back to Town');
        assert.equal(row('to_downtown'), 'Go to the bank vault in Downtown');
    });

    test('the Act 2 quests, one per zone', () => {
        for (const [zone, q] of Object.entries(ACT2_QUESTS)) {
            const name = zone[0] + zone.slice(1).toLowerCase();
            assert.equal(q.title, `Get the ${name} item`);
            assert.equal(q.steps.boss.objective, `Defeat the ${name} boss`);
            assert.equal(q.steps.collect.objective, `Take the ${name} item at its claim spot (E)`);
        }
        assert.equal(Object.keys(ACT2_QUESTS).length, 3);
    });

    test('every objective fits a phone (46 characters)', () => {
        const lines = [];
        for (const q of Object.values(QUESTS)) if (q.id !== 'canyon_escape') for (const s of q.stages) lines.push(s.objective, s.objectiveShelved);
        for (const r of BETWEEN_QUESTS) lines.push(r.objective);
        for (const q of Object.values(ACT2_QUESTS)) lines.push(q.steps.boss.objective, q.steps.collect.objective);
        const real = lines.filter(Boolean);
        assert.ok(real.length >= 15);
        for (const l of real) assert.ok(l.length <= 46, `${l.length}: ${l}`);
    });
});
