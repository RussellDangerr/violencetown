// fight-panels.test.js — what the two fight panels say (plans/combat-hud.md stage 4).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { playerPanel, targetPanel, panelTarget, takeable, SLOT_ORDER } from '../game/fight-panels.js';

const victim = (over = {}) => ({
    type: 'Wererat', x: 11, y: 10, thievable: true,
    entity: { isAlive: () => true, hp: 7, maxHp: 12, armor: 2 },
    gold: 40, loadout: ['rock', 'health_poition'], equipped: ['soap'],
    ...over,
});
const game = (over = {}) => ({
    playerX: 10, playerY: 10,
    equipment: { weapon: { id: 'wooden_sword', name: '[Wooden Sword]' }, top: null, bottom: null,
                 front: { id: 'soap', name: '[Soap]' }, back: null, sides: null },
    enemies: [], wheel: null, ...over,
});

describe('the player panel — read-only, and the shape never changes', () => {
    test('always the same six slots, in the same order', () => {
        assert.deepEqual(playerPanel(game()).slots.map((s) => s.key), SLOT_ORDER);
        assert.deepEqual(playerPanel(game({ equipment: {} })).slots.map((s) => s.key), SLOT_ORDER);
    });

    test('names what is worn and leaves empties empty, rather than hiding them', () => {
        const by = Object.fromEntries(playerPanel(game()).slots.map((s) => [s.key, s]));
        assert.equal(by.weapon.name, '[Wooden Sword]');
        assert.equal(by.front.name, '[Soap]');
        assert.equal(by.top.name, null, 'an empty slot is still a row');
        assert.equal(by.top.label, 'HEAD');
    });

    test('carries no action of any kind — the fight HUD never equips (ruling H1-4)', () => {
        const json = JSON.stringify(playerPanel(game()));
        for (const word of ['equip', 'action', 'onTap', 'verb']) {
            assert.ok(!json.toLowerCase().includes(word), `panel data leaked "${word}"`);
        }
    });

    test('a game with no equipment at all does not throw', () => {
        assert.equal(playerPanel({}).slots.length, SLOT_ORDER.length);
    });
});

describe('takeable — the one place the three theft questions are answered', () => {
    test('reports each branch from what the victim actually carries', () => {
        assert.deepEqual(takeable(victim()), { coin: true, kit: true, gear: true });
    });
    test('a broke, stripped victim offers nothing', () => {
        assert.deepEqual(takeable(victim({ gold: 0, loadout: [], equipped: [] })),
            { coin: false, kit: false, gear: false });
    });
    test('missing fields read as nothing there, not as a throw', () => {
        assert.deepEqual(takeable({}), { coin: false, kit: false, gear: false });
        assert.deepEqual(takeable(null), { coin: false, kit: false, gear: false });
    });
});

describe('the target panel — honest to the enemy\'s own shape', () => {
    test('names them, their HP as digits, and their gold', () => {
        const p = targetPanel(victim());
        assert.equal(p.name, 'Wererat');
        assert.equal(p.hp, 7);
        assert.equal(p.maxHp, 12);
        assert.equal(p.gold, 40);
    });

    test('names the kit items rather than counting them', () => {
        assert.deepEqual(targetPanel(victim()).kit.map((k) => k.id), ['rock', 'health_poition']);
        for (const k of targetPanel(victim()).kit) assert.ok(k.name && k.name.length, `${k.id} has no name`);
    });

    test('a flat kit list, not six faked slots', () => {
        const p = targetPanel(victim());
        assert.ok(Array.isArray(p.kit));
        assert.ok(!('slots' in p), 'the enemy has no slot breakdown to show');
    });

    test('carries the steal verdicts, so Thieve\'s grey slices become legible', () => {
        assert.deepEqual(targetPanel(victim()).takeable, { coin: true, kit: true, gear: true });
        assert.deepEqual(targetPanel(victim({ gold: 0 })).takeable.coin, false);
    });

    test('an unthievable victim shows its kit but offers no takes', () => {
        const p = targetPanel(victim({ thievable: false }));
        assert.deepEqual(p.takeable, { coin: false, kit: false, gear: false });
        assert.equal(p.kit.length, 2, 'you can still see what they carry');
    });

    test('null target yields null, so the renderer can just skip', () => {
        assert.equal(targetPanel(null), null);
    });
});

describe('panelTarget — who the right-hand panel is about', () => {
    const fighter = (over = {}) => victim({ ambient: false, state: 'chasing', sightRange: 8, ...over });

    test('the aimed enemy wins, so the panel follows the reticle', () => {
        const far = fighter({ x: 14, y: 10 });
        const near = fighter({ x: 11, y: 10 });
        const g = game({ enemies: [near, far], wheel: { aiming: true, reticle: { x: 14, y: 10 } } });
        assert.equal(panelTarget(g), far);
    });

    test('with no aim, the nearest fighter', () => {
        const far = fighter({ x: 15, y: 10 });
        const near = fighter({ x: 12, y: 10 });
        assert.equal(panelTarget(game({ enemies: [far, near] })), near);
    });

    test('ambient townsfolk are not the fight, so they are never the target', () => {
        assert.equal(panelTarget(game({ enemies: [victim({ ambient: true, state: 'chasing' })] })), null);
    });

    test('the dead are not the target', () => {
        const dead = fighter({ entity: { isAlive: () => false, hp: 0, maxHp: 12 } });
        assert.equal(panelTarget(game({ enemies: [dead] })), null);
    });

    test('no enemies at all yields null', () => {
        assert.equal(panelTarget(game()), null);
    });
});
