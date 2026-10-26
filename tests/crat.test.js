// crat.test.js — the Crat's dispute (plans/cs1-crat-talk-both-sides.md).
//
// A side room north of the Sewer: hear both sides, rule for one, and either side
// will pay you to rule its way. The dialogue is played through main.js's own
// _dialogueChoices and _pickDialogueChoice, lifted out and run against a
// stand-in game, so what is tested is what the game runs.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DIALOGUES, getDialogue, CRAT, CRAT_BRIBE_GP } from '../game/dialogue.js';
import { transferGold } from '../game/trade.js';
import { applyDispositionDelta } from '../game/give-action.js';
import { QuestEngine } from '../game/quests.js';
import { TILE_BY_ID } from '../game/data.js';
import { SLOTS, ENTRIES, resolveSpawn, defaultPicks, requiredDropFor } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';

const GAME = new URL('../game/', import.meta.url);
const mapData = (file) => JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));
const sewer = mapData('sewer-map.json');
const room = mapData('sewer-north-map.json');
const tileAt = (m, x, y) => m.tiles[y * m.width + x];
const walkable = (m, x, y) => x >= 0 && y >= 0 && x < m.width && y < m.height && !!TILE_BY_ID[tileAt(m, x, y)]?.walkable;

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

// The three talkers, as the game spawns them from the room: the Crat from the
// Sewer's character slot, the two sides as placed. The dialogue is played
// against copies of these.
const spawned = () => (room.enemies || []).map(s => spawnEnemy(resolveSpawn(s, defaultPicks())));
const TALKER_IDS = ['crat', 'crat-a', 'crat-b'];
const TALKERS = TALKER_IDS.map(id => {
    const e = spawned().find(x => x.id === id);
    assert.ok(e, `${id} does not stand in the room`);
    return { id, dialogueId: e.dialogueId, gold: e.gold ?? 0, disposition: e.disposition ?? 0 };
});

// A stand-in game in the room, with the three talkers in it.
function inRoom({ gold = 0 } = {}) {
    const g = {
        gold, inventory: [], log: [],
        _dialogueNpc: null, _dialogueReply: '', _dialogueCursor: 0,
        _render() {}, _closeDialogue() { this._dialogueNpc = null; }, _log(m) { this.log.push(m); },
        _onEntityHarmed() {}, emitGameEvent() {}, _removeFromSlot() {},
        _dialogueChoices: dialogueChoices, _pickDialogueChoice: pickDialogueChoice,
    };
    g.questEngine = new QuestEngine(g);
    g.npcs = Object.fromEntries(TALKERS.map(e => [e.id, { ...e }]));
    return g;
}
const talkTo = (g, id) => { g._dialogueNpc = g.npcs[id]; g._dialogueCursor = 0; return g; };
const offered = (g, id) => talkTo(g, id)._dialogueChoices().map(c => c.id);
const pick = (g, id, choiceId) => {
    const c = talkTo(g, id)._dialogueChoices().find(x => x.id === choiceId);
    assert.ok(c, `${id} does not offer '${choiceId}' (offers: ${offered(g, id).join(', ')})`);
    g._pickDialogueChoice(c);
    return g._dialogueReply;
};
const flags = (g) => g.questEngine.state.flags;
const SIDE_ID = { a: 'crat-a', b: 'crat-b' };
const rulings = (g) => offered(g, 'crat').filter(id => id.startsWith('rule_'));
const hearBoth = (g) => { pick(g, 'crat-a', 'testify'); pick(g, 'crat-b', 'testify'); return g; };

// ── The room and its door ───────────────────────────────────────────────────
describe('the side room north of the Sewer', () => {
    test('counts as the Sewer', () => {
        assert.equal(room.zoneName, sewer.zoneName);
        assert.equal(room.tiles.length, room.width * room.height);
    });

    test('a door in the Sewer\'s north wall leads in, onto ground you can stand on', () => {
        const door = sewer.transitions.find(t => t.toMap === 'sewer-north-map.json');
        assert.ok(door, 'the Sewer has no way into the room');
        assert.equal(door.y, 0, 'the door is not in the north wall');
        assert.ok(TILE_BY_ID[tileAt(sewer, door.x, door.y)].walkable, 'the door tile is not walkable');
        assert.ok(walkable(sewer, door.x, door.y + 1), 'nothing to stand on below the door');
        assert.ok(walkable(room, door.toX, door.toY), 'the room\'s landing is not walkable');
    });

    test('the door is not the cape grate', () => {
        const door = sewer.transitions.find(t => t.toMap === 'sewer-north-map.json');
        const grate = sewer.examinables.find(x => x.id === 'cape_grate');
        assert.notDeepEqual([door.x, door.y], [grate.x, grate.y]);
        assert.equal(tileAt(sewer, grate.x, grate.y), 4, 'the cape grate is still a grate');
    });

    test('the room\'s drain leads back to just inside the Sewer\'s door', () => {
        const door = sewer.transitions.find(t => t.toMap === 'sewer-north-map.json');
        const back = room.transitions.find(t => t.toMap === 'sewer-map.json');
        assert.ok(back, 'the room has no way out');
        assert.ok(walkable(sewer, back.toX, back.toY));
        assert.deepEqual([back.toX, back.toY], [door.x, door.y + 1]);
        assert.ok(walkable(room, back.x, back.y - 1), 'the room\'s spawn side of the drain is blocked');
        assert.deepEqual([room.spawn.x, room.spawn.y], [door.toX, door.toY]);
    });

    test('every talker has a dialogue, and the Crat goes by its name', () => {
        for (const t of TALKERS) assert.ok(getDialogue(t.dialogueId), `${t.id} has nothing to say`);
        assert.equal(DIALOGUES.crat.name, 'The Crat');
    });

    test('the tell is clear to anyone who looks: a clue beside each side, reachable', () => {
        assert.ok(CRAT.sides.includes(CRAT.trueSide));
        for (const side of CRAT.sides) {
            const clue = room.examinables.find(x => x.id === `crat_clue_${side}`);
            assert.ok(clue, `no clue for side ${side}`);
            const near = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => walkable(room, clue.x + dx, clue.y + dy));
            assert.ok(near, `side ${side}'s clue cannot be faced from anywhere`);
        }
    });
});

// ── The three stand in the room ─────────────────────────────────────────────
describe("the Crat fills the Sewer's character slot, and both sides stand beside it", () => {
    test('the slot is a character slot of one, the Crat, on the side room', () => {
        const slot = SLOTS['sewer.character'];
        assert.ok(slot, 'no Sewer character slot');
        assert.equal(slot.kind, 'character');
        assert.equal(slot.map, 'sewer-north-map.json');
        assert.deepEqual(slot.pool.map(p => p.entry), ['crat']);
        assert.equal(defaultPicks()['sewer.character'], 'crat');
        assert.equal(slot.requiredDrop, undefined, 'a character slot guarantees no drop');
    });

    test('the room names the slot once, and the Crat comes from the registry', () => {
        const bySlot = room.enemies.filter(s => s.slot === 'sewer.character');
        assert.equal(bySlot.length, 1);
        assert.equal(bySlot[0].type, undefined, "the registry owns the Crat's stat block");
        const crat = spawned().find(e => e.id === 'crat');
        assert.equal(crat.slot, 'sewer.character');
        assert.equal(crat.name, ENTRIES.crat.name);
        assert.equal(crat.dialogueId, 'crat');
        assert.equal(requiredDropFor(crat, room.enemies), null);
    });

    test('all three stand on floor in the room, and none of them fights', () => {
        const all = spawned();
        assert.deepEqual(all.map(e => e.id).sort(), [...TALKER_IDS].sort());
        for (const e of all) {
            assert.ok(walkable(room, e.x, e.y), `${e.id} stands on no floor at (${e.x},${e.y})`);
            assert.equal(e.damage, 0, `${e.id} hits`);
            assert.ok(getDialogue(e.dialogueId), `${e.id} has nothing to say`);
        }
        const at = all.map(e => `${e.x},${e.y}`);
        assert.equal(new Set(at).size, at.length, 'two talkers share a tile');
    });

    test('each side carries exactly the bribe it can offer, and the Crat carries nothing', () => {
        const all = spawned();
        for (const id of ['crat-a', 'crat-b']) assert.equal(all.find(e => e.id === id).gold, CRAT_BRIBE_GP, id);
        assert.equal(all.find(e => e.id === 'crat').gold ?? 0, 0);
    });

    test('each side stands beside its own clue', () => {
        for (const side of CRAT.sides) {
            const clue = room.examinables.find(x => x.id === `crat_clue_${side}`);
            const e = spawned().find(x => x.id === `crat-${side}`);
            assert.ok(Math.abs(e.x - clue.x) <= 2 && Math.abs(e.y - clue.y) <= 2, `side ${side} stands far from its clue`);
        }
    });
});

// ── Every line is a placeholder ─────────────────────────────────────────────
describe('every line is a placeholder', () => {
    const fake = (s) => typeof s === 'string' && /^\[(TEXT|NAME)\b/.test(s);
    const exitFake = (s) => /^\[(North|South) — TEXT\b/.test(s);

    test('the three dialogues', () => {
        for (const id of ['crat', 'crat_side_a', 'crat_side_b']) {
            const d = DIALOGUES[id];
            if (id !== 'crat') assert.ok(fake(d.name), `${id} name: ${d.name}`);
            assert.ok(fake(d.greeting), `${id} greeting: ${d.greeting}`);
            for (const c of d.choices) {
                assert.ok(fake(c.label), `${id}/${c.id} label: ${c.label}`);
                assert.ok(fake(c.reply), `${id}/${c.id} reply: ${c.reply}`);
            }
        }
    });

    test('the room\'s clues and both doors', () => {
        assert.ok(room.examinables.length >= 2);
        for (const x of room.examinables) assert.ok(fake(x.text), x.text);
        assert.ok(exitFake(room.transitions[0].label), room.transitions[0].label);
        assert.ok(exitFake(sewer.transitions.find(t => t.toMap === 'sewer-north-map.json').label));
    });
});

// ── Talk to both sides, then rule ───────────────────────────────────────────
describe('talk to both sides and make a ruling', () => {
    test('nothing to rule on until you have heard both sides', () => {
        const g = inRoom();
        assert.deepEqual(rulings(g), []);
        pick(g, 'crat-a', 'testify');
        assert.deepEqual(rulings(g), []);
        assert.ok(offered(g, 'crat').includes('waiting'));
        pick(g, 'crat-b', 'testify');
        assert.deepEqual(rulings(g), ['rule_a', 'rule_b']);
        assert.ok(!offered(g, 'crat').includes('waiting'));
    });

    test('hearing a side out is spent once heard', () => {
        const g = inRoom();
        pick(g, 'crat-a', 'testify');
        assert.equal(flags(g).cratHeardA, true);
        assert.ok(!offered(g, 'crat-a').includes('testify'));
        assert.ok(offered(g, 'crat-a').includes('again'));
        assert.ok(offered(g, 'crat-b').includes('testify'), 'hearing A spent B');
    });

    for (const side of CRAT.sides) {
        test(`you can rule for side ${side}, and the dispute is closed`, () => {
            const g = hearBoth(inRoom());
            pick(g, 'crat', `rule_${side}`);
            assert.equal(flags(g).cratRuling, side);
            assert.deepEqual(rulings(g), []);
            assert.ok(offered(g, 'crat').includes('after'));
            for (const id of Object.values(SIDE_ID)) {
                assert.deepEqual(offered(g, id), ['after'], `${id} still argues after the ruling`);
            }
        });
    }

    test('the reveal differs by who you ruled for', () => {
        const replies = CRAT.sides.map(side => pick(hearBoth(inRoom()), 'crat', `rule_${side}`));
        assert.notEqual(replies[0], replies[1]);
    });
});

// ── Arbiter, but bribeable ──────────────────────────────────────────────────
describe('either side can pay you to rule its way', () => {
    test('an offer appears only once you have heard that side', () => {
        const g = inRoom();
        assert.ok(!offered(g, 'crat-a').includes('offer'));
        pick(g, 'crat-a', 'testify');
        assert.ok(offered(g, 'crat-a').includes('offer'));
        assert.ok(!offered(g, 'crat-b').includes('offer'));
    });

    test('taking an offer moves the money to you and remembers who paid', () => {
        const g = inRoom({ gold: 3 });
        pick(g, 'crat-a', 'testify');
        pick(g, 'crat-a', 'offer');
        assert.equal(g.gold, 3 + CRAT_BRIBE_GP);
        assert.equal(g.npcs['crat-a'].gold, 0);
        assert.equal(flags(g).cratBribe, 'a');
    });

    test('you take one offer: the other side\'s goes away', () => {
        const g = hearBoth(inRoom());
        pick(g, 'crat-b', 'offer');
        assert.ok(!offered(g, 'crat-a').includes('offer'));
        assert.ok(!offered(g, 'crat-b').includes('offer'));
    });

    test('a side that cannot pay makes no offer, and nothing is remembered', () => {
        const g = inRoom();
        g.npcs['crat-a'].gold = CRAT_BRIBE_GP - 1;
        pick(g, 'crat-a', 'testify');
        assert.ok(!offered(g, 'crat-a').includes('offer'));
        assert.equal(flags(g).cratBribe, undefined);
    });

    test('an offer that cannot be paid at the moment of taking it leaves no memory', () => {
        // The offer is hidden once a side is broke, but the gold can go between
        // showing the menu and picking (looted, stolen); nothing is owed then.
        const g = inRoom({ gold: 2 });
        pick(g, 'crat-a', 'testify');
        const offer = talkTo(g, 'crat-a')._dialogueChoices().find(c => c.id === 'offer');
        g.npcs['crat-a'].gold = 0;
        g._pickDialogueChoice(offer);
        assert.equal(g.gold, 2);
        assert.equal(flags(g).cratBribe, undefined);
    });

    test('paid, you can still rule either way, and each way has its own line', () => {
        const unbought = pick(hearBoth(inRoom()), 'crat', 'rule_a');
        const g = hearBoth(inRoom());
        pick(g, 'crat-a', 'offer');
        assert.deepEqual(rulings(g), ['rule_a_paid_a', 'rule_b_paid_a']);
        const kept = pick(g, 'crat', 'rule_a_paid_a');
        assert.equal(flags(g).cratRuling, 'a');
        const g2 = hearBoth(inRoom());
        pick(g2, 'crat-a', 'offer');
        const crossed = pick(g2, 'crat', 'rule_b_paid_a');
        assert.equal(flags(g2).cratRuling, 'b');
        assert.equal(new Set([unbought, kept, crossed]).size, 3);
    });

    test('six rulings in all, each its own line, and two on offer at any time', () => {
        const rule = DIALOGUES.crat.choices.filter(c => c.id.startsWith('rule_'));
        assert.equal(rule.length, 6);
        assert.equal(new Set(rule.map(c => c.reply)).size, 6);
        for (const bribe of [null, 'a', 'b']) {
            const g = hearBoth(inRoom());
            if (bribe) pick(g, SIDE_ID[bribe], 'offer');
            assert.equal(rulings(g).length, 2, `bribe ${bribe}`);
        }
    });
});

// ── The sewer remembers ─────────────────────────────────────────────────────
describe('the ruling survives a save', () => {
    test('the flags ride the quest state the save keeps', () => {
        const g = hearBoth(inRoom());
        pick(g, 'crat-b', 'offer');
        pick(g, 'crat', 'rule_b_paid_b');
        const blob = JSON.parse(JSON.stringify(g.questEngine.serialize()));
        const back = inRoom();
        back.questEngine.restore(blob);
        assert.deepEqual(
            { a: flags(back).cratHeardA, b: flags(back).cratHeardB, bribe: flags(back).cratBribe, ruling: flags(back).cratRuling },
            { a: true, b: true, bribe: 'b', ruling: 'b' });
        assert.deepEqual(rulings(back), []);
    });
});
