// struck-reaction.test.js — an enemy you hit turns to face you (ruling Q1-9).
//
// The autoplay found it: hit from the side, the Wererat stayed `suspicious`
// for 12 blows — never turned, never fought back, never healed. Melee is noise,
// and emitNoise marks every listener suspicious AND resets its glimpse count;
// the ladder only turns an IDLE enemy after two flank glimpses, and a
// suspicious one never. So each blow re-armed the very state that ignored it.
//
// Caelan, 2026-09-21: "they would turn to face you as soon as they're able but
// it might take them a second or they might want to drink a potion first."
// A blow is not a glimpse — it says exactly where you are. On its next turn a
// struck enemy turns to face the blow (that is its turn), or, hurt, uses its
// kit first and turns after. Once it sees you, the ordinary ladder takes over.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Enemy } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';
import { struck, emitNoise, NOISE } from '../game/perception.js';

function makeGame(playerX, playerY) {
    return {
        playerX, playerY, enemies: [], containers: [], turn: 0, _MOVE_MS: 150,
        map: { isWalkable: (x, y) => x >= 0 && y >= 0 && x < 11 && y < 9 },
        rng: { pick: (arr) => arr[0], float: () => 0.5 },
        damageTaken: 0,
        applyDamageToPlayer(dmg) { this.damageTaken += dmg; },
    };
}
function guardAt(g, x, y, over = {}) {
    const e = new Enemy({ id: 'g1', type: 'guard', x, y, sightRange: 8, damage: 12, facing: 'S', ...over });
    g.enemies.push(e);
    return e;
}
// One blow from the player, as main.js lands it: the noise, then the strike.
function hit(g, e) {
    emitNoise(g.enemies, g.playerX, g.playerY, NOISE.melee);
    struck(e, { x: g.playerX, y: g.playerY });
}

describe('an enemy you hit turns to face you', () => {
    test('the loophole, pinned: hit from the flank every turn, it turns, then fights back', () => {
        const g = makeGame(4, 4);
        const e = guardAt(g, 5, 4);               // facing S; the player is on its west flank
        hit(g, e);
        tickNpcState(g, e, 1);
        assert.deepEqual([e._lastDx, e._lastDy], [-1, 0], 'its next turn turns it to face the blow');
        assert.equal(g.damageTaken, 0, 'turning is the turn');
        hit(g, e);
        tickNpcState(g, e, 2);
        assert.equal(e.state, 'chasing', 'facing you, it sees you');
        assert.ok(g.damageTaken > 0, 'and fights back');
    });

    test('hit from behind, the same', () => {
        const g = makeGame(5, 3);
        const e = guardAt(g, 5, 4);               // the player is due north, in its blind spot
        hit(g, e);
        tickNpcState(g, e, 1);
        assert.deepEqual([e._lastDx, e._lastDy], [0, -1]);
        hit(g, e);
        tickNpcState(g, e, 2);
        assert.ok(g.damageTaken > 0);
    });

    test('hurt, with something in its kit, it uses that first — then turns', () => {
        const g = makeGame(4, 4);
        const e = guardAt(g, 5, 4, { loadout: ['bandage'] });
        e.entity.hp = 40;
        hit(g, e);
        tickNpcState(g, e, 1);
        assert.ok(e.entity.hp > 40, 'it treats itself first');
        assert.deepEqual(e.loadout, [], 'using up the kit');
        assert.deepEqual([e._lastDx, e._lastDy], [0, 1], 'still facing away');
        tickNpcState(g, e, 2);                    // no new blow: it still remembers the last one
        assert.deepEqual([e._lastDx, e._lastDy], [-1, 0], 'then turns to face the blow');
        assert.equal(g.damageTaken, 0);
    });

    test('an enemy already fighting you is not interrupted by a blow', () => {
        const g = makeGame(5, 5);
        const e = guardAt(g, 5, 4);
        e.state = 'chasing';                      // the constructor always starts an enemy idle
        struck(e, { x: 5, y: 5 });
        assert.equal(e._struckBy, undefined);
    });

    test('the game lands every player blow through struck()', () => {
        const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
        const body = mainSrc.slice(mainSrc.indexOf('_onEntityHarmed(target,'), mainSrc.indexOf('_onEntityHarmed(target,') + 1400);
        assert.match(body, /struck\(target, \{ x: this\.playerX, y: this\.playerY \}\)/);
    });
});
