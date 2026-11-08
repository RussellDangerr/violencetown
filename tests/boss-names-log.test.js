// boss-names-log.test.js — FX47: the log lines that used to print a boss's type
// now print its one name (plans/fx47-boss-names-in-log.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { Enemy, spawnEnemy } from '../game/enemies.js';
import { logName } from '../game/npc.js';
import { BUFF_DEFS } from '../game/buffs.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const load = (f) => JSON.parse(readFileSync(new URL(`../game/${f}`, import.meta.url), 'utf8'));
const boss = (file, slot) => spawnEnemy(resolveSpawn(load(file).enemies.find(e => e.slot === slot), defaultPicks()));
const wererat = () => boss('sewer-map.json', 'sewer.boss');
const act2 = () => boss('factory-map.json', 'factory.boss');
const goon = () => new Enemy({ id: 'g1', type: 'Violet Fungus', x: 5, y: 5, gold: 0 });

describe('FX47 logName', () => {
    test('the Were-Rat and an Act 2 boss go by their one name, never the type', () => {
        const w = wererat(), a = act2();
        assert.ok(w.boss && a.boss);
        assert.equal(logName(w), 'Were-Rat');
        assert.notEqual(logName(a), a.type);
        assert.equal(logName(a), a.shownName);
        assert.doesNotMatch(logName(w), /^Wererat$/);
    });
    test('a non-boss reads exactly as before', () => {
        const g = goon();
        assert.equal(logName(g), g.name ?? g.type);
        assert.equal(logName({ name: 'Sam', type: 'Violencian' }), 'Sam');
        assert.equal(logName({ type: 'Violencian' }), 'Violencian');
    });
});

describe('FX47 the lines themselves', () => {
    test('a DoT tick on the Were-Rat names it Were-Rat', () => {
        const w = wererat();
        w.entity = { hp: 50, maxHp: 50, alive: true, isAlive() { return this.alive; } };
        const lines = [];
        const game = { _log: (t) => lines.push(t), enemies: [w], floatText() {}, spawnSplat() {} };
        const buff = { id: 'poison', turns: 2, dmg: 3 };
        BUFF_DEFS.poison?.onTick?.(w, game, buff);
        assert.ok(lines.length, 'the tick logged a line');
        assert.match(lines.join(''), /Were-Rat/);
        assert.doesNotMatch(lines.join(''), /Wererat/);
    });

    test('no log line in npc.js, buffs.js or main.js still builds a name from `name ?? type`', () => {
        for (const f of ['npc.js', 'buffs.js', 'main.js']) {
            const src = readFileSync(new URL(`../game/${f}`, import.meta.url), 'utf8');
            const bad = src.split('\n').filter(l => /\$\{[^}]*\.name \?\? [^}]*\.type\}/.test(l) || /\(owner\.name \?\? owner\.type\)/.test(l));
            assert.deepEqual(bad, [], `${f} still prints a bare name ?? type in a line`);
        }
    });
});
