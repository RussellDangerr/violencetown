// vault-door-look.test.js — the bank's vault door reads as shut until you carry
// the three Act 2 items (plans/fin1b-vault-door-look.md): no exit glow, arrow or
// hint while locked, all three once it opens. Every other exit is unchanged.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { exitMarked } from '../game/renderer.js';
import { PROP_SPRITES } from '../game/sprites.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');
const load = (f) => JSON.parse(readFileSync(join(GAME, f), 'utf8'));
const bag = (...ids) => ids.map(id => ({ itemDef: { id } }));
const ITEMS3 = ['act2_item_a', 'act2_item_b', 'act2_item_c'];
const vaultGate = () => load('bank-map.json').transitions.find(t => t.toMap === 'vault-map.json');

describe('the vault door while locked', () => {
    test('with an empty bag, or with only some of the three, it wears no markers', () => {
        const t = vaultGate();
        assert.equal(exitMarked(t, []), false);
        assert.equal(exitMarked(t, bag('act2_item_a')), false);
        assert.equal(exitMarked(t, bag('act2_item_a', 'act2_item_b')), false);
        assert.equal(exitMarked(t, bag('act2_item_a', 'act2_item_b', 'rock')), false);
    });

    test('with all three it wears them', () => {
        assert.equal(exitMarked(vaultGate(), bag(...ITEMS3)), true);
        assert.equal(exitMarked(vaultGate(), bag(...ITEMS3, 'rock')), true);
    });

    test('a missing bag is a locked door, not a crash', () => {
        assert.equal(exitMarked(vaultGate(), undefined), false);
    });
});

describe('every other exit is untouched', () => {
    test('a transition with no requires always wears its markers', () => {
        assert.equal(exitMarked({ x: 1, y: 1, toMap: 'x.json' }, []), true);
        assert.equal(exitMarked({ x: 1, y: 1, toMap: 'x.json', requires: [] }, []), true);
    });

    test('the vault door is the only gated transition in any map', () => {
        const gated = [];
        for (const f of readdirSync(GAME).filter(n => n.endsWith('-map.json'))) {
            for (const t of (load(f).transitions || [])) if (t.requires) gated.push(`${f}:${t.x},${t.y}`);
        }
        assert.deepEqual(gated, ['bank-map.json:6,1']);
    });
});

describe('the door stays a door of its own', () => {
    test('the bank draws the vault door prop on the gate tile, walkable, not the street door', () => {
        const bank = load('bank-map.json');
        const gate = vaultGate();
        const prop = bank.props.find(p => p.type === 'vaultDoor');
        assert.deepEqual([prop.x, prop.y, prop.solid], [gate.x, gate.y, false]);
        assert.ok(PROP_SPRITES.vaultDoor);
    });
});

describe('the exit pass draws only the marked exits', () => {
    test('_drawTransitions filters transitions through exitMarked', () => {
        const src = readFileSync(join(GAME, 'renderer.js'), 'utf8');
        assert.match(src, /\(game\.map\?\.transitions \|\| \[\]\)\.filter\(t => exitMarked\(t, game\.inventory\)\)/);
    });
});
