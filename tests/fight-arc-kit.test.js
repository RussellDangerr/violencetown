// fight-arc-kit.test.js — FA2: the arc's move slots follow the weapon in hand
// (plans/fa2-arc-slots-follow-weapon.md). WK1 swaps the Melee ring by weapon class; the arc
// must list only what the live ring has and a slot must fire the move it is labelled.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { Game } = await import('../game/main.js');
const { Enemy } = await import('../game/enemies.js');
const wm = await import('../game/wheel-model.js');
const { arcSlots } = await import('../game/fight-arc.js');
const { WEAPON_CLASSES } = await import('../game/weapons.js');

globalThis.window = new EventTarget();
setMaxListeners(200, globalThis.window);

const PX = 20, PY = 20;
const RESOLVER = { hit: 'combatAttack', cleave: 'cleaveAttack', spin: 'spinAttack', stun: 'stunAttack' };

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

function fightGame(weaponClass) {
    const e = new Enemy({ id: 'foe', type: 'Violencian', x: PX + 1, y: PY, name: 'Foe', sightRange: 8 });
    e.state = 'chasing';
    const g = new Game();
    Object.assign(g, {
        state: 'idle', playerX: PX, playerY: PY, playerHp: 100, playerMaxHp: 100, playerMp: 100, gold: 0,
        enemies: [e], groundItems: [], containers: [], examinables: [], inventory: [], facing: 'down',
        equipment: { weapon: { damage: 10, damageType: 'blunt', id: 'w', weaponClass } },
        knownSpells: [], grantedTricks: [],
        renderer: { _menuPanelRect: null, _closeBtnRect: null },
        map: { getTile: () => 0, isWalkable: () => true },
    });
    g._animating = false; g.turns = 0; g.logs = [];
    g._render = () => {}; g._log = (m) => g.logs.push(m);
    g._skipLootReel = () => {}; g._maybeShowHint = () => {}; g._ensureParticleLoop = () => {};
    g._advanceWorld = () => { g.turns++; };
    const doc = globalThis.document = new EventTarget();
    g._bindInput();
    g.tap = (code) => { doc.dispatchEvent(new Key('keydown', code)); doc.dispatchEvent(new Key('keyup', code)); };
    g._syncMeleeKit();
    return g;
}

const nodeAtPath = (path) => path.reduce((n, i) => n.children[i], wm.ROOT);
const labels = (g) => arcSlots(g).map(s => s.label);

afterEach(() => wm.setMeleeKit(null));

describe('the arc follows the weapon in hand', () => {
    for (const [id, cls] of Object.entries(WEAPON_CLASSES)) {
        test(`${id}: every arc slot is its own move on the live ring`, () => {
            const g = fightGame(id);
            const slots = arcSlots(g);
            const keys = slots.map(s => s.key);
            assert.equal(keys.includes('cleave'), cls.kit.includes('cleave'), 'Cleave only when the kit has it');
            assert.equal(keys.includes('spin'), cls.kit.includes('spin'), 'Spin only when the kit has it');
            assert.ok(keys.includes('hit'));
            for (const s of slots) {
                const at = nodeAtPath(s.path);
                assert.equal(at, s.node, `${s.label}: the path leads to its own node`);
                assert.equal(at.key, s.key);
                if (RESOLVER[s.key]) assert.equal(at.resolver, RESOLVER[s.key], `${s.label} fires ${RESOLVER[s.key]}`);
            }
            assert.deepEqual(slots.map(s => s.n), slots.map((_, i) => i + 1), 'numbered 1..n with no gap');
        });
    }

    test('a hammer has no Cleave slot, and no slot fires Stun', () => {
        const g = fightGame('hammer');
        assert.ok(!labels(g).includes('Cleave'));
        assert.ok(!arcSlots(g).some(s => s.node.resolver === 'stunAttack'));
    });

    test('changing weapon mid-fight changes the slots and their numbers', () => {
        const g = fightGame('sword');
        assert.deepEqual(labels(g).slice(0, 3), ['Hit', 'Cleave', 'Ranged']);
        g.equipment.weapon = { damage: 10, id: 'w2', weaponClass: 'great_sword' };
        g._syncMeleeKit();
        assert.deepEqual(labels(g).slice(0, 3), ['Hit', 'Spin', 'Ranged']);
        g.equipment.weapon = { damage: 10, id: 'w3', weaponClass: 'dagger' };
        g._syncMeleeKit();
        assert.deepEqual(labels(g).slice(0, 2), ['Hit', 'Ranged']);
    });

    test('pressing 2 with a sword goes to Cleave', () => {
        const g = fightGame('sword');
        g.tap('Digit2');
        assert.equal(g.state, 'radial_menu');
        assert.equal(wm.selectedNode(g.wheel).key, 'cleave');
    });

    test('pressing 2 with a hammer never lands on Cleave or Stun', () => {
        const g = fightGame('hammer');
        g.tap('Digit2');
        if (g.state === 'radial_menu') {
            const n = wm.selectedNode(g.wheel);
            assert.notEqual(n.key, 'cleave');
            assert.notEqual(n.resolver, 'stunAttack');
        }
        assert.equal(arcSlots(g)[1].key, 'ranged');
    });

    test('pressing 2 with a great sword goes to Spin', () => {
        const g = fightGame('great_sword');
        g.tap('Digit2');
        assert.equal(wm.selectedNode(g.wheel).key, 'spin');
    });
});
