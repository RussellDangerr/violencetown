// nd1-npc-plain-line.test.js — ND1: examining a character says who they are and whether
// they will fight you (plans/nd1-npc-plain-line.md). Built from the spawn row alone.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { resolveExamine } from '../game/examine.js';
import { Enemy } from '../game/enemies.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const look = (e) => resolveExamine({ examinables: [], enemies: [e], containers: [], groundItems: [] }, 3, 3);
const at = (row) => look(new Enemy({ x: 3, y: 3, ...row }));

describe('ND1 — the plain character line', () => {
    test('a boss goes by its one name, as a boss', () => {
        const r = at({ type: 'Boss', boss: true, behavior: ['IDLE'], hp: 100, armor: 6, damage: 12 });
        assert.match(r.body, /^\[.+\. Boss\. Minding their own business\.\]$/);
    });

    test('a vendor is a vendor and the panel lists what it sells', () => {
        const r = at({ type: 'Vendor', name: 'Corner Merchant', vendor: true, stock: ['bandage', 'rock'], dialogueId: 'downtown_merchant', behavior: ['IDLE'] });
        assert.equal(r.body, '[Corner Merchant. Vendor. Minding their own business.]');
        assert.match(r.panelBody, /\nSells: /);
    });

    test('a talker with no name of its own goes by its role', () => {
        const r = at({ type: 'Violencian', name: '[TEXT]', dialogueId: 'taxi_driver', behavior: ['IDLE'], hp: 100, armor: -80, damage: 0 });
        assert.equal(r.title, 'Taxi driver');
        assert.equal(r.body, '[Taxi driver. Talker. Minding their own business.]');
        assert.ok(!r.body.includes('[TEXT]'));
        assert.match(r.panelBody, /\nHP: 100/);
        assert.match(r.panelBody, /\nArmour: -80/);
        assert.match(r.panelBody, /\nDamage: 0/);
    });

    test('a hostile creature looks like trouble', () => {
        const r = at({ type: 'Rat', name: 'Sewer rat', hp: 100, armor: -30, damage: 6 });
        assert.equal(r.body, '[Sewer rat. Creature. Looks like trouble.]');
    });

    test('an ambient townie wanders or guards by behavior', () => {
        assert.equal(at({ type: 'Violencian', behavior: ['WANDER'] }).body, '[Violencian. Wanderer. Minding their own business.]');
        assert.equal(at({ type: 'Violencian', behavior: ['IDLE'] }).body, '[Violencian. Guard. Minding their own business.]');
    });

    test('a bare row with no new code gets a correct line', () => {
        const r = at({ type: 'Hermit', behavior: ['WANDER'], dialogueId: 'old_hermit', hp: 40, armor: 0, damage: 2 });
        assert.equal(r.body, '[Old hermit. Talker. Minding their own business.]');
    });

    test('its own examine text comes first, then the sheet (NDR3)', () => {
        const e = new Enemy({ x: 3, y: 3, type: 'Rat', name: 'Frozen rat' });
        e.examine = '[Frozen solid.]';
        const r = look(e);
        assert.ok(r.body.startsWith('[Frozen solid.] [Frozen rat. Creature.'));
        assert.ok(r.panelBody.startsWith('[Frozen solid.]\n[Frozen rat.'));
    });

    test('carried items show as what they drop', () => {
        const r = at({ type: 'Ruffian', loadout: ['rock'] });
        assert.match(r.panelBody, /Drops: /);
    });
});
