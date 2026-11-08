// credits.test.js — FIN4 (plans/fin4-credits-town-open.md).
//
// Beating Monstrous Sun Man rolls the credits; when they end you are back in the world with
// everything as it was; the save remembers the ending was seen and never rolls it twice.
//
// main.js touches `document` at import, so, as in finale-phase2.test.js, the real methods are
// lifted out of its source and bound onto a small game object. The trigger is the real FIN3 win
// (`beastFell`, which saves the flag and fires `finale_phase2_won` through the real
// `emitGameEvent` into a real QuestEngine); the dismissal is real key presses through the real
// `_bindInput` listener; the memory goes through the real serialize / JSON / writeSave /
// readSaveRaw / loadInto. Stand-ins are only drawing and the clock.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CREDITS, endingDue, endingSeen, markEndingSeen, newRoll, currentCard, stepRoll } from '../game/credits.js';
import { FINALE_PHASE2, beastFell } from '../game/finale-setpiece.js';
import { QuestEngine } from '../game/quests.js';
import { serialize, writeSave, readSaveRaw, loadInto, migrate } from '../game/save.js';
import { Enemy } from '../game/enemies.js';
import { isCombatActive } from '../game/wheel-model.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const rendererSrc = readFileSync(fileURLToPath(new URL('../game/renderer.js', import.meta.url)), 'utf8');

function installGlobals() {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        clear: () => store.clear(),
    };
}
beforeEach(() => { installGlobals(); });

function liveMethod(name, params, freeVars) {
    const signature = `\n    ${name}(${params}) {`;
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at + 1);
    const body = mainSrc.slice(at + 5 + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

function liveConst(name) {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*`).exec(mainSrc);
    assert.ok(m, `const ${name} not found in main.js`);
    const from = m.index + m[0].length;
    const end = mainSrc.indexOf('\n};', from);
    return new Function(`'use strict'; return ${mainSrc.slice(from, end + 2)}`)();
}

const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); };

// A world with a quest in progress, a bag, a place, and a clock the test can tick by hand.
function makeGame() {
    const document = new EventTarget();
    const timers = [];
    const g = {
        state: STATE.IDLE, facing: 'up', turn: 120, enemies: [], map: { url: 'vault-map.json', width: 20, height: 15 },
        playerX: 7, playerY: 9, playerHp: 61, playerMaxHp: 100, playerMp: 20, playerMaxMp: 50, gold: 33,
        buffs: [], tempEquips: [], containers: [], groundItems: [], _tileDiffs: [], _pendingTransition: null,
        equipment: { weapon: { id: 'pipe' }, top: null, bottom: null, front: null, back: null, sides: null },
        inventory: [{ itemDef: { id: 'rock' }, count: 3 }, null],
        rng: { getState: () => 5, setState() {} }, _dayClock: 0, _lastAutosaveTurn: 0,
        _animating: false, _paused: false, _physicalHeld: new Set(), _heldDirKeys: [],
        slots: {}, logs: [], renders: 0, timers, saves: 0,
        _log(m) { this.logs.push(m); },
        _render() { this.renders++; },
        _resumeHeldWalk() {}, _skipLootReel() {},
        _resolveItemDef(id) { return id ? { id } : null; },
        async _loadMap(url, x, y) { this.map = { url, width: 20, height: 15 }; this.playerX = x; this.playerY = y; },
        setTile() {},
    };
    g.questEngine = new QuestEngine(g);
    g.questEngine.state.activeId = 'fix_car';
    g.questEngine.state.stageIndex = 1;
    g.questEngine.state.flags = { carFixed: true, bridgeRoute: 'drive' };
    const free = {
        STATE, DIRS, CREDITS, endingDue, markEndingSeen, newRoll, stepRoll, document, window: new EventTarget(),
        audio: { playSfx() {} }, isCombatActive,
        setTimeout: (f, ms) => { timers.push({ f, ms, live: true }); return timers.length; },
        clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
    };
    for (const [n, p] of [
        ['emitGameEvent', 'type, payload = {}'], ['_bindInput', ''], ['_wheelOpenerUp', ''],
        ['_creditsCheck', ''], ['_creditsReady', ''], ['_startCredits', ''], ['_armCreditsCard', ''],
        ['_creditsKey', 'code'], ['_creditsStep', ''], ['_endCredits', ''],
    ]) g[n] = liveMethod(n, p, free);
    g._inCombat = () => isCombatActive(g);     // a one-line method in main.js
    g.autosave = (opts = {}) => { g.saves++; writeSave(g); };
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    // Run the oldest live timer the game has set (a stand-in for the clock).
    g.tick = () => { const t = timers.find(x => x.live); assert.ok(t, 'a timer is waiting'); t.live = false; t.f(); };
    g.liveTimers = () => timers.filter(t => t.live);
    return g;
}

// The FIN3 win, the way the fight lands it: the beast falls.
const beast = () => ({ id: 'finale-monstrous-sun-man', tag: FINALE_PHASE2.beastTag, shownThe: 'Monstrous Sun Man' });
function winTheFinalArc(g) {
    g._log = (m) => g.logs.push(m);
    return beastFell(g, beast());
}

// The world as a player would list it, so "intact" is compared field by field.
const worldOf = (g) => ({
    quest: JSON.stringify({ ...g.questEngine.serialize(), flags: { ...g.questEngine.serialize().flags, endingSeen: undefined } }),
    pos: [g.playerX, g.playerY, g.facing], hp: [g.playerHp, g.playerMp, g.gold], turn: g.turn,
    bag: g.inventory.map(s => s && [s.itemDef.id, s.count]), weapon: g.equipment.weapon.id, map: g.map.url,
});

describe('the data', () => {
    test('every credits line and the hint are the [TEXT] placeholder', () => {
        assert.ok(CREDITS.cards.length >= 2, 'more than one card, so stepping means something');
        for (const card of CREDITS.cards) {
            assert.ok(card.length >= 1);
            for (const line of card) assert.equal(line, '[TEXT]');
        }
        assert.equal(CREDITS.hint, '[TEXT]');
    });

    test('a roll steps through every card once, then is over', () => {
        const roll = newRoll();
        const seen = [currentCard(roll)];
        while (stepRoll(roll)) seen.push(currentCard(roll));
        assert.equal(seen.length, CREDITS.cards.length);
        assert.equal(currentCard(roll), null, 'past the last card there is nothing to show');
    });

    test('the credits are due only once the Final Arc is won and the ending is not yet seen', () => {
        const g = makeGame();
        assert.equal(endingDue(g), false, 'a fresh game');
        g.questEngine.state.flags.finalePhase1 = 'won';
        assert.equal(endingDue(g), false, 'phase 1 alone is not the ending');
        g.questEngine.state.flags.finalePhase2 = 'won';
        assert.equal(endingDue(g), true);
        assert.equal(markEndingSeen(g), true);
        assert.equal(endingSeen(g), true);
        assert.equal(endingDue(g), false);
        assert.equal(markEndingSeen(g), false, 'it is marked once');
        assert.equal(endingDue({ questEngine: null }), false, 'no quest engine, no credits');
    });
});

describe('winning the Final Arc rolls the credits', () => {
    test('nothing rolls before the win, however long you play', () => {
        const g = makeGame();
        g._creditsCheck();
        assert.equal(g.liveTimers().length, 0);
        assert.equal(g.state, STATE.IDLE);
    });

    test('the real win saves the flag and fires the event; the credits are due; a beat later they take the screen', () => {
        const g = makeGame();
        const seen = [];
        const emit = g.questEngine.emit.bind(g.questEngine);
        g.questEngine.emit = (type, payload) => { seen.push(type); return emit(type, payload); };
        assert.equal(winTheFinalArc(g), true);
        assert.deepEqual(seen, ['finale_phase2_won']);
        assert.equal(g.questEngine.state.flags.finalePhase2, 'won');
        assert.equal(endingDue(g), true);
        assert.equal(g.state, STATE.IDLE, 'the blow lands in the world; the credits wait for the beat');

        g._creditsCheck();
        const [beat] = g.liveTimers();
        assert.equal(beat.ms, CREDITS.beatMs);
        g._creditsCheck();
        assert.equal(g.liveTimers().length, 1, 'asking again does not arm a second beat');
        g.tick();
        assert.equal(g.state, STATE.CREDITS);
        assert.deepEqual(currentCard(g._credits), CREDITS.cards[0]);
    });

    test('the credits wait while a fight is on, a menu is open, or you are sliding', () => {
        for (const hold of [
            (g) => { g.state = STATE.DIALOGUE; },
            (g) => { g._animating = true; },
            (g) => { g._paused = true; },
        ]) {
            const g = makeGame();
            winTheFinalArc(g);
            hold(g);
            g._creditsCheck();
            assert.equal(g.liveTimers().length, 0);
        }
        // a menu that opens during the beat stops it
        const g = makeGame();
        winTheFinalArc(g);
        g._creditsCheck();
        g.state = STATE.LOG_MODAL;
        g.tick();
        assert.equal(g.state, STATE.LOG_MODAL, 'the beat found a menu open and did not take the screen');
    });

    test('the draw is wired: the renderer draws the credits state', () => {
        assert.match(rendererSrc, /game\.state === 'credits'\) this\._drawCredits\(game\)/);
        assert.match(rendererSrc, /MENU_BOX_STATES = new Set\([^)]*'credits'/);
    });
});

describe('the credits end and give the world back', () => {
    async function rolling() {
        const g = makeGame();
        winTheFinalArc(g);
        g._creditsCheck(); g.tick();
        assert.equal(g.state, STATE.CREDITS);
        return g;
    }

    test('Enter steps card by card, then the last card ends it and you are back in the world', async () => {
        const g = await rolling();
        const before = worldOf(g);
        for (let i = 1; i < CREDITS.cards.length; i++) {
            await g.press('Enter');
            assert.equal(g.state, STATE.CREDITS);
            assert.deepEqual(currentCard(g._credits), CREDITS.cards[i]);
        }
        await g.press('Enter');
        assert.equal(g.state, STATE.IDLE);
        assert.equal(g._credits, null);
        assert.deepEqual(worldOf(g), before, 'quests, bag, place, health, turn all as they were');
        assert.equal(g.questEngine.state.activeId, 'fix_car');
        assert.equal(g.questEngine.state.flags.carFixed, true);
        assert.equal(g.questEngine.state.flags.finalePhase2, 'won', 'the win stays won');
    });

    test('Escape skips the lot', async () => {
        const g = await rolling();
        const before = worldOf(g);
        await g.press('Escape');
        assert.equal(g.state, STATE.IDLE);
        assert.deepEqual(worldOf(g), before);
        assert.equal(endingSeen(g), true);
    });

    test('while they roll, a walking key does not move you; Space and an arrow step', async () => {
        const g = await rolling();
        const at = [g.playerX, g.playerY, g.turn];
        await g.press('KeyQ');
        await g.press('Tab');
        assert.equal(g._credits.index, 0, 'keys with no meaning here are ignored');
        await g.press('Space');
        assert.equal(g._credits.index, 1);
        await g.press('ArrowDown');
        assert.equal(g._credits.index, 2);
        assert.deepEqual([g.playerX, g.playerY, g.turn], at, 'the world did not move under the credits');
    });

    test('left alone, a card steps on its own timer, and a stepped-past timer does nothing', async () => {
        const g = await rolling();
        const [card] = g.liveTimers();
        assert.equal(card.ms, CREDITS.cardMs);
        await g.press('Enter');                       // you step first
        assert.equal(card.live, false, 'the old card timer was cleared');
        assert.equal(g._credits.index, 1);
        g.tick();                                     // the new card's timer
        assert.equal(g._credits.index, 2);
        while (g.state === STATE.CREDITS) g.tick();   // ends on its own
        assert.equal(g.state, STATE.IDLE);
        assert.equal(endingSeen(g), true);
    });

    test('ending saves at once, with the ending marked seen, and does not roll again', async () => {
        const g = await rolling();
        const savesBefore = g.saves;
        await g.press('Escape');
        assert.equal(g.saves, savesBefore + 1);
        const onDisk = readSaveRaw();
        assert.equal(onDisk.quest.flags.endingSeen, true);
        g._creditsCheck();
        assert.equal(g.liveTimers().length, 0, 'seen once, never due again');
    });

    test('a tap steps the credits (the pointer handler routes the state to _creditsStep)', () => {
        assert.match(mainSrc, /if \(this\.state === STATE\.CREDITS\) \{ e\.preventDefault\(\); this\._creditsStep\(\); return; \}/);
    });
});

describe('the save remembers', () => {
    function savedGame({ seen }) {
        const g = makeGame();
        g.enemies = [new Enemy({ id: 'rat1', type: 'sewer_rat', x: 5, y: 5, hp: 50, armor: 2, damage: 8, sightRange: 8, tag: 'sewer_rat' })];
        winTheFinalArc(g);
        if (seen) markEndingSeen(g);
        return g;
    }
    const roundTrip = async (src) => {
        const blob = JSON.parse(JSON.stringify(serialize(src)));
        const dst = makeGame();
        dst.questEngine = new QuestEngine(dst);
        await loadInto(dst, blob);
        return dst;
    };

    test('through serialize, JSON and loadInto, the ending stays seen and the credits do not roll', async () => {
        const dst = await roundTrip(savedGame({ seen: true }));
        assert.equal(dst.questEngine.state.flags.endingSeen, true);
        assert.equal(endingSeen(dst), true);
        assert.equal(endingDue(dst), false);
        dst._creditsCheck();
        assert.equal(dst.liveTimers().length, 0, 'loading such a save does not replay the credits');
    });

    test('a save made between the win and the credits still rolls them once after loading', async () => {
        const dst = await roundTrip(savedGame({ seen: false }));
        assert.equal(endingDue(dst), true);
        dst._creditsCheck(); dst.tick();
        assert.equal(dst.state, STATE.CREDITS);
        await dst.press('Escape');
        assert.equal(endingSeen(dst), true);
    });

    test('the whole path: win, credits, end, write, read, load into a new game, no credits', async () => {
        const g = makeGame();
        winTheFinalArc(g);
        g._creditsCheck(); g.tick();
        await g.press('Escape');
        const raw = readSaveRaw();                 // the live save, through the real migrate + validate
        const dst = makeGame();
        await loadInto(dst, raw);
        assert.equal(endingDue(dst), false);
        assert.equal(dst.questEngine.state.activeId, 'fix_car');
        assert.deepEqual([dst.playerX, dst.playerY], [g.playerX, g.playerY]);
        assert.equal(dst.gold, 33);
    });

    test('an older save, with no flag at all, migrates untouched: never won, never due', () => {
        const old = migrate({ version: 2, quest: { activeId: 'fix_car', stageIndex: 0, flags: { carFixed: true } } });
        assert.equal(old.quest.flags.endingSeen, undefined);
        const g = makeGame();
        g.questEngine.restore(old.quest);
        assert.equal(endingDue(g), false);
    });

    test('a fresh game does not carry the ending over: a new quest engine has no flag', () => {
        const g = makeGame();
        winTheFinalArc(g);
        markEndingSeen(g);
        const fresh = new QuestEngine({});
        assert.equal(endingSeen({ questEngine: fresh }), false);
    });
});
