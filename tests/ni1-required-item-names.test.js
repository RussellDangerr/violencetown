// ni1-required-item-names.test.js — the three Act 2 required items carry their names
// (plans/ni1-required-item-names.md). Only the display name changed: ids, saves and the
// vault door are untouched.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { SLOTS } from '../game/slots.js';
import { ITEMS } from '../game/items.js';
import { carriesAll } from '../game/map.js';
import { resolveItemDef } from '../game/item-registry.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');
const bank = JSON.parse(readFileSync(join(GAME, 'bank-map.json'), 'utf8'));
const vaultGate = bank.transitions.find(t => t.toMap === 'vault-map.json');

// Which boss slot hands over which name, read from the slot table, not assumed.
const BY_SLOT = {
    'carnival.boss': 'Stuffed Animal',
    'factory.boss': 'Flux Capacitor',
    'graveyard.boss': 'Soul Crystal',
};

describe('each Act 2 boss hands over the item with its zone\'s name', () => {
    for (const [slot, name] of Object.entries(BY_SLOT)) {
        test(`${slot} -> ${name}`, () => {
            const id = SLOTS[slot].requiredDrop;
            assert.equal(ITEMS[id].name, name);
            // The death handler's generic log line prints this name.
            assert.equal(`[${ITEMS[id].name} dropped.]`, `[${name} dropped.]`);
        });
    }

    test('descriptions stay [TEXT] and icons stay the magenta placeholder', () => {
        for (const slot of Object.keys(BY_SLOT)) {
            const it = ITEMS[SLOTS[slot].requiredDrop];
            assert.equal(it.description, '[TEXT]');
            assert.equal(it.fallbackColor, '#ff00ff');
        }
    });
});

describe('a save written before the names existed', () => {
    // A save stores { id, count }; loadInto rehydrates through resolveItemDef.
    const oldSaveBag = ['act2_item_a', 'act2_item_b', 'act2_item_c'].map(id => ({ id, count: 1 }));
    const bag = oldSaveBag.map(s => ({ itemDef: resolveItemDef(s.id), count: s.count }));

    test('loads and shows the new names', () => {
        assert.deepEqual(bag.map(s => s.itemDef.name), ['Stuffed Animal', 'Flux Capacitor', 'Soul Crystal']);
    });

    test('still opens the vault door', () => {
        assert.deepEqual(vaultGate.requires, ['act2_item_a', 'act2_item_b', 'act2_item_c']);
        assert.equal(carriesAll(vaultGate.requires, bag), true);
        assert.equal(carriesAll(vaultGate.requires, bag.slice(0, 2)), false);
    });
});

describe('the old placeholder names are gone from the game', () => {
    test('no file under game/ still reads ITEM A, B or C', () => {
        const hits = [];
        const walk = (dir) => {
            for (const e of readdirSync(dir, { withFileTypes: true })) {
                const p = join(dir, e.name);
                if (e.isDirectory()) { walk(p); continue; }
                if (!/\.(js|json|html|md)$/.test(e.name)) continue;
                if (/\[ITEM [ABC]\]/.test(readFileSync(p, 'utf8'))) hits.push(p);
            }
        };
        walk(GAME);
        assert.deepEqual(hits, []);
    });
});
