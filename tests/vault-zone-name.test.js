// vault-zone-name.test.js — the vault carries a zone name of its own, not the
// First Blood Bank's (plans/fx40-vault-own-name.md). Until it is named, that
// name is the placeholder [TEXT].

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GameMap } from '../game/map.js';
import { overworldZone } from '../game/world-map.js';
import { validateContent } from '../game/content-validate.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');
const load = (f) => JSON.parse(readFileSync(join(GAME, f), 'utf8'));

describe('the vault\'s own zone name', () => {
    const bankData = load('bank-map.json');
    const vaultData = load('vault-map.json');
    const bank = new GameMap(bankData, 'bank-map.json');
    const vault = new GameMap(vaultData, 'vault-map.json');

    test('the vault is not named for the bank', () => {
        assert.notEqual(vault.zoneName, bank.zoneName);
        assert.equal(bank.zoneName, 'FIRST BLOOD BANK');
    });

    test('its name is still the placeholder', () => {
        assert.equal(vault.zoneName, '[TEXT]');
    });

    test('"you are here" lands Downtown in the vault, as in the bank', () => {
        assert.equal(overworldZone(vault.zoneName), 'DOWNTOWN');
        assert.equal(overworldZone(bank.zoneName), 'DOWNTOWN');
    });

    test('content-integrity raises no zone-name warning for either map', () => {
        const { warnings } = validateContent([
            { file: 'bank-map.json', data: bankData },
            { file: 'vault-map.json', data: vaultData },
        ]);
        const zoneWarnings = warnings.filter(w => /zoneName/.test(w));
        assert.deepEqual(zoneWarnings, []);
    });

    test('walking through a door logs the new map\'s own zone name', () => {
        const src = readFileSync(join(GAME, 'main.js'), 'utf8');
        assert.ok(src.includes('this._log(`[Entered ${this.map.zoneName}]`);'),
            'the entry line reads the zone name of the map you walked into');
        assert.equal(`[Entered ${vault.zoneName}]`, '[Entered [TEXT]]');
        assert.equal(`[Entered ${bank.zoneName}]`, '[Entered FIRST BLOOD BANK]');
    });
});
