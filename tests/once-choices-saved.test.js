// once-choices-saved.test.js — FX45 (plans/fx45-once-choices-saved.md).
//
// A one-time talk choice an NPC has already given stays given after a save and
// CONTINUE. The dialogue is played through main.js's own _dialogueChoices and
// _pickDialogueChoice (lifted out and run on a stand-in game, as crat.test.js
// does), and the save goes through the real serialize / writeSave / readSaveRaw /
// loadInto, so what is tested is what the game runs.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DIALOGUES, getDialogue } from '../game/dialogue.js';
import { transferGold } from '../game/trade.js';
import { applyDispositionDelta } from '../game/give-action.js';
import { QuestEngine } from '../game/quests.js';
import { Enemy } from '../game/enemies.js';
import { writeSave, readSaveRaw, loadInto, migrate, serialize } from '../game/save.js';

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

function installGlobals() {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        clear: () => store.clear(),
    };
    globalThis.document = { createElement: () => ({ set textContent(v) {}, get innerHTML() { return ''; } }) };
}
beforeEach(() => { installGlobals(); });

// A stand-in game: enough for serialize(), loadInto() and the lifted dialogue.
function makeGame() {
    const map = { url: 'town-map.json', width: 20, height: 15, zoneName: 'Town',
        isInBounds: () => true, isWalkable: () => true };
    const g = {
        map, turn: 5, rng: { getState: () => 1, setState() {} },
        playerX: 3, playerY: 3, playerHp: 100, playerMaxHp: 100, playerMp: 10, playerMaxMp: 10,
        facing: 'down', gold: 20,
        equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], selectedSlot: -1,
        groundItems: [], containers: [], enemies: [],
        _tileDiffs: [], _pendingTransition: null, _sewerEscape: null,
        _lastAutosaveTurn: 0, state: 'idle', log: [],
        _dialogueNpc: null, _dialogueReply: '', _dialogueCursor: 0,
        _log(m) { this.log.push(m); }, _render() {}, _closeDialogue() { this._dialogueNpc = null; },
        _onEntityHarmed() {}, emitGameEvent() {}, _removeFromSlot() {},
        _resolveItemDef: () => null,
        async _loadMap(url, x, y) { this.map = { ...map, url: url || map.url }; this.playerX = x ?? 1; this.playerY = y ?? 1; },
        setTile() {},
        _dialogueChoices: dialogueChoices, _pickDialogueChoice: pickDialogueChoice,
    };
    g.questEngine = new QuestEngine(g);
    return g;
}
const npcAt = (id, dialogueId, extra = {}) =>
    new Enemy({ id, type: 'townsperson', x: 4, y: 4, hp: 20, armor: 0, damage: 1, dialogueId, disposition: 0, ...extra });

const talkTo = (g, npc) => { g._dialogueNpc = npc; g._dialogueCursor = 0; return g; };
const offered = (g, npc) => talkTo(g, npc)._dialogueChoices().map(c => c.id);
const pick = (g, npc, choiceId) => {
    const c = talkTo(g, npc)._dialogueChoices().find(x => x.id === choiceId);
    assert.ok(c, `'${choiceId}' is not on offer (offers: ${offered(g, npc).join(', ')})`);
    g._pickDialogueChoice(c);
};

// Save the game the way the game does, and CONTINUE into a fresh one.
async function saveAndContinue(src) {
    assert.equal(writeSave(src), true, 'the save did not write');
    const raw = readSaveRaw();
    assert.ok(raw, 'nothing to continue from');
    const dst = makeGame();
    assert.equal(await loadInto(dst, raw), true);
    return dst;
}
const byId = (g, id) => g.enemies.find(e => e.id === id);

describe('a one-time choice used before a save is gone after CONTINUE', () => {
    test("Bartho's hat compliment cannot be given twice", async () => {
        const g = makeGame();
        g.enemies = [npcAt('bartho', 'bartho')];
        assert.ok(offered(g, g.enemies[0]).includes('hat'));
        pick(g, g.enemies[0], 'hat');
        assert.ok(!offered(g, g.enemies[0]).includes('hat'), 'still on offer before the save');
        const mood = g.enemies[0].disposition;
        assert.ok(mood > 0, 'the hat gave a mood');

        const dst = await saveAndContinue(g);
        const bartho = byId(dst, 'bartho');
        assert.equal(bartho.disposition, mood, 'the mood came back');
        const after = offered(dst, bartho);
        assert.ok(!after.includes('hat'), 'the spent hat compliment is on offer again after CONTINUE');
        assert.ok(after.includes('bridge'), 'a choice not yet used is still on offer');
        assert.ok(after.includes('flatter'), 'repeatable choices are still on offer');
    });

    test("Knuckles' stand-down cannot be used twice", async () => {
        const g = makeGame();
        g.enemies = [npcAt('knuckles', 'knuckles')];
        pick(g, g.enemies[0], 'standdown');
        const dst = await saveAndContinue(g);
        assert.ok(!offered(dst, byId(dst, 'knuckles')).includes('standdown'));
    });

    test('each NPC keeps its own spent set', async () => {
        const g = makeGame();
        g.enemies = [npcAt('bartho', 'bartho'), npcAt('knuckles', 'knuckles')];
        pick(g, g.enemies[0], 'hat');
        const dst = await saveAndContinue(g);
        assert.ok(!offered(dst, byId(dst, 'bartho')).includes('hat'));
        assert.ok(offered(dst, byId(dst, 'knuckles')).includes('standdown'), "Bartho's hat spent Knuckles' choice");
    });

    test('it survives a second save and continue', async () => {
        const g = makeGame();
        g.enemies = [npcAt('bartho', 'bartho')];
        pick(g, g.enemies[0], 'hat');
        const once = await saveAndContinue(g);
        const twice = await saveAndContinue(once);
        assert.ok(!offered(twice, byId(twice, 'bartho')).includes('hat'));
    });

    test('the Yellow Card line stays spent through its quest flag', () => {
        const yc = DIALOGUES.banker.choices.find(c => c.id === 'yellowCard');
        assert.equal(yc.once, true);
        assert.match(String(yc.available), /yellowCardRaised/);
    });
});

describe('old saves and odd data load fine', () => {
    test('an NPC nobody has talked to saves with no dialogueDone field', () => {
        const e = npcAt('bartho', 'bartho');
        assert.equal('dialogueDone' in JSON.parse(JSON.stringify(e.toSave())), false);
    });

    test('a save without the field loads with nothing spent', async () => {
        const g = makeGame();
        g.enemies = [npcAt('bartho', 'bartho')];
        const blob = JSON.parse(JSON.stringify(serialize(g)));
        for (const e of blob.world.enemies) assert.equal('dialogueDone' in e, false);
        const dst = makeGame();
        assert.equal(await loadInto(dst, migrate(blob)), true);
        assert.ok(offered(dst, byId(dst, 'bartho')).includes('hat'));
    });

    test('a garbled field is ignored, not thrown on', async () => {
        for (const bad of ['hat', 7, null, {}, [1, null, {}]]) {
            const g = makeGame();
            g.enemies = [npcAt('bartho', 'bartho')];
            const blob = JSON.parse(JSON.stringify(serialize(g)));
            blob.world.enemies[0].dialogueDone = bad;
            const dst = makeGame();
            assert.equal(await loadInto(dst, migrate(blob)), true);
            assert.ok(offered(dst, byId(dst, 'bartho')).includes('hat'), `bad value ${JSON.stringify(bad)} spent something`);
        }
    });
});

describe("the Crat's story beats are one-time again", () => {
    const badge = (c) => (c.cost ? `${c.cost} GP` : (c.repeatable ? 'repeat' : 'once'));   // renderer.js's tag
    const beats = (d) => d.choices.filter(c => c.id === 'testify' || c.id === 'offer' || c.id.startsWith('rule_'));

    test('hearing a side out, taking its money and ruling are `once`, and show the once badge', () => {
        assert.equal(beats(DIALOGUES.crat).length, 6, 'six ways to rule');
        for (const id of ['crat', 'crat_side_a', 'crat_side_b']) {
            const bs = beats(DIALOGUES[id]);
            assert.ok(bs.length >= 1);
            for (const c of bs) {
                assert.equal(c.once, true, `${id}/${c.id} is not once`);
                assert.ok(!c.repeatable, `${id}/${c.id} is still repeatable`);
                assert.equal(badge(c), 'once');
            }
        }
        for (const id of ['crat_side_a', 'crat_side_b']) {
            assert.deepEqual(beats(DIALOGUES[id]).map(c => c.id), ['testify', 'offer']);
        }
    });

    test('the questions you can put again stay repeatable', () => {
        for (const [d, ids] of [['crat', ['dispute', 'waiting', 'after']], ['crat_side_a', ['again', 'after']]]) {
            for (const id of ids) assert.equal(DIALOGUES[d].choices.find(c => c.id === id).repeatable, true, `${d}/${id}`);
        }
    });

    test('a spent Crat choice stays spent after CONTINUE, even with the quest flags unset', async () => {
        const g = makeGame();
        g.enemies = [npcAt('crat-a', 'crat_side_a'), npcAt('crat-b', 'crat_side_b'), npcAt('crat', 'crat')];
        pick(g, g.enemies[0], 'testify');
        assert.equal(g.questEngine.state.flags.cratHeardA, true);
        const dst = await saveAndContinue(g);
        assert.ok(!offered(dst, byId(dst, 'crat-a')).includes('testify'));
        assert.ok(offered(dst, byId(dst, 'crat-b')).includes('testify'), 'side B was not heard');
        // The spent set alone does it: wipe the flag the game also checks.
        dst.questEngine.state.flags.cratHeardA = false;
        assert.ok(!offered(dst, byId(dst, 'crat-a')).includes('testify'), 'the NPC forgot it was spent');
    });
});
