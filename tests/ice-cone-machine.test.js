// ice-cone-machine.test.js — the Factory's unpaid bill
// (plans/ic6-factory-bill-ice-cone-machine.md).
//
// The manager will not let the part go until the bill is paid. His placement in
// the Factory waits on a ruling (the balance golden gains his row), so he is
// tested here as a talker on his own. The dialogue is played through main.js's own _dialogueChoices and
// _pickDialogueChoice, lifted out and run against a stand-in game, so what is
// tested is what the game runs.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getDialogue, FACTORY_BILL_GP } from '../game/dialogue.js';
import { transferGold } from '../game/trade.js';
import { applyDispositionDelta } from '../game/give-action.js';
import { QuestEngine } from '../game/quests.js';

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

const manager = () => ({ id: 'factory-manager', dialogueId: 'factory_manager', gold: 0, disposition: 0 });

// A stand-in game, talking to the manager.
function inFactory({ gold = 0 } = {}) {
    const g = {
        gold, inventory: [], log: [],
        _dialogueNpc: null, _dialogueReply: '', _dialogueCursor: 0,
        _render() {}, _closeDialogue() { this._dialogueNpc = null; }, _log(m) { this.log.push(m); },
        _onEntityHarmed() {}, emitGameEvent() {}, _removeFromSlot() {},
        _dialogueChoices: dialogueChoices, _pickDialogueChoice: pickDialogueChoice,
    };
    g.questEngine = new QuestEngine(g);
    g.npc = manager();
    g._dialogueNpc = g.npc;
    return g;
}
const offered = (g) => g._dialogueChoices().map(c => c.id);
const pick = (g, id) => {
    const c = g._dialogueChoices().find(x => x.id === id);
    assert.ok(c, `the manager does not offer '${id}' (offers: ${offered(g).join(', ')})`);
    g._pickDialogueChoice(c);
    return g._dialogueReply;
};

describe('the Factory manager', () => {
    test('talks, every line a placeholder', () => {
        const d = getDialogue('factory_manager');
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

    test('short of it, paying is refused and nothing moves', () => {
        const g = inFactory({ gold: FACTORY_BILL_GP - 1 });
        pick(g, 'pay');
        assert.equal(g.gold, FACTORY_BILL_GP - 1);
        assert.equal(g.npc.gold, 0);
        assert.ok(!g.questEngine.state.flags.factoryBillPaid);
        assert.match(g._dialogueReply, /can't cover/);
        assert.ok(offered(g).includes('pay'), 'the bill is still on offer');
    });

    test('paying moves exactly the bill to him, once', () => {
        const g = inFactory({ gold: 250 });
        pick(g, 'pay');
        assert.equal(g.gold, 250 - FACTORY_BILL_GP);
        assert.equal(g.npc.gold, FACTORY_BILL_GP);
        assert.equal(g.questEngine.state.flags.factoryBillPaid, true);
        assert.ok(!offered(g).includes('pay'), 'he asks to be paid twice');
        assert.ok(offered(g).includes('paid'));
    });

    test('a save after paying keeps the bill paid', () => {
        const g = inFactory({ gold: FACTORY_BILL_GP });
        pick(g, 'pay');
        const saved = JSON.parse(JSON.stringify(g.questEngine.serialize()));
        const h = inFactory({ gold: g.gold });
        h.questEngine.restore(saved);
        assert.equal(h.questEngine.state.flags.factoryBillPaid, true);
        assert.ok(!offered(h).includes('pay'));
        assert.equal(h.gold, 0);
    });
});
