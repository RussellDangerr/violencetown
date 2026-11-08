// RH1 - choosing Hit on someone who is not fighting you swings at once.
// Drives the game's own keydown listener (real _bindInput on a stand-in document) with real
// arrow and Enter keys, on a real Game; only the page-bound parts are stubbed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../game/main.js';
globalThis.document = new EventTarget();
globalThis.window = globalThis.window || new EventTarget();

class Key extends Event {
    constructor(type, code, repeat = false) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = repeat;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}
const down = (code, repeat) => document.dispatchEvent(new Key('keydown', code, repeat));
const up = (code) => document.dispatchEvent(new Key('keyup', code));
const tap = (code) => { down(code); up(code); };

const FOE = { x: 6, y: 5 };
function makeGame(allegiance) {
    globalThis.document = new EventTarget();   // one page per game: listeners never leak across tests
    const g = new Game();
    const foe = { x: FOE.x, y: FOE.y, allegiance, name: 'Bystander',
                  entity: { hp: 100, isAlive() { return this.hp > 0; } } };
    Object.assign(g, {
        state: 'idle', facing: 'right', playerX: 5, playerY: 5,
        enemies: [foe], groundItems: [], containers: [], examinables: [],
        equipment: { weapon: { damage: 10, damageType: 'blunt' } },
        map: { getTile: () => 0, isWalkable: () => true },
    });
    g._animating = false; g.turns = 0;
    g._render = () => {}; g._log = () => {}; g._skipLootReel = () => {};
    g._advanceWorld = () => { g.turns++; };
    g.combatAttack = (npc, dmg) => { npc.entity.hp -= dmg; };
    g._bindInput();
    return { g, foe };
}

describe('rh1: hitting a bystander', () => {
    test('Hit sits at the bottom of the list, then swings at once on Enter', () => {
        const { g, foe } = makeGame('neutral');
        g._openTargetList(FOE.x, FOE.y);
        assert.equal(g.state, 'target_list');
        const keys = g.targetList.verbs.map(v => v.key);
        assert.equal(keys[keys.length - 1], 'cancel');
        assert.deepEqual(keys.slice(-3), ['hit', 'examine', 'cancel'], 'Hit sinks to the bottom, above only Examine and Cancel');
        // arrow up from the top wraps to Cancel, then Examine, then Hit
        tap('ArrowUp'); tap('ArrowUp'); tap('ArrowUp');
        assert.equal(g.targetList.verbs[g.targetList.sel].key, 'hit');
        tap('Enter');
        assert.ok(!g.targetList || g.state !== 'target_list' || !g.targetList.verbs.some(v => /Really/.test(v.label)), 'no confirmation row');
        assert.equal(g.state, 'idle', 'the list is gone');
        assert.equal(foe.entity.hp, 90, 'the swing landed at once');
    });

    test('no row ever asks "Really hit"', () => {
        const { g } = makeGame('neutral');
        g._openTargetList(FOE.x, FOE.y);
        tap('ArrowUp'); tap('ArrowUp'); tap('ArrowUp');
        const labels = () => g.targetList.verbs.map(v => v.label).join('|');
        assert.ok(!/Really/.test(labels()));
    });

    test('a held Enter that opened the list does not swing', () => {
        const { g, foe } = makeGame('neutral');
        g._openTargetList(FOE.x, FOE.y);
        tap('ArrowUp'); tap('ArrowUp'); tap('ArrowUp');   // Hit selected
        down('Enter', true); down('Enter', true); // OS key-repeat of the held key
        down('Space', true);
        assert.equal(g.state, 'target_list', 'still open');
        assert.equal(foe.entity.hp, 100, 'nothing was hit');
    });

    test('Cancel still closes without a swing', () => {
        const { g, foe } = makeGame('neutral');
        g._openTargetList(FOE.x, FOE.y);
        tap('ArrowUp');                           // Cancel
        tap('Enter');
        assert.equal(g.state, 'idle');
        assert.equal(foe.entity.hp, 100);
    });
});
