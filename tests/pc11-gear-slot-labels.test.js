// pc11-gear-slot-labels.test.js — the five armour slots and two hands carry their plain names
// on the GEAR tab and in the fight panels (plans/pc11-gear-slot-labels.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EQUIP_SLOT_RECTS, EQUIP_LEFT_HAND_RECT } from '../game/layout.js';
import { playerPanel, SLOT_ORDER } from '../game/fight-panels.js';

const WANT = {
    top: 'TOP', sides: 'SIDES', front: 'FRONT', back: 'BACK', bottom: 'BOTTOM',
    weapon: 'WEAPON RIGHT', left: 'WEAPON LEFT',
};

describe('PC11 gear slot labels', () => {
    test('the GEAR plates are named by slot', () => {
        const plates = [...EQUIP_SLOT_RECTS, EQUIP_LEFT_HAND_RECT];
        assert.equal(plates.length, 7);
        for (const p of plates) assert.equal(p.label, WANT[p.key], p.key);
    });

    test('the fight panel rows are named by slot', () => {
        const rows = playerPanel({ equipment: {} });
        const list = rows.slots;
        assert.equal(list.length, SLOT_ORDER.length);
        for (const r of list) assert.equal(r.label, WANT[r.key], r.key);
    });

    test('no old name or bracket survives on a plate', () => {
        for (const p of [...EQUIP_SLOT_RECTS, EQUIP_LEFT_HAND_RECT]) {
            assert.doesNotMatch(p.label, /HEAD|ARMS|TORSO|FEET|[[\]]/);
        }
    });
});
