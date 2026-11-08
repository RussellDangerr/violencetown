// fire-ring-craft.test.js — Platero sets a Fire Ring from three Fire Blood
// (plans/fr1-platero-fire-ring.md). Played with the real keydown listener from
// main.js and the real dialogue, craft and ring methods, lifted out as in
// act1-end-direction.test.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDialogue } from '../game/dialogue.js';
import { transferGold } from '../game/trade.js';
import { applyDispositionDelta } from '../game/give-action.js';
import { ITEMS } from '../game/items.js';
import { RINGS, FUSIONS } from '../game/ring-data.js';
import { acquireRing, slotRing, slottedActives, resolveAdjacencies, aggregatePassives, mergeKnown, findFusion } from '../game/rings.js';
import { DEVICE_TABS, cycleDeviceTab, deviceRingsLayout, deviceBodyRect, ringPassiveRows } from '../game/layout.js';
import { attack, formatDamageNumber, computeHit, elementalMult, weaponHitKind, isBackstab } from '../game/combat.js';
import { emitNoise, NOISE } from '../game/perception.js';
import { HEAVY_HIT_DAMAGE } from '../game/hit-splat.js';
import { defaultVerb } from '../game/wheel-model.js';
import { SPELLS } from '../game/spells.js';
import { TRICKS } from '../game/tricks.js';
import { sumBuffStat } from '../game/buffs.js';
import { Enemy } from '../game/enemies.js';
import { RNG } from '../game/rng.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const eol = mainSrc.indexOf('\n', at);
    const oneLine = mainSrc.slice(at, eol).trimEnd().endsWith('}');
    const closeAt = oneLine ? eol - 1 : mainSrc.indexOf('\n    }', at);
    const body = oneLine ? mainSrc.slice(at + name.length, eol).trimEnd()
                         : mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    try { return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
    } catch (e) { throw new Error(`${name}: ${e.message}`); }
}
const liveConst = (name) => {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*`).exec(mainSrc);
    const from = m.index + m[0].length;
    return new Function(`'use strict'; return ${mainSrc.slice(from, mainSrc.indexOf('\n};', from) + 2)}`)();
};
const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
const RING_IGNITE_DAMAGE = Number(/const RING_IGNITE_DAMAGE\s*=\s*(\d+);/.exec(mainSrc)[1]);
const BASE_SPELLS = ['fireball', 'coneOfCold'];
const DIALOGUE_HOSTILE_AT = Number(/const DIALOGUE_HOSTILE_AT = (-?\d+);/.exec(mainSrc)[1]);

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

function makeGame({ fireBlood = [] } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const audio = { playSfx() {}, playMusic() {} };
    const platero = { id: 'dt-platero', name: 'Platero', dialogueId: 'platero', disposition: 10, x: 7, y: 10,
                      entity: { isAlive: () => true } };
    const g = {
        state: STATE.IDLE, facing: 'up', playerX: 7, playerY: 11,
        inventory: fireBlood.map(count => ({ itemDef: ITEMS.fire_blood, count })),
        enemies: [platero], containers: [], examinables: [], gold: 0, logs: [],
        ownedRings: new Set(), ringSlots: {}, ringTier: 1, discoveredFusions: new Set(),
        equipment: {}, ringMods: {}, knownSpells: [...BASE_SPELLS], grantedTricks: [],
        map: { getTile: () => 0 }, buffs: [], turn: 0, rng: new RNG(1), splats: [],
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _paused: false, _deviceTab: 'items', _deviceSel: null, _journalScroll: 0,
        renderer: {}, platero,
        _log(m) { this.logs.push(m); },
        _earshot() { return []; }, _spawnHitSplat(x, y, text, type) { this.splats.push({ text, type }); },
        _ensureParticleLoop() {}, _triggerScreenShake() {}, _spreadFireBlood() {},
        _handleEnemyDeath(e) { this.deaths = (this.deaths || 0) + 1; },
        _render() {}, _resumeHeldWalk() {}, _stopAutoRepeat() {}, _onEntityHarmed() {}, _wheelOpenerUp() {},
        hasBuff() { return false; }, emitGameEvent() {},
    };
    const free = {
        STATE, DIRS, audio, document, window, DEVICE_TABS, cycleDeviceTab,
        getDialogue, transferGold, applyDispositionDelta, DIALOGUE_HOSTILE_AT,
        performance: { now: () => 0 }, setTimeout: () => 0,
        RINGS, acquireRing, slotRing, FUSIONS, SPELLS, TRICKS, mergeKnown, BASE_SPELLS, slottedActives,
        resolveAdjacencies, aggregatePassives, defaultVerb, sumBuffStat, RING_IGNITE_DAMAGE,
        attack, formatDamageNumber, computeHit, elementalMult, weaponHitKind, isBackstab,
        emitNoise, NOISE, HEAVY_HIT_DAMAGE,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_digitToSlot', 'code'], ['_openDevice', "tab = 'items'"],
        ['_closeDevice', ''], ['_deviceKey', 'code'], ['_deviceCycleTab', 'dir'], ['_openWorldMap', ''],
        ['_scrollJournal', 'delta'], ['_openDialogue', 'npc'], ['_closeDialogue', ''], ['_dialogueChoices', ''],
        ['_pickDialogueChoice', 'choice'], ['_removeFromSlot', 'slot'],
        ['_refreshGrantedSkills', ''], ['_targetAt', 'x, y'], ['_actOnTarget', 'verb, t'], ['_fireResolver', 'verb, t'],
        ['combatAttack', 'enemyObj, damage, opts = {}'], ['_applyTrigger', 'trigger, enemyObj'], ['_poitionMod', 'stat'],
        ['_fashionRing', 'materialId, ringId, count = 1, price = 0'], ['_acquireRing', 'ringId'],
    ]) g[n] = liveMethod(n, p, free);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    return g;
}

async function pickRow(g, id) {
    // Face Platero (he stands one tile up) and press the talk key, as a player does.
    g.facing = 'up';
    await g.press('KeyE');
    assert.equal(g.state, STATE.DIALOGUE, 'E on a faced Platero opens his talk');
    const row = g._dialogueChoices().findIndex(c => c.id === id);
    assert.ok(row >= 0, `Platero offers ${id}`);
    for (let i = 0; i < row; i++) await g.press('ArrowDown');
    await g.press('Space');
}
const fireBloodCount = (g) => g.inventory.reduce((n, s) => n + (s && s.itemDef.id === 'fire_blood' ? s.count : 0), 0);

describe('Platero sets a Fire Ring', () => {
    test('with three Fire Blood (across two stacks) he takes exactly three and gives the ring', async () => {
        const g = makeGame({ fireBlood: [2, 2] });
        await pickRow(g, 'fashion_fire');
        assert.ok(g.ownedRings.has('fire_ring'));
        assert.equal(fireBloodCount(g), 1, 'four in, three taken, one left');
        assert.ok(Object.values(g.ringSlots).includes('fire_ring'), 'the ring is worn at once');
        assert.equal(g.gold, 0);
    });

    test('with too little Fire Blood nothing is taken and the old line shows', async () => {
        const g = makeGame({ fireBlood: [2] });
        await pickRow(g, 'fashion_fire');
        assert.ok(!g.ownedRings.has('fire_ring'));
        assert.equal(fireBloodCount(g), 2);
        assert.ok(g.logs.some(l => l.includes('Bring me the material')), g.logs.join(' | '));
    });

    test('the Rat Ring choice still works as before', async () => {
        const g = makeGame();
        g.inventory.push({ itemDef: { id: 'wererat_fur' }, count: 1 });
        await pickRow(g, 'fashion_rat');
        assert.ok(g.ownedRings.has('rat_ring'));
        assert.equal(g.inventory.filter(Boolean).length, 0);
    });

    test('a price, when given, is paid in gold and refused when short', () => {
        const g = makeGame({ fireBlood: [3] });
        g.gold = 4;
        assert.equal(g._fashionRing('fire_blood', 'fire_ring', 3, 5), false);
        assert.equal(fireBloodCount(g), 3);
        g.gold = 9;
        assert.equal(g._fashionRing('fire_blood', 'fire_ring', 3, 5), true);
        assert.equal(g.gold, 4);
    });

    test('Fire Ring beside the Rat Ring: the real refresh grants the Ember Rat and the link is fusible', async () => {
        const g = makeGame({ fireBlood: [3] });
        g._acquireRing('rat_ring');
        await pickRow(g, 'fashion_fire');
        g.ringSlots = { 'left:ring': 'rat_ring', 'left:middle': 'fire_ring' };
        g._refreshGrantedSkills();
        assert.ok(g.discoveredFusions.has('ember_rat'));
        assert.ok(g.grantedTricks.includes('ember_rat'), 'the Ember Rat trick is granted');
        // The spark on the Hands tab is drawn when this holds for two linked rings (renderer.js ~2857).
        assert.ok(findFusion(RINGS.rat_ring, RINGS.fire_ring, FUSIONS), 'the pair is a fusion, so the spark draws');
        assert.equal(g.ringMods.fireDamage, 10);
    });
});

describe('the Fire Ring in a fight (the real combatAttack and _applyTrigger)', () => {
    const foe = () => new Enemy({ id: 'dummy', type: 'dummy', x: 7, y: 8 });
    const wear = (g) => { g.ringSlots = { 'left:ring': 'fire_ring' }; g._refreshGrantedSkills(); };
    const hit = (g, e, dmg, opts) => { const before = e.entity.hp; g.combatAttack(e, dmg, opts); return before - e.entity.hp; };

    test('worn, the ring adds its percent to a fire hit and not to a plain one', () => {
        const bare = makeGame(); bare.rng = { float: () => 0.99 };   // no proc: damage alone
        const worn = makeGame(); worn.rng = { float: () => 0.99 }; wear(worn);
        const fireBare = hit(bare, foe(), 20, { type: 'fire' });
        const fireWorn = hit(worn, foe(), 20, { type: 'fire' });
        assert.equal(fireWorn, computeHit({ base: 20 * 1.1, elemental: 1 }));
        assert.ok(fireWorn > fireBare, `fire hit ${fireBare} -> ${fireWorn}`);
        const plainBare = hit(bare, foe(), 20, {});
        const plainWorn = hit(worn, foe(), 20, {});
        assert.equal(plainWorn, plainBare, 'a plain hit is not boosted');
    });

    test('on a hit the ring ignites the target for the cinder damage when its chance rolls; not when it does not', () => {
        const g = makeGame(); wear(g);
        const miss = foe(); g.rng = { float: () => 0.99 };
        const base = hit(g, miss, 20, {});
        assert.ok(!g.logs.some(l => l.includes('Cinders catch')), 'no proc, no cinders');
        const burn = foe(); g.rng = { float: () => 0 };
        const total = hit(g, burn, 20, {});
        assert.equal(total, base + RING_IGNITE_DAMAGE, 'the cinder damage lands on top of the hit');
        assert.ok(g.logs.some(l => l.includes('Cinders catch')));
        assert.ok(g.splats.some(s => s.type === 'fire'));
    });

    test('a fire-immune target takes no cinders (the 0-contract)', () => {
        const g = makeGame(); wear(g); g.rng = { float: () => 0 };
        const e = new Enemy({ id: 'imp', type: 'imp', x: 7, y: 8, immune: ['fire'] });
        g.combatAttack(e, 20, {});
        assert.ok(!g.logs.some(l => l.includes('Cinders catch')));
    });
});

describe('the Hands tab shows the Fire Ring', () => {
    test('opened with real keys, a worn Fire Ring has its passive row', async () => {
        const g = makeGame();
        g._acquireRing('fire_ring');
        await g.press('Tab');
        await g.press('KeyR');
        assert.equal(g._deviceTab, 'rings');
        const worn = deviceRingsLayout(deviceBodyRect(), g).sockets.filter(s => s.ringId === 'fire_ring');
        assert.equal(worn.length, 1, 'the ring sits in a socket on the Hands tab');
        assert.deepEqual(ringPassiveRows(RINGS[worn[0].ringId]).map(r => [r.key, r.value]), [['fireDamage', 10]]);
    });
});
