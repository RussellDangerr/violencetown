// enemy-worn-gear.test.js — TG1 (plans/tg1-enemies-wear-armour.md), TGR1 pick a.
//
// A fighter whose kit lists armour puts one piece on at spawn: out of the kit, into
// `equipped`, and that piece's number is all the armour it has (TG1R4). That is what lights Thieve's Gear branch on
// ordinary enemies. The pure rules are tested first; then the spawn on the real
// maps (a Greedy Green, the Were-Rat, a rival); then Thieve through the real
// wheel with real keys.
//
// main.js touches `document` at import, so, as in rat-robbery.test.js, the real
// methods are lifted out of the source and bound onto a small game object, and
// every key is a real key through the listeners _bindInput registers.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap } from '../game/map.js';
import { Enemy, spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { dropLoadout } from '../game/drops.js';
import { resolveItemDef } from '../game/item-registry.js';
import { ITEMS } from '../game/items.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { addToInventory as addToInv } from '../game/inventory.js';
import { RNG } from '../game/rng.js';
import {
    isWearable, pieceToWear, dressOne, gearWeight,
    coinTake, kitTake, gearTake, coinWeight, itemWeight, noticeBuffer, isClean, stealLimit,
} from '../game/theft.js';
import { perceives } from '../game/perception.js';
import { transferGold } from '../game/trade.js';
import { reactToTransaction } from '../game/give-action.js';
import { recordUse, skillPerks, mergePassives } from '../game/skills.js';
import { takeable, targetPanel } from '../game/fight-panels.js';
import { settleItems } from '../game/rivals.js';
import {
    createWheelState, cycle, drill, back, compose, autoAimTile,
    needsFriendlyConfirm, aimRange, selectedNode, restoreLastCategory, verbApplies,
} from '../game/wheel-model.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const mainSrc = read('../game/main.js');
const factoryJson = read('../game/factory-map.json');
const spawnById = (id) => JSON.parse(factoryJson).enemies.find((s) => s.id === id);
const greenSpawn = () => spawnById('green1');

const ARMOUR = ['foil_hat', 'cardboard_cuirass', 'latex_gloves', 'shoe_bags', 'red_cape'];

describe('what counts as armour to wear', () => {
    test('the five scavenger pieces are wearable', () => {
        for (const id of ARMOUR) assert.equal(isWearable(resolveItemDef(id)), true, id);
    });

    test('a Bandage and a Soap are not: their armour is on a wear timer', () => {
        assert.ok(ITEMS.bandage.armor > 0 && ITEMS.bandage.equipDuration, 'the premise: armour with a timer');
        assert.equal(isWearable(ITEMS.bandage), false);
        assert.equal(isWearable(ITEMS.soap), false);
    });

    test('a weapon is not, and neither is a thing with no armour', () => {
        assert.equal(isWearable(resolveItemDef('wooden_sword')), false);
        assert.equal(isWearable(resolveItemDef('pipe')), false);
        assert.equal(isWearable(ITEMS.rock), false);
        assert.equal(isWearable(null), false);
    });
});

describe('which piece goes on', () => {
    test('the heaviest by Thieve gearWeight', () => {
        const pick = pieceToWear(['hot_dog', 'foil_hat', 'latex_gloves', 'cardboard_cuirass', 'soap'], resolveItemDef);
        assert.equal(pick.def.id, 'cardboard_cuirass');
        assert.equal(pick.index, 3);
        assert.ok(gearWeight(ITEMS.cardboard_cuirass) > gearWeight(ITEMS.foil_hat));
    });

    test('a tie goes to the one authored first', () => {
        assert.equal(gearWeight(ITEMS.foil_hat), gearWeight(ITEMS.shoe_bags), 'the premise: a tie');
        assert.equal(pieceToWear(['shoe_bags', 'foil_hat'], resolveItemDef).def.id, 'shoe_bags');
        assert.equal(pieceToWear(['foil_hat', 'shoe_bags'], resolveItemDef).def.id, 'foil_hat');
    });

    test('no armour in the kit: nothing goes on, and the number is left as it is', () => {
        const kit = ['hot_dog', 'bandage', 'rock'];
        assert.deepEqual(dressOne(5, kit, resolveItemDef), { armor: 5, loadout: kit, worn: null });
    });

    test('a negative softness number is left as it is when the kit has no armour', () => {
        const kit = ['rock', 'tunnel_mushroom'];
        assert.deepEqual(dressOne(-40, kit, resolveItemDef), { armor: -40, loadout: kit, worn: null });
        assert.deepEqual(dressOne(0, [], resolveItemDef), { armor: 0, loadout: [], worn: null });
    });

    test('one piece only: the rest of the armour stays in the kit', () => {
        const out = dressOne(3, ['foil_hat', 'latex_gloves', 'cardboard_cuirass'], resolveItemDef);
        assert.equal(out.worn, 'cardboard_cuirass');
        assert.deepEqual(out.loadout, ['foil_hat', 'latex_gloves']);
        assert.equal(out.armor, ITEMS.cardboard_cuirass.armor, 'the piece is all the armour it has');
    });

    test('its own authored number goes: a soft enemy and a hard one both end on the piece', () => {
        for (const own of [-60, 0, 3, 6]) {
            assert.equal(dressOne(own, ['foil_hat'], resolveItemDef).armor, ITEMS.foil_hat.armor, `from ${own}`);
        }
    });

    test('a piece you stole stays stolen: the next-heaviest does not go on in its place', () => {
        const out = dressOne(3, ['foil_hat', 'latex_gloves', 'cardboard_cuirass'], resolveItemDef, ['cardboard_cuirass']);
        assert.equal(out.worn, null);
        assert.equal(out.armor, 0, 'it stands where the lift left it: at 0');
        assert.deepEqual(out.loadout, ['foil_hat', 'latex_gloves']);
    });
});

describe('a Greedy Green spawns wearing its heaviest piece', () => {
    test('the cuirass moves from the kit to the body, and its number replaces the authored one', () => {
        const spec = greenSpawn();
        assert.equal(spec.armor, 3);
        assert.ok(spec.loadout.includes('cardboard_cuirass'));
        const e = spawnEnemy(resolveSpawn(spec, defaultPicks()));
        assert.deepEqual(e.equipped, ['cardboard_cuirass']);
        assert.equal(e.entity.armor, ITEMS.cardboard_cuirass.armor, 'the piece and nothing else');
        assert.equal(e.loadout.includes('cardboard_cuirass'), false);
        assert.deepEqual(e.loadout, ['hot_dog', 'foil_hat', 'latex_gloves', 'soap'], 'the rest of the kit is as authored');
    });

    test('Thieve Gear is lit on it, and the panel says what it wears', () => {
        const e = spawnEnemy(resolveSpawn(greenSpawn(), defaultPicks()));
        assert.equal(takeable(e).gear, true);
        const panel = targetPanel(e);
        assert.equal(panel.armor, ITEMS.cardboard_cuirass.armor);
        assert.deepEqual(panel.worn.map((w) => w.id), ['cardboard_cuirass']);
        assert.equal(panel.worn[0].name, ITEMS.cardboard_cuirass.name);
        assert.equal(panel.kit.some((k) => k.id === 'cardboard_cuirass'), false, 'worn is not also carried');
    });

    test('loading the zone again puts on one piece, not two', () => {
        const spec = resolveSpawn(greenSpawn(), defaultPicks());
        const a = spawnEnemy(spec);
        const b = spawnEnemy(spec);
        assert.deepEqual(b.equipped, a.equipped);
        assert.equal(b.entity.armor, a.entity.armor);
        assert.deepEqual(b.loadout, a.loadout);
    });

    test('a save and reload keeps what it wears, with no second piece', () => {
        const e = spawnEnemy(resolveSpawn(greenSpawn(), defaultPicks()));
        const back = Enemy.fromSave(JSON.parse(JSON.stringify(e.toSave())));
        assert.deepEqual(back.equipped, ['cardboard_cuirass']);
        assert.equal(back.entity.armor, e.entity.armor);
        assert.deepEqual(back.loadout, e.loadout);
    });

    test('a mugged enemy comes back broke and bare: no kit lists armour, so it keeps its number', () => {
        const spec = resolveSpawn(greenSpawn(), defaultPicks());
        const e = spawnEnemy(spec, new Set([spec.id]));
        assert.deepEqual(e.loadout, []);
        assert.equal(e.equipped ?? null, null);
        assert.equal(e.entity.armor, 3);
        assert.equal(takeable(e).gear, false);
    });

    test('a piece Thieve took stays gone: re-entry wears nothing in its place', () => {
        const spec = resolveSpawn(greenSpawn(), defaultPicks());
        const robbed = { [spec.id]: { gold: 0, items: ['cardboard_cuirass'], weightTaken: 8, noticed: false } };
        const e = spawnEnemy(spec, null, robbed);
        assert.equal(e.equipped ?? null, null);
        assert.equal(e.entity.armor, 0, 'where the lift left it, not back at the authored number');
        assert.equal(e.loadout.includes('cardboard_cuirass'), false);
        assert.equal(e.loadout.includes('foil_hat'), true, 'the foil hat stays in the kit and does not go on');
        assert.equal(takeable(e).gear, false);
    });
});

describe('every enemy that can wear something, does', () => {
    const maps = ['sewer', 'downtown', 'factory', 'borgir', 'carnival', 'graveyard', 'frozen'];
    const spawns = [];
    for (const m of maps) {
        const doc = JSON.parse(read(`../game/${m}-map.json`));
        for (const s of doc.enemies || []) spawns.push({ m, s: resolveSpawn(s, defaultPicks()) });
    }

    test('the guard that this scans something: several enemies carry armour', () => {
        const carriers = spawns.filter(({ s }) => (s.loadout || []).some((id) => isWearable(resolveItemDef(id))));
        assert.ok(carriers.length >= 8, `only ${carriers.length} carriers`);
    });

    test('a carrier that fights wears exactly one wearable piece and still carries the rest', () => {
        for (const { m, s } of spawns) {
            const kit = s.loadout || [];
            const wearable = kit.filter((id) => isWearable(resolveItemDef(id)));
            const e = spawnEnemy(s);
            const fights = (e.damage ?? 0) > 0 && !e.ambient && !e.vendor;
            const worn = (e.equipped || []).filter((id) => isWearable(resolveItemDef(id)));
            if (fights && wearable.length) {
                assert.equal(worn.length, 1, `${m}/${s.id} wears one piece`);
                const left = (e.loadout || []).filter((id) => isWearable(resolveItemDef(id)));
                assert.equal(left.length, wearable.length - 1, `${m}/${s.id} carries the rest`);
                const piece = resolveItemDef(worn[0]);
                assert.equal(e.entity.armor, piece.armor, `${m}/${s.id}: its armour is the piece and nothing else`);
                const heaviest = pieceToWear(kit, resolveItemDef).def;
                assert.equal(worn[0], heaviest.id, `${m}/${s.id} wears the heaviest`);
            } else {
                assert.equal(worn.length, 0, `${m}/${s.id} wears nothing`);
                assert.equal(e.entity.armor, s.armor ?? 0, `${m}/${s.id} keeps its number`);
            }
        }
    });

    test('Law 3: no enemy is put outside the band', () => {
        for (const { m, s } of spawns) {
            const e = spawnEnemy(s);
            if ((s.armor ?? 0) <= 10) assert.ok(e.entity.armor <= 10 && e.entity.armor >= -90, `${m}/${s.id} is at ${e.entity.armor}`);
        }
    });

    test('bosses wear too: the Were-Rat keeps its sword in worn gear and adds its cuirass', () => {
        const wr = spawns.find(({ s }) => s.tag === 'wererat_boss');
        assert.ok(wr, 'the sewer boss is on the sewer map');
        const e = spawnEnemy(wr.s);
        assert.deepEqual(e.equipped, ['wooden_sword', 'cardboard_cuirass']);
        assert.equal(e.entity.armor, ITEMS.cardboard_cuirass.armor, 'its authored 6 is gone');
        assert.equal(wr.s.armor, 6, 'the authored number is untouched in the data (the bench reads it)');
        const bosses = spawns.filter(({ s }) => s.boss && (s.loadout || []).some((id) => isWearable(resolveItemDef(id))));
        assert.ok(bosses.length >= 4, `only ${bosses.length} bosses carry armour`);
        for (const { m, s } of bosses) assert.ok(spawnEnemy(s).equipped.some((id) => isWearable(resolveItemDef(id))), `${m}/${s.id} wears a piece`);
    });

    test('an enemy whose kit has no armour keeps its number as it is, whatever it is', () => {
        const bare = spawns.filter(({ s }) => !(s.loadout || []).some((id) => isWearable(resolveItemDef(id))));
        assert.ok(bare.length >= 10, `only ${bare.length} enemies have no armour in the kit`);
        for (const { m, s } of bare) {
            const e = spawnEnemy(s);
            assert.equal(e.entity.armor, s.armor ?? 0, `${m}/${s.id}`);
            assert.deepEqual(e.loadout, s.loadout ?? e.loadout, `${m}/${s.id} kit untouched`);
        }
    });
});

describe('a rival that took your things (Nemesis)', () => {
    test('carries them in its kit, wears none of them, and can still be lifted from', () => {
        const spec = resolveSpawn({ ...greenSpawn(), loadout: ['hot_dog'] }, defaultPicks());
        const yours = ['cardboard_cuirass', 'foil_hat'];
        const rival = spawnEnemy(spec, null, null, yours);
        assert.equal(rival.equipped ?? null, null, 'your armour is not put on');
        assert.equal(rival.entity.armor, 3, 'and it is no harder to fight for having it: no armour of its own, so its number stands');
        assert.deepEqual(rival.loadout, ['hot_dog', ...yours]);
        assert.deepEqual(takeable(rival), { coin: true, kit: true, gear: false });
    });

    test('with armour of its own it wears that, and what it took stays in the kit', () => {
        const rival = spawnEnemy(resolveSpawn(greenSpawn(), defaultPicks()), null, null, ['cardboard_cuirass']);
        assert.deepEqual(rival.equipped, ['cardboard_cuirass'], 'its own piece');
        assert.equal(rival.entity.armor, ITEMS.cardboard_cuirass.armor, 'one piece, not two');
        assert.equal(rival.loadout.filter((id) => id === 'cardboard_cuirass').length, 1, 'yours is still carried');
    });

    test('the record settles to what is still yours: its own worn piece is not counted as yours', () => {
        const spec = resolveSpawn(greenSpawn(), defaultPicks());
        const record = ['cardboard_cuirass'];
        const live = spawnEnemy(spec, null, null, record).loadout;
        const base = spawnEnemy(spec).loadout;
        assert.deepEqual(settleItems(record, live, base), ['cardboard_cuirass']);
        // Thieve lifts yours out of the kit: nothing is left owed.
        const afterLift = live.filter((_, i) => i !== live.lastIndexOf('cardboard_cuirass'));
        assert.deepEqual(settleItems(record, afterLift, base), []);
    });

    test('killing it still hands your things back: what it carries is its kit', () => {
        const spec = resolveSpawn({ ...greenSpawn(), loadout: ['hot_dog'] }, defaultPicks());
        const rival = spawnEnemy(spec, null, null, ['cardboard_cuirass']);
        assert.ok(rival.loadout.includes('cardboard_cuirass'), 'the kill drop reads loadout');
    });
});

// ── The wheel, with real keys ───────────────────────────────────────────────

function liveMethod(name, params, freeVars) {
    const signature = `\n    ${name}(${params}) {`;
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at + 1);
    const body = mainSrc.slice(at + 5 + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map((n) => freeVars[n]));
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
        this.code = code;
        this.key = code;
        this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };

const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

const LIFTED = [
    ['_bindInput', ''], ['_wheelOpenerDown', ''], ['_wheelOpenerUp', ''], ['_openWheel', ''], ['_closeWheel', ''],
    ['_wheelCycle', 'dir'], ['_wheelBack', ''], ['_wheelDrill', ''], ['_wheelCommit', ''],
    ['_reticleKey', 'code'], ['_fireWheel', ''], ['_digitToSlot', 'code'],
    ['canThieve', 'branch'], ['_thieveTarget', 'aimTile'], ['_theftPassives', ''], ['_countCleanLift', ''],
    ['_addToInventory', 'itemDef'],
];

// A hidden player beside a Greedy Green, on the real factory map, with the real wheel.
function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const doc = JSON.parse(factoryJson);
    const map = new GameMap(doc, 'factory-map.json');
    const green = spawnEnemy(resolveSpawn(spawnById('green1'), defaultPicks()));
    let clock = 1000;
    const g = {
        state: STATE.IDLE, facing: 'right', turn: 1, map, _mapUrl: 'factory-map.json',
        enemies: [green], containers: [], groundItems: [], examinables: [],
        playerX: green.x - 1, playerY: green.y, gold: 0,
        buffs: [], ringMods: {}, skills: {}, equipment: { weapon: resolveItemDef('wooden_sword') },
        inventory: Array(INVENTORY_SIZE).fill(null),
        rng: new RNG(5), wheel: createWheelState(),
        _heldDirKeys: [], _physicalHeld: new Set(), _animating: false, _paused: false,
        _robbed: {}, _hot: {}, logs: [], advanced: 0,
        _log(m) { this.logs.push(m); },
        _render() {}, _stopAutoRepeat() {}, _resumeHeldWalk() {}, _ensureParticleLoop() {},
        _resolveItemDef: resolveItemDef,
        _canRepeatLast() { return false; },
        _aimRange(leaf) { return aimRange(leaf, this); },   // main.js's one-line delegate
        _advanceWorld() { this.advanced++; },
        isHidden() { return true; },        // stealth is its own feature; the wheel only asks
        refreshGranted() {},
    };
    // The green stands still and unaware; it is beside you, so the lift is in reach.
    green.state = 'idle';
    green._lastDx = 1; green._lastDy = 0;
    const free = {
        STATE, DIRS, document, window,
        audio: { playSfx() {} },
        Settings: { get: () => 'tap-toggle' },
        performance: { now: () => (clock += 1000) },
        createWheelState, cycle, drill, back, compose, autoAimTile, needsFriendlyConfirm, aimRange,
        selectedNode, restoreLastCategory, verbApplies,
        takeable, cheb, perceives, transferGold, reactToTransaction,
        coinTake, kitTake, gearTake, coinWeight, itemWeight, gearWeight, noticeBuffer, isClean, stealLimit,
        recordUse, skillPerks, mergePassives,
        addToInv, SAFE_SLOTS, MAX_STACK, PACK_PAGE,
    };
    for (const [n, p] of LIFTED) g[n] = liveMethod(n, p, free);
    // The Thieve resolver lives inside _fireWheel; _addToInventory is the real bag add.
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    return { g, green };
}

// Drive the wheel to Trick > Thieve > Gear with the keys, the way a player would.
async function toThieveGear(g) {
    await g.press('Space');
    assert.equal(g.state, STATE.RADIAL_MENU, 'Space opened the wheel');
    const at = () => selectedNode(g.wheel).key;
    for (let i = 0; i < 6 && at() !== 'trick'; i++) await g.press('ArrowRight');
    assert.equal(at(), 'trick');
    await g.press('ArrowUp');                                   // drill into Trick
    for (let i = 0; i < 8 && at() !== 'thieve'; i++) await g.press('ArrowRight');
    assert.equal(at(), 'thieve');
    await g.press('ArrowUp');                                   // drill into Thieve
    for (let i = 0; i < 4 && at() !== 'gear'; i++) await g.press('ArrowRight');
    assert.equal(at(), 'gear');
    await g.press('ArrowUp');                                   // drill the leaf: aim
    assert.equal(g.wheel.aiming, true, 'Gear asked where to aim');
}

describe('Thieve Gear off a Greedy Green, through the wheel, with real keys', () => {
    test('the Gear slice is lit on a Greedy Green and was dark before it wore anything', () => {
        const { g, green } = makeGame();
        assert.equal(g.canThieve('gear'), true);
        green.equipped = null;
        assert.equal(g.canThieve('gear'), false, 'with nothing worn the slice greys out');
    });

    test('Space, Trick, Thieve, Gear, then a press toward it: the cuirass is yours and its armour drops', async () => {
        const { g, green } = makeGame();
        const before = green.entity.armor;
        assert.equal(before, ITEMS.cardboard_cuirass.armor);
        await toThieveGear(g);
        await g.press('ArrowRight');                            // toward the green: lock and commit
        assert.ok(g.logs.includes(`[Lifted the ${ITEMS.cardboard_cuirass.name}.]`), g.logs.join(' | '));
        assert.deepEqual(green.equipped, [], 'it no longer wears it');
        assert.equal(green.entity.armor, 0, 'the piece was all it had');
        assert.equal(g.advanced, 1, 'one world turn');
        assert.ok(g._robbed[green.id].items.includes('cardboard_cuirass'), 'recorded, so it stays gone');
        assert.ok(g.inventory.some((s) => s && s.itemDef.id === 'cardboard_cuirass'), 'it is in your bag');
        assert.equal(g.state, STATE.IDLE, 'the wheel closed');
        assert.equal(g.canThieve('gear'), false, 'nothing left to take');
    });

    test('after the lift, coming back to the zone wears nothing and the cuirass stays stolen', async () => {
        const { g, green } = makeGame();
        await toThieveGear(g);
        await g.press('ArrowRight');
        const again = spawnEnemy(resolveSpawn(spawnById('green1'), defaultPicks()), null, g._robbed);
        assert.equal(again.equipped ?? null, null);
        assert.equal(again.entity.armor, 0);
        assert.equal(again.loadout.includes('cardboard_cuirass'), false);
        assert.equal(takeable(again).gear, false);
        assert.ok(green);
    });
});

// ── A kill ──────────────────────────────────────────────────────────────────

describe('killing a wearer (TG1R2: worn gear is gone with them)', () => {
    // The real _handleEnemyDeath on a stand-in game, as drops.test.js does: with
    // no bag it drops the kit to the floor.
    const handleDeath = liveMethod('_handleEnemyDeath', 'enemyObj', {
        audio: { playSfx() {} }, transferGold, dropLoadout, ITEMS, requiredDropFor, dropLineFor,
        onSewerEnemyKilled() {},
    });
    function kill(spec) {
        const e = spawnEnemy(resolveSpawn(spec, defaultPicks()));
        const g = {
            enemies: [e], groundItems: [], logs: [], gold: 0, map: { enemySpawns: [spec] },
            _muggedIds: new Set(), _log(m) { this.logs.push(m); }, _spawnEventWord() {}, emitGameEvent() {},
            _recordDrop() {}, _bossFirstFall: () => true, questEngine: null,
            hasItem: () => false, _alreadyHasRayGun: () => false, _bossDropsGiven: new Set(),
        };
        e.entity.hp = 0; e.entity.alive = false;
        const wore = [...e.equipped];
        const carried = [...e.loadout];
        handleDeath.call(g, e);
        return { g, wore, carried };
    }

    test('the rest of the kit drops, and the worn piece is not among it', () => {
        const { g, wore, carried } = kill(greenSpawn());
        assert.deepEqual(wore, ['cardboard_cuirass']);
        const dropped = g.groundItems.map((d) => d.type);
        assert.deepEqual([...dropped].sort(), [...carried].sort(), 'everything it carried');
        assert.equal(dropped.includes('cardboard_cuirass'), false, 'the piece it wore goes with it');
        assert.ok(dropped.includes('foil_hat'), 'a spare piece it only carried does drop');
    });
});
