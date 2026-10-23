// enemy-throws.test.js — enemies throw the two poisons (plans/poisons.md stage 3).
//
// An enemy that carries Fire Blood or Sludge Brain throws it at you from 2
// tiles up to the item's range while it sees you. Only those two: it never
// throws the Sludge Sack it also carries. The item leaves its kit; the throw is
// its whole turn. Drives tickNpcState the way enemies.js does.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Enemy } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';
import { ITEMS } from '../game/items.js';

const room = ['...........', '...........', '...........', '...........', '...........', '...........', '...........', '...........'];
function makeGame(px, py) {
    const H = room.length, W = room[0].length;
    return {
        playerX: px, playerY: py, enemies: [], containers: [], turn: 0, _MOVE_MS: 150,
        map: { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && room[y][x] !== '#' },
        rng: { pick: (a) => a[0], float: () => 0.5 },
        damageTaken: 0, thrown: [],
        applyDamageToPlayer(d) { this.damageTaken += d; },
        _enemyThrow(npc, def) { this.thrown.push({ by: npc.id, item: def.id }); return `[${npc.type} throws ${def.id}]`; },
    };
}
const carrier = (g, loadout, over = {}) => {
    const e = new Enemy({ id: 'c1', type: 'Red Fungus', x: 5, y: 1, hp: 100, damage: 9, sightRange: 8, facing: 'S', loadout, ...over });
    g.enemies.push(e);
    return e;
};
const run = (g, e, beats = 2) => { const out = []; for (let t = 1; t <= beats; t++) out.push(...tickNpcState(g, e, t)); return out; };

describe('who throws what', () => {
    test('only Fire Blood and Sludge Brain are thrown by enemies', () => {
        const throwers = Object.values(ITEMS).filter(d => d.enemyThrows).map(d => d.id).sort();
        assert.deepEqual(throwers, ['fire_blood', 'sludge_brain']);
    });

    test('a carrier that sees you from 3 tiles throws Fire Blood instead of closing in', () => {
        const g = makeGame(5, 4);
        const e = carrier(g, ['sludge_sack', 'fire_blood']);
        const msgs = run(g, e, 1);
        assert.deepEqual(g.thrown, [{ by: 'c1', item: 'fire_blood' }]);
        assert.deepEqual(e.loadout, ['sludge_sack'], 'the throw leaves the kit; the Sludge Sack stays');
        assert.deepEqual([e.x, e.y], [5, 1], 'the throw IS the turn: it did not also move');
        assert.match(msgs.map(m => m.text || m).join(' '), /throws fire_blood/);
    });

    test('Sludge Brain is thrown the same way', () => {
        const g = makeGame(5, 4);
        const e = carrier(g, ['sludge_brain'], { type: 'Ghost Fungus' });
        run(g, e, 1);
        assert.deepEqual(g.thrown, [{ by: 'c1', item: 'sludge_brain' }]);
    });

    test('one throw per item: with it gone, the enemy goes back to fighting', () => {
        const g = makeGame(5, 4);
        const e = carrier(g, ['fire_blood']);
        run(g, e, 6);
        assert.equal(g.thrown.length, 1);
        assert.ok(g.damageTaken > 0, 'it closed in and swung once the throw was spent');
    });
});

describe('when it does not throw', () => {
    test('a Sludge Sack is never thrown', () => {
        const g = makeGame(5, 4);
        const e = carrier(g, ['sludge_sack']);
        run(g, e, 1);
        assert.equal(g.thrown.length, 0);
    });

    test('adjacent, it swings instead', () => {
        const g = makeGame(5, 2);
        const e = carrier(g, ['fire_blood']);
        run(g, e, 1);
        assert.equal(g.thrown.length, 0);
        assert.ok(g.damageTaken > 0);
    });

    test('out of the item\'s range, it closes in first', () => {
        const g = makeGame(5, 7);   // 6 tiles away; Fire Blood reaches 5
        const e = carrier(g, ['fire_blood']);
        run(g, e, 1);
        assert.equal(g.thrown.length, 0);
    });

    test('it cannot throw at what it cannot see — even mid-chase', () => {
        // Spot you first, so it is hunting; then you slip behind it.
        const g = makeGame(5, 1 + 6);   // out of throw range: it chases instead
        const e = carrier(g, ['fire_blood']);
        run(g, e, 1);
        assert.equal(e.fsmState, 'HOSTILE', 'the setup must leave it hunting you');
        g.playerX = e.x; g.playerY = e.y - 3;   // now 3 tiles BEHIND it, in range but unseen
        e._lastDx = 0; e._lastDy = 1;           // still facing south, away from you
        run(g, e, 1);
        assert.equal(g.thrown.length, 0);
    });
});

describe('the carriers', () => {
    const map = (z) => JSON.parse(readFileSync(new URL(`../game/${z}-map.json`, import.meta.url), 'utf8'));
    const kit = (z, id) => (map(z).enemies.find(e => e && e.id === id) || {}).loadout || [];
    test('the Clown and one sewer Red Fungus carry Fire Blood; a Ghost Fungus carries Sludge Brain', () => {
        assert.ok(kit('carnival', 'clown1').includes('fire_blood'));
        assert.ok(kit('sewer', 'e3').includes('fire_blood'));
        assert.ok(!kit('sewer', 'e4').includes('fire_blood'), 'only ONE Red Fungus');
        assert.ok(kit('sewer', 'e5').includes('sludge_brain'));
    });
    test('one pickup each: Fire Blood in the Carnival, Sludge Brain in the Sewer', () => {
        assert.ok(map('carnival').items.some(i => i.type === 'fire_blood'));
        assert.ok(map('sewer').items.some(i => i.type === 'sludge_brain'));
    });
});

describe('what lands on you (Game._enemyThrow)', () => {
    const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
    const at = mainSrc.indexOf('    _enemyThrow(npc, def) {');
    const body = mainSrc.slice(at + '    _enemyThrow'.length, mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const enemyThrow = new Function(`'use strict'; return function ${body}`)();
    const game = () => ({
        playerX: 5, playerY: 5, calls: [],
        _applyFireBlood(who, turns) { this.calls.push(['fire', who === this, turns]); },
        _layPuddle(from, to, kind, turns) { this.calls.push(['puddle', from, to, kind, turns]); return 3; },
    });
    const thrower = { id: 'c1', type: 'Red Fungus', x: 5, y: 2 };

    test('Fire Blood: you burn and get fire blood, for its 5 turns; it faces you', () => {
        const g = game();
        const e = { ...thrower };
        const line = enemyThrow.call(g, e, ITEMS.fire_blood);
        assert.deepEqual(g.calls, [['fire', true, 5]]);
        assert.deepEqual([e._lastDx, e._lastDy], [0, 1]);
        assert.match(line, /Red Fungus throws Fire Blood at you/);
    });
    test('Sludge Brain: a puddle fanned from the thrower toward you', () => {
        const g = game();
        const line = enemyThrow.call(g, { ...thrower, type: 'Ghost Fungus' }, ITEMS.sludge_brain);
        assert.deepEqual(g.calls, [['puddle', { x: 5, y: 2 }, { x: 5, y: 5 }, 'sludge', 8]]);
        assert.match(line, /sludge puddle covers 3 tiles/);
    });
});
