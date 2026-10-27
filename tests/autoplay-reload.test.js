// autoplay-reload.test.js — the loops run reloads through CONTINUE and checks
// nothing was lost (plans/al2-loops-reload-continue.md).
//
// The reload itself needs Chrome (npm run autoplay:check). What node can check:
// the comparison names whatever differs, a spoiled save field really spoils
// what CONTINUE loads, and so the check can fail. That last part goes through
// the real save.js (serialize, then loadInto) on a stand-in game.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { breakSave, takeCarry, CARRY_KEY } from '../game/autoplay/boot.js';
import { keptState, reloadLosses, SCRIPTS } from '../game/autoplay/run.js';
import { serialize, loadInto } from '../game/save.js';
import { QuestEngine } from '../game/quests.js';

const DEFS = { lion_whip: { id: 'lion_whip' }, wooden_sword: { id: 'wooden_sword' }, rock: { id: 'rock' }, soap: { id: 'soap' } };

// A stand-in game with exactly what serialize and loadInto touch.
function standIn() {
    const g = {
        map: null, _mapUrl: null, rng: null, turn: 0, state: 'splash',
        playerX: 0, playerY: 0, playerHp: 100, playerMaxHp: 100, playerMp: 100, playerMaxMp: 100,
        facing: 'down', gold: 0,
        equipment: { weapon: DEFS.wooden_sword, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], groundItems: [], containers: [], enemies: [],
        _tileDiffs: [], _pendingTransition: null, _sewerEscape: null,
        _render() {},
        _resolveItemDef: (id) => (id ? DEFS[id] || null : null),
        async _loadMap(url, x, y) {
            const W = 30, H = 30;
            this.map = { url, width: W, height: H, isInBounds: (a, b) => a >= 0 && b >= 0 && a < W && b < H };
            this._mapUrl = url;
            this.playerX = typeof x === 'number' ? x : 1;
            this.playerY = typeof y === 'number' ? y : 1;
        },
        setTile() {},
    };
    g.questEngine = new QuestEngine(g);
    return g;
}

// Where the loops run stands when it reloads: the whip worn, the rock bought.
async function afterTrading() {
    const g = standIn();
    await g._loadMap('factory-map.json', 9, 14);
    g.turn = 83;
    g.gold = 7;
    g.equipment.weapon = DEFS.lion_whip;
    g.inventory = [null, null, { itemDef: DEFS.rock, count: 1 }, { itemDef: DEFS.soap, count: 2 }];
    g.questEngine.state.activeId = 'fix_car';
    g.questEngine.state.stageIndex = 0;
    return g;
}

// Save it, spoil `path` (if any), CONTINUE into a fresh game: what it loaded.
async function reloaded(g, path = null) {
    let json = JSON.stringify(serialize(g));
    if (path) json = breakSave(json, path);
    const next = standIn();
    await loadInto(next, JSON.parse(json));
    return next;
}

describe('the loops script reloads', () => {
    test('it reloads after its trading, its last step', () => {
        const { steps, reloadAfter } = SCRIPTS.loops;
        const at = steps.findIndex((s) => s.label === reloadAfter);
        assert.ok(at >= 0, `no step named ${reloadAfter}`);
        assert.ok(steps[at].shop, 'the reload does not follow the trading');
        assert.equal(at, steps.length - 1, 'the reload is not after the last step');
    });
    test('the quest and sneak runs do not reload', () => {
        assert.equal(SCRIPTS.quest.reloadAfter, undefined);
        assert.equal(SCRIPTS.sneak.reloadAfter, undefined);
    });
});

describe('keptState and reloadLosses', () => {
    test('a state compared with itself loses nothing', async () => {
        const g = await afterTrading();
        assert.deepEqual(reloadLosses(keptState(g), keptState(g)), []);
    });

    test('it keeps the bag slot by slot, every worn slot, gold, quest stage and position', async () => {
        const k = keptState(await afterTrading());
        assert.deepEqual(k.bag, ['2:rock x1', '3:soap x2']);
        assert.equal(k.worn.weapon, 'lion_whip');
        assert.equal(k.gold, 7);
        assert.deepEqual(k.quest, { id: 'fix_car', stage: 0 });
        assert.deepEqual(k.at, { map: 'factory-map.json', x: 9, y: 14 });
    });

    test('each kept field, changed, is named with what it was and is', async () => {
        const g = await afterTrading();
        const before = keptState(g);
        const cases = [
            ['gold', (s) => { s.gold = 8; }, 'gold: 7 -> 8'],
            ['bag', (s) => { s.bag = s.bag.slice(1); }, 'bag: '],
            ['worn', (s) => { s.worn.weapon = 'wooden_sword'; }, 'worn.weapon: "lion_whip" -> "wooden_sword"'],
            ['quest', (s) => { s.quest.stage = 1; }, 'quest.stage: 0 -> 1'],
            ['at', (s) => { s.at.map = 'town-map.json'; }, 'at.map: "factory-map.json" -> "town-map.json"'],
        ];
        for (const [name, spoil, says] of cases) {
            const after = keptState(g);
            spoil(after);
            const lost = reloadLosses(before, after);
            assert.equal(lost.length, 1, `${name}: ${lost.join('; ')}`);
            assert.ok(lost[0].startsWith(says), `${name}: "${lost[0]}" does not start with "${says}"`);
        }
    });

    test('a worn slot that came back missing is named', async () => {
        const g = await afterTrading();
        const after = keptState(g);
        delete after.worn.left;
        assert.deepEqual(reloadLosses(keptState(g), after), ['worn.left: null -> missing']);
    });
});

describe('through the real save: the check can fail', () => {
    test('an untouched save comes back whole', async () => {
        const g = await afterTrading();
        assert.deepEqual(reloadLosses(keptState(g), keptState(await reloaded(g))), []);
    });

    // Each of these spoils one field of the save the reload carries, the way
    // `--break=<path>` does in the browser; the run must then fail on it.
    for (const [path, says] of [
        ['player.gold', 'gold: 7 -> 8'],
        ['player.equipment.weapon', 'worn.weapon: "lion_whip" -> "wooden_sword"'],
        ['player.inventory', 'bag: '],
        ['player.x', 'at.x: 9 -> 10'],
        ['quest.stageIndex', 'quest.stage: 0 -> 1'],
    ]) {
        test(`a broken ${path} is caught`, async () => {
            const g = await afterTrading();
            const lost = reloadLosses(keptState(g), keptState(await reloaded(g, path)));
            assert.equal(lost.length, 1, lost.join('; '));
            assert.ok(lost[0].startsWith(says), `"${lost[0]}" does not start with "${says}"`);
        });
    }
});

describe('breakSave', () => {
    const save = JSON.stringify({ player: { gold: 7, hidden: false, equipment: { weapon: 'lion_whip' }, inventory: [null, { id: 'rock', count: 1 }, { id: 'soap', count: 2 }] }, quest: null });

    test('a number goes up by one, and nothing else moves', () => {
        const out = JSON.parse(breakSave(save, 'player.gold'));
        const want = JSON.parse(save);
        want.player.gold = 8;
        assert.deepEqual(out, want);
    });
    test('true/false flips, a string becomes an id nothing knows', () => {
        assert.equal(JSON.parse(breakSave(save, 'player.hidden')).player.hidden, true);
        assert.equal(JSON.parse(breakSave(save, 'player.equipment.weapon')).player.equipment.weapon, 'lion_whip_broken');
    });
    test('a list loses its first entry that holds anything', () => {
        assert.deepEqual(JSON.parse(breakSave(save, 'player.inventory')).player.inventory, [null, null, { id: 'soap', count: 2 }]);
    });
    test('a path the save does not have, or nothing to break, throws', () => {
        assert.throws(() => breakSave(save, 'player.golds'), /no player\.golds/);
        assert.throws(() => breakSave(save, 'world.enemies'), /no world\.enemies/);
        assert.throws(() => breakSave(save, 'quest'), /nothing to break/);
    });
});

describe('takeCarry', () => {
    const opts = { script: 'loops', seed: 2, break: null };
    const carry = (o = {}) => JSON.stringify({
        script: 'loops', seed: 2, run: { at: 9 },
        storage: { 'violencetown.save': JSON.stringify({ player: { gold: 7 } }), 'violencetown.settings': '{}' }, ...o,
    });

    test('the key is the autoplay\'s own, apart from the save and the settings', () => {
        assert.equal(CARRY_KEY, 'violencetown.autoplay.carry');
    });
    test('no carry, a broken one, or another run\'s is ignored', () => {
        assert.equal(takeCarry(null, opts), null);
        assert.equal(takeCarry('{not json', opts), null);
        assert.equal(takeCarry(carry({ script: 'quest' }), opts), null);
        assert.equal(takeCarry(carry({ seed: 1 }), opts), null);
        assert.equal(takeCarry(carry({ storage: null }), opts), null);
    });
    test('this run\'s carry comes back as it was written', () => {
        const c = takeCarry(carry(), opts);
        assert.deepEqual(c.run, { at: 9 });
        assert.deepEqual(JSON.parse(c.storage['violencetown.save']), { player: { gold: 7 } });
        assert.equal(c.storage['violencetown.settings'], '{}');
    });
    test('with a break, only the save is spoiled', () => {
        const c = takeCarry(carry(), { ...opts, break: 'player.gold' });
        assert.deepEqual(JSON.parse(c.storage['violencetown.save']), { player: { gold: 8 } });
        assert.equal(c.storage['violencetown.settings'], '{}');
    });
});
