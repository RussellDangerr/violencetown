// boss-names-log.test.js — FX47: the log lines that used to print a boss's type
// now print its one name (plans/fx47-boss-names-in-log.md). The lines are
// PRINTED here (give, hostile talk, shove, spend, kit, DoT, menu label) for the
// Were-Rat and an Act 2 boss; a source sweep backs it up.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { Enemy, spawnEnemy } from '../game/enemies.js';
import { logName, tickNpcState } from '../game/npc.js';
import { BUFF_DEFS } from '../game/buffs.js';
import { applyGive } from '../game/give-action.js';
import { ITEMS } from '../game/items.js';
import { ITEM_USES } from '../game/item-uses.js';
import { resolveExamine } from '../game/examine.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const load = (f) => JSON.parse(readFileSync(new URL(`../game/${f}`, import.meta.url), 'utf8'));
const boss = (file, slot) => spawnEnemy(resolveSpawn(load(file).enemies.find(e => e.slot === slot), defaultPicks()));
const wererat = () => boss('sewer-map.json', 'sewer.boss');
const act2 = () => boss('factory-map.json', 'factory.boss');
const goon = () => new Enemy({ id: 'g1', type: 'Violet Fungus', x: 5, y: 5, gold: 0 });

// ── main.js, lifted (the live source, run against a stand-in game) ───────────
const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const shoveNpc = liveMethod('_shoveNpc(enemy, dir) {', { audio: { playSfx() {} }, stepEntity() {} });
const pickDialogueChoice = liveMethod('_pickDialogueChoice(choice) {', {
    getDialogue: () => null, transferGold() {}, applyDispositionDelta() {},
    DIALOGUE_HOSTILE_AT: 0, audio: { playSfx() {} },
});
const talkGame = (npc, lines) => ({
    gold: 0, _dialogueNpc: npc, _dialogueReply: '', _dialogueCursor: 0, _render() {},
    _closeDialogue() {}, _log: (t) => lines.push(t), _onEntityHarmed() {}, _dialogueChoices: () => [],
});
const fightGame = (b) => ({
    playerX: 5, playerY: 3, enemies: [b], containers: [], turn: 0, _MOVE_MS: 150,
    map: { isWalkable: () => true }, rng: { pick: (a) => a[0], float: () => 0.5 },
    applyDamageToPlayer() {},
});

describe('FX47 logName', () => {
    test('the Were-Rat and an Act 2 boss go by their one name, never the type', () => {
        const w = wererat(), a = act2();
        assert.ok(w.boss && a.boss);
        assert.equal(logName(w), 'Were-Rat');
        assert.notEqual(logName(a), a.type);
        assert.equal(logName(a), a.shownName);
    });
    test('a non-boss reads exactly as before', () => {
        const g = goon();
        assert.equal(logName(g), g.name ?? g.type);
        assert.equal(logName({ name: 'Sam', type: 'Violencian' }), 'Sam');
        assert.equal(logName({ type: 'Violencian' }), 'Violencian');
    });
});

const BOSSES = { 'the Were-Rat': wererat, 'an Act 2 boss': act2 };

for (const [label, make] of Object.entries(BOSSES)) {
    describe(`FX47 printed lines — ${label}`, () => {
        const onlyName = (b, text) => {
            assert.ok(text.includes(b.shownName), `"${text}" should carry ${b.shownName}`);
            assert.ok(b.shownName.includes(b.type) || !text.includes(b.type),
                `"${text}" must not carry the type "${b.type}"`);
        };

        test('the E-key line and panel title name it', () => {
            const b = make(); b.x = 2; b.y = 2;
            const r = resolveExamine({ enemies: [b] }, 2, 2);
            onlyName(b, r.body);
            assert.equal(r.title, b.shownName);
        });

        test('give lines name it', () => {
            const item = { id: 'x', name: 'Thing' };
            const b1 = make(); b1.bribeable = false;
            onlyName(b1, applyGive(item, b1).log);
            for (const onFlip of ['becomeAlly', 'offerDiscount', 'other']) {
                const b = make(); b.bribeable = true; b.values = { x: 8 }; b.flipThreshold = 1; b.onFlip = onFlip;
                b.disposition = 0;
                const r = applyGive(item, b);
                assert.ok(r.log, `${onFlip}: a line came out`);
                onlyName(b, r.log);
            }
        });

        test('a talk that turns hostile names it', () => {
            const b = make(); b.disposition = -100;
            const lines = [];
            pickDialogueChoice.call(talkGame(b, lines), { id: 'rude' });
            assert.equal(lines.length, 1);
            assert.match(lines[0], /has heard enough/);
            onlyName(b, lines[0]);
        });

        test('shoving it names it, heavy or loose', () => {
            const b = make();
            for (const heavy of [true, false]) {
                const lines = [];
                shoveNpc.call({ _log: (t) => lines.push(t), _render() {}, _bounceOff() {}, _MOVE_MS: 1,
                    _isHeavy: () => heavy, _shoveDestination: () => ({ x: 1, y: 1 }) }, b, { x: 1, y: 0 });
                assert.ok(lines.length, 'a line was printed');
                lines.forEach(t => onlyName(b, t));
            }
        });

        test('a spend line names it', () => {
            const b = make(); b.loadout = []; b.gold = 100; b.entity.hp = 40; b.x = 5; b.y = 2; b.facing = 'S';
            const lines = tickNpcState(fightGame(b), b, 1).map(m => m.text ?? m);
            assert.ok(lines.some(t => /GP/.test(t)), `a spend line came out (got ${JSON.stringify(lines)})`);
            lines.forEach(t => onlyName(b, t));
        });

        test('a kit line names it', () => {
            const b = make();
            const kit = Object.values(ITEMS).find(d => d.effect === 'heal' && d.healAmount > 0);
            assert.ok(kit, 'a heal item exists');
            b.loadout = [kit]; b.gold = 0; b.entity.hp = 10; b.x = 5; b.y = 2; b.facing = 'S';
            const lines = tickNpcState(fightGame(b), b, 1).map(m => m.text ?? m);
            assert.ok(lines.some(t => /digs out/.test(t)), `a kit line came out (got ${JSON.stringify(lines)})`);
            lines.forEach(t => onlyName(b, t));
        });

        test('a DoT tick names it', () => {
            const b = make();
            b.entity = { hp: 50, maxHp: 50, alive: true, isAlive() { return this.alive; } };
            const lines = [];
            BUFF_DEFS.poison.onTick(b, { _log: (t) => lines.push(t), enemies: [b], floatText() {}, spawnSplat() {} },
                { id: 'poison', turns: 2, dmg: 3 });
            assert.ok(lines.length, 'the tick logged a line');
            lines.forEach(t => onlyName(b, t));
        });

        test('the scrub menu label names it', () => {
            const use = ITEM_USES.find(u => u.id === 'soap-on-sludge');
            assert.ok(use, 'the scrub use exists');
            onlyName(make(), use.label({ npc: make() }));
        });
    });
}

describe('FX47 a non-boss reads exactly as before', () => {
    test('give lines keep "The <type>"', () => {
        const g = goon(); g.bribeable = false;
        assert.equal(applyGive({ id: 'x', name: 'Thing' }, g).log, '[The Violet Fungus ignores your offering.]');
        const h = goon(); h.bribeable = true; h.values = { x: 8 }; h.flipThreshold = 1; h.onFlip = 'offerDiscount';
        assert.match(applyGive({ id: 'x', name: 'Thing' }, h).log, /^\[Violet Fungus accepts the Thing\./);
    });
    test('hostile talk keeps name-or-type', () => {
        const g = goon(); g.disposition = -100;
        const lines = [];
        pickDialogueChoice.call(talkGame(g, lines), { id: 'r' });
        assert.equal(lines[0], '[Violet Fungus has heard enough.]');
    });
    test('the scrub label keeps name-or-type', () => {
        const use = ITEM_USES.find(u => u.id === 'soap-on-sludge');
        assert.equal(use.label({ npc: goon() }), 'Scrub Violet Fungus');
    });
});

describe('FX47 examine, non-boss', () => {
    test('a non-boss reads exactly as before', () => {
        const g = goon(); g.x = 2; g.y = 2;
        const r = resolveExamine({ enemies: [g] }, 2, 2);
        assert.equal(r.title, g.name ?? g.type);
        assert.ok(r.body.startsWith(`[${g.name ?? g.type}. `));
    });
});

describe('FX47 source sweep', () => {
    // A line that builds visible text from a bare type, or from a name-or-type
    // fallback (`??` or `||`), without the boss-first form or logName/bossOr.
    // Out of scope by ruling: the worker lines ("A <type> drops/pockets") and
    // the container branch.
    const FILES = ['npc.js', 'buffs.js', 'main.js', 'give-action.js', 'item-uses.js', 'examine.js'];
    const ALLOWED = [/console\.warn/, /A \$\{npc\.type\} (drops|pockets)/, /pry open the/, /isn't interested in what you've got/];
    const BARE = [
        /\$\{[^}]*\.name \?\? [^}]*\.type[^}]*\}/,
        /\$\{[^}]*\.name \|\| [^}]*\.type[^}]*\}/,
        /\$\{(?:recipient|enemy|victim|target|owner)\.type\}/,
        /\$\{npc\.type\}/,
    ];
    test('no touched file prints a boss type through a `||`, `??` or bare ${x.type}', () => {
        for (const f of FILES) {
            const src = readFileSync(new URL(`../game/${f}`, import.meta.url), 'utf8');
            const bad = src.split('\n').filter(l => BARE.some(r => r.test(l))
                && !/\.boss && /.test(l) && !/logName|bossOr|theName/.test(l)
                && !ALLOWED.some(r => r.test(l)));
            assert.deepEqual(bad.map(l => l.trim()), [], `${f} still prints a boss's type`);
        }
    });
});
