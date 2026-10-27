// ice-cone-machine.test.js — the Factory's unpaid bill and the diner's ice cone
// machine (plans/ic6-factory-bill-ice-cone-machine.md).
//
// The manager stands in the Factory and will not let the part go until the bill
// is paid. Used on the diner's machine, the part is spent and the machine makes a
// Tiger's Blood Ice Cone. The dialogue is played through main.js's own
// _dialogueChoices and _pickDialogueChoice, lifted out and run against a
// stand-in game, so what is tested is what the game runs; the machine through
// item-uses.js's contextualUses, the same call the item overlay makes.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getDialogue, FACTORY_BILL_GP, MACHINE_PART } from '../game/dialogue.js';
import { ITEMS } from '../game/items.js';
import { ITEM_USES, contextualUses } from '../game/item-uses.js';
import { transferGold } from '../game/trade.js';
import { applyDispositionDelta } from '../game/give-action.js';
import { QuestEngine } from '../game/quests.js';
import { serialize, migrate } from '../game/save.js';
import { TILE_BY_ID } from '../game/data.js';
import { ENEMY_SPRITES, itemSprite, UNKNOWN_ITEM_SPRITE } from '../game/sprites.js';
import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const GAME = new URL('../game/', import.meta.url);
const mapData = (file) => JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));
const factory = mapData('factory-map.json');
const diner = mapData('diner-map.json');
const tileAt = (m, x, y) => m.tiles[y * m.width + x];
const CONE = 'tigers_blood_ice_cone';
const MACHINE = 'diner_ice_cone_machine';

// ── main.js, lifted ─────────────────────────────────────────────────────────
const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const hostileAt = Number(/const DIALOGUE_HOSTILE_AT = (-?\d+);/.exec(mainSrc)[1]);
const dialogueChoices = liveMethod('_dialogueChoices() {', { getDialogue });
const pickDialogueChoice = liveMethod('_pickDialogueChoice(choice) {', {
    getDialogue, transferGold, applyDispositionDelta, DIALOGUE_HOSTILE_AT: hostileAt,
    audio: { playSfx() {} },
});

const spawn = factory.enemies.find(e => e.id === 'factory-manager');
const machine = (diner.examinables || []).find(e => e.id === MACHINE);
const manager = () => {
    const e = spawnEnemy(resolveSpawn(spawn, defaultPicks()));
    return { id: e.id, dialogueId: e.dialogueId, gold: e.gold ?? 0, disposition: e.disposition ?? 0 };
};

// A stand-in game with a bag of `size` slots. _grantItem / _removeFromSlot
// keep main.js's contract: a grant fills the first free slot or fails on a full
// bag; a removal drops one from the stack.
function standIn({ gold = 0, size = 4, fill = 0 } = {}) {
    const g = {
        gold, log: [], turns: 0, selectedSlot: -1,
        inventory: Array.from({ length: size }, (_, i) => (i < fill ? { itemDef: ITEMS.rock, count: 1 } : null)),
        playerX: 0, playerY: 0, facing: 'down',
        _dialogueNpc: null, _dialogueReply: '', _dialogueCursor: 0,
        _render() {}, _closeDialogue() { this._dialogueNpc = null; }, _log(m) { this.log.push(m); },
        _onEntityHarmed() {}, emitGameEvent() {}, _advanceWorld() { this.turns++; },
        _grantItem(id) {
            const i = this.inventory.findIndex(s => !s);
            if (i < 0 || !ITEMS[id]) return false;
            this.inventory[i] = { itemDef: ITEMS[id], count: 1 };
            return true;
        },
        _removeFromSlot(i) {
            const s = this.inventory[i];
            if (s && --s.count <= 0) this.inventory[i] = null;
        },
        _targetAt: () => null,
        _dialogueChoices: dialogueChoices, _pickDialogueChoice: pickDialogueChoice,
    };
    g.questEngine = new QuestEngine(g);
    g.npc = manager();
    g._dialogueNpc = g.npc;
    return g;
}
const offered = (g) => { g._dialogueNpc = g.npc; return g._dialogueChoices().map(c => c.id); };
const pick = (g, id) => {
    g._dialogueNpc = g.npc;
    const c = g._dialogueChoices().find(x => x.id === id);
    assert.ok(c, `the manager does not offer '${id}' (offers: ${offered(g).join(', ')})`);
    g._pickDialogueChoice(c);
    return g._dialogueReply;
};
const slotOf = (g, id) => g.inventory.findIndex(s => s && s.itemDef.id === id);
const holds = (g, id) => slotOf(g, id) >= 0;
const flags = (g) => g.questEngine.state.flags;

// Stand at the diner below the machine, facing it, the way the player does.
function atMachine(g) {
    g.playerX = machine.x; g.playerY = machine.y + 1; g.facing = 'up';
    g._targetAt = (x, y) => (x === machine.x && y === machine.y
        ? { x, y, npc: null, item: null, examinable: machine, container: null } : null);
    return g;
}
// What the item overlay does on a "use this on that" row: re-resolve, apply.
function useOnMachine(g) {
    const slot = slotOf(g, MACHINE_PART);
    const uses = contextualUses(ITEMS[MACHINE_PART], g);
    assert.equal(uses.length, 1, 'the part offers nothing at the machine');
    uses[0].apply(g, uses[0].target, { slot });
}

describe('the Factory manager', () => {
    test('stands in the Factory at 24,8, on ground, with a look the game already draws', () => {
        assert.ok(spawn, 'no manager in the Factory');
        assert.deepEqual([spawn.x, spawn.y], [24, 8]);
        assert.ok(TILE_BY_ID[tileAt(factory, spawn.x, spawn.y)].walkable, 'he stands in a wall');
        assert.ok(ENEMY_SPRITES[spawn.type], `${spawn.type} has no picture`);
        assert.equal(spawn.name, '[Factory Manager]');
        assert.ok(!factory.enemies.some(e => e !== spawn && e.x === spawn.x && e.y === spawn.y), 'someone else stands there');
    });

    test('talks, every line a placeholder', () => {
        const d = getDialogue(spawn.dialogueId);
        assert.ok(d, 'he has nothing to say');
        assert.equal(d.name, '[Factory Manager]');
        assert.equal(d.greeting, '[TEXT]');
        for (const c of d.choices) {
            assert.match(c.label, /^\[TEXT/, `${c.id}: label`);
            assert.equal(c.reply, '[TEXT]', `${c.id}: reply`);
        }
    });
});

describe('the bill', () => {
    test('is 100 GP (ICR5)', () => {
        assert.equal(FACTORY_BILL_GP, 100);
        const pay = getDialogue('factory_manager').choices.find(c => c.id === 'pay');
        assert.equal(pay.cost, FACTORY_BILL_GP);
    });

    test('short of it, paying is refused: no gold moves and no part', () => {
        const g = standIn({ gold: FACTORY_BILL_GP - 1 });
        pick(g, 'pay');
        assert.equal(g.gold, FACTORY_BILL_GP - 1);
        assert.equal(g.npc.gold, 0);
        assert.ok(!flags(g).factoryBillPaid);
        assert.ok(!holds(g, MACHINE_PART));
        assert.match(g._dialogueReply, /can't cover/);
        assert.ok(offered(g).includes('pay'), 'the bill is still on offer');
    });

    test('no choice hands over the part before the bill is paid', () => {
        const g = standIn({ gold: 0 });
        for (const id of offered(g).filter(id => id !== 'pay')) pick(g, id);
        assert.ok(!holds(g, MACHINE_PART));
    });

    test('paying moves exactly the bill to him, once, and the part goes in your bag', () => {
        const g = standIn({ gold: 250 });
        pick(g, 'pay');
        assert.equal(g.gold, 250 - FACTORY_BILL_GP);
        assert.equal(g.npc.gold, FACTORY_BILL_GP);
        assert.equal(flags(g).factoryBillPaid, true);
        assert.ok(holds(g, MACHINE_PART), 'no part');
        assert.deepEqual(offered(g), ['paid'], 'he asks to be paid twice, or offers another part');
    });

    test('paying with a full bag still owes you the part, and he hands it over later', () => {
        const g = standIn({ gold: FACTORY_BILL_GP, size: 2, fill: 2 });
        pick(g, 'pay');
        assert.equal(g.gold, 0);
        assert.ok(!holds(g, MACHINE_PART));
        assert.ok(offered(g).includes('collect'));
        g.inventory[1] = null;
        pick(g, 'collect');
        assert.ok(holds(g, MACHINE_PART));
        assert.equal(g.gold, 0, 'collecting charged again');
        assert.ok(!offered(g).includes('collect'));
    });

    test('a part lost before the machine is fixed is handed over again, free', () => {
        const g = standIn({ gold: FACTORY_BILL_GP });
        pick(g, 'pay');
        g.inventory[slotOf(g, MACHINE_PART)] = null;   // died, gave it away, threw it
        pick(g, 'collect');
        assert.ok(holds(g, MACHINE_PART));
        assert.equal(g.npc.gold, FACTORY_BILL_GP);
    });
});

describe('the part', () => {
    test('is a placeholder, worth 0, and draws as the plain bag', () => {
        const d = ITEMS[MACHINE_PART];
        assert.ok(d, 'no part');
        assert.equal(d.name, '[Ice Cone Machine Part]');
        assert.equal(d.description, '[TEXT]');
        assert.equal(d.baseValue, 0);
        assert.equal(d.category, 'quest');
        assert.equal(itemSprite(MACHINE_PART), UNKNOWN_ITEM_SPRITE);
    });

    test('is not a questItem, because the item overlay refuses those and its use lives there', () => {
        assert.ok(!ITEMS[MACHINE_PART].questItem);
        assert.match(mainSrc, /if \(item\.questItem\) \{\s*this\._log\('\[Best hold onto that\.\]'\)/);
    });
});

describe('the diner\'s ice cone machine', () => {
    test('is an examinable on the counter at 5,2, reached from the floor below it', () => {
        assert.ok(machine, 'no machine in the diner');
        assert.deepEqual([machine.x, machine.y], [5, 2]);
        assert.equal(machine.text, '[TEXT]');
        assert.ok(diner.props.some(p => p.x === machine.x && p.y === machine.y && /^counter/.test(p.type)), 'not on the counter');
        assert.ok(TILE_BY_ID[tileAt(diner, machine.x, machine.y + 1)].walkable, 'nowhere to stand in front of it');
        assert.ok(!diner.enemies.some(e => e.x === machine.x && e.y === machine.y + 1), 'someone stands in front of it');
    });

    test('one row in item-uses.js joins the part to the machine', () => {
        const rows = ITEM_USES.filter(r => r.item === MACHINE_PART);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].label, '[TEXT]');
    });

    test('the part offers nothing anywhere else', () => {
        const g = standIn();
        g._grantItem(MACHINE_PART);
        assert.deepEqual(contextualUses(ITEMS[MACHINE_PART], g), []);
        g._targetAt = (x, y) => ({ x, y, npc: null, item: null, examinable: { id: 'diner_counter' }, container: null });
        assert.deepEqual(contextualUses(ITEMS[MACHINE_PART], g), []);
    });

    test('using the part on it spends the part and hands you a Tiger\'s Blood Ice Cone', () => {
        const g = atMachine(standIn({ gold: FACTORY_BILL_GP }));
        pick(g, 'pay');
        useOnMachine(g);
        assert.ok(!holds(g, MACHINE_PART), 'the part was not spent');
        assert.ok(holds(g, CONE), 'no cone');
        assert.equal(g.inventory.filter(s => s && s.itemDef.id === CONE).length, 1);
        assert.equal(flags(g).iceConeMachineFixed, true);
        assert.equal(g.turns, 1, 'fixing it costs the turn');
        assert.deepEqual(offered(g), ['paid'], 'a fixed machine still owes you a part');
    });

    test('with a full bag the part makes room for the cone', () => {
        const g = atMachine(standIn({ size: 1 }));
        g._grantItem(MACHINE_PART);
        useOnMachine(g);
        assert.equal(g.inventory[0].itemDef.id, CONE);
    });

    test('if the cone can\'t be handed over, the part is not spent', () => {
        const g = atMachine(standIn({ size: 1 }));
        g._grantItem(MACHINE_PART);
        const grant = g._grantItem.bind(g);
        g._grantItem = (id) => (id === CONE ? false : grant(id));
        useOnMachine(g);
        assert.ok(holds(g, MACHINE_PART));
        assert.ok(!flags(g).iceConeMachineFixed);
        assert.equal(g.turns, 0);
    });
});

describe('a save part-way', () => {
    // The save's own serialize and migrate, on the stand-in's player and quest.
    const save = (g) => migrate(JSON.parse(JSON.stringify(serialize({
        ...g, map: { url: 'factory-map.json' }, turn: 1, rng: null, enemies: [], containers: [],
        playerHp: 100, playerMaxHp: 100, playerMp: 10, playerMaxMp: 10,
        equipment: { weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null },
    }))));

    test('keeps the paid bill and the part', () => {
        const g = standIn({ gold: 250 });
        pick(g, 'pay');
        const raw = save(g);
        assert.equal(raw.player.gold, 250 - FACTORY_BILL_GP);
        assert.ok(raw.player.inventory.some(s => s && s.id === MACHINE_PART), 'the save lost the part');
        const h = standIn({ gold: raw.player.gold });
        h.questEngine.restore(raw.quest);
        h.inventory = raw.player.inventory.map(s => (s ? { itemDef: ITEMS[s.id], count: s.count } : null));
        assert.equal(flags(h).factoryBillPaid, true);
        assert.deepEqual(offered(h), ['paid'], 'after a reload he asks to be paid again');
        useOnMachine(atMachine(h));
        assert.ok(holds(h, CONE));
    });
});
