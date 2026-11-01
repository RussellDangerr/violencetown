// tw1 — the aim strip's lift preview.
//
// liftPreview (game/theft.js) re-derives, read-only, what the lift in main.js is
// about to do. The resolver in main.js is deliberately left alone, so the
// arithmetic exists twice and these tests are what keep the two honest: they
// press real keys to aim, ask the preview, then FIRE the real lift and compare.
//
// The Game's own wheel and key methods are lifted out of main.js and run for real
// (the technique of thieve-wheel.test.js).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    createWheelState, cycle, drill, back, compose, autoAimTile, needsFriendlyConfirm,
    selectedNode, verbApplies, restoreLastCategory, aimRange,
} from '../game/wheel-model.js';
import { perceives, spotters } from '../game/perception.js';
import { coinTake, kitTake, gearTake, pickKit, pickGear, coinWeight, itemWeight, gearWeight,
         noticeBuffer, isClean, stealLimit, liftPreview, LIFT_WORDS } from '../game/theft.js';
import { transferGold } from '../game/trade.js';
import { takeable } from '../game/fight-panels.js';
import { recordUse, skillPerks, mergePassives } from '../game/skills.js';
import { reactToTransaction } from '../game/give-action.js';
import { isHostile } from '../game/ai.js';
import { Enemy } from '../game/enemies.js';

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
const rendererSrc = readFileSync(new URL('../game/renderer.js', import.meta.url), 'utf8');
const classAt = mainSrc.indexOf('class Game {');

function liveMethod(signature, freeVars = {}) {
    const start = mainSrc.indexOf(signature, classAt);
    assert.ok(start > 0, `${signature} not found in main.js`);
    const lineEnd = mainSrc.indexOf('\n', start);
    const oneLiner = mainSrc.slice(start, lineEnd).trimEnd().endsWith('}');
    const end = oneLiner ? lineEnd : mainSrc.indexOf('\n    }', start) + '\n    }'.length;
    const body = mainSrc.slice(start + signature.indexOf('('), end);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

function liveRadialKeys(freeVars) {
    const head = 'if (this.state === STATE.RADIAL_MENU) {';
    const from = mainSrc.indexOf(head, classAt);
    assert.ok(from > 0, 'the RADIAL_MENU key branch was not found in main.js');
    let depth = 0, i = from + head.length - 1;
    for (; i < mainSrc.length; i++) {
        if (mainSrc[i] === '{') depth++;
        else if (mainSrc[i] === '}' && --depth === 0) break;
    }
    const block = mainSrc.slice(from, i + 1);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function (e) { ${block} }`)(...names.map(n => freeVars[n]));
}

const STATE = { IDLE: 'IDLE', RADIAL_MENU: 'RADIAL_MENU', DEAD: 'DEAD' };
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const audio = { playSfx() {} };
const Settings = { get: () => 'tap' };

const m = {
    _openWheel:    liveMethod('_openWheel() {', { STATE, audio, restoreLastCategory }),
    _closeWheel:   liveMethod('_closeWheel() {', { STATE, audio }),
    _wheelCycle:   liveMethod('_wheelCycle(dir) {', { cycle, audio }),
    _wheelBack:    liveMethod('_wheelBack() {', { back, audio }),
    _wheelDrill:   liveMethod('_wheelDrill() {', { selectedNode, verbApplies, drill, autoAimTile, audio }),
    _wheelCommit:  liveMethod('_wheelCommit() {', { needsFriendlyConfirm }),
    _aimRange:     liveMethod('_aimRange(leaf) {', { aimRange }),
    _reticleKey:   liveMethod('_reticleKey(code) {', { selectedNode, autoAimTile, cheb, audio }),
    _fireWheel:    liveMethod('_fireWheel() {', {
        compose, audio, STATE, perceives,
        coinTake, kitTake, gearTake, coinWeight, itemWeight, gearWeight, noticeBuffer, isClean, stealLimit,
        transferGold, reactToTransaction,
    }),
    _thieveTarget: liveMethod('_thieveTarget(aimTile) {'),
    canThieve:     liveMethod('canThieve(branch) {', { cheb, takeable }),
    isHidden:      liveMethod('isHidden() {', { spotters }),
    _theftPassives: liveMethod('_theftPassives() {', { mergePassives, skillPerks }),
    _countCleanLift: liveMethod('_countCleanLift() {', { recordUse }),
};
const radialKeys = liveRadialKeys({ STATE });

// A few item defs, by id.
const DEFS = {
    rock:       { id: 'rock', name: '[Rock]', baseValue: 10 },                     // kit weight 1
    shiv:       { id: 'shiv', name: '[Shiv]', baseValue: 50 },                     // kit weight 2
    gold_brick: { id: 'gold_brick', name: '[Gold Brick]', baseValue: 100 },        // kit weight 4
    cap:        { id: 'cap', name: '[Cap]', baseValue: 5, armor: 1 },              // gear weight 3 (the floor)
    plate:      { id: 'plate', name: '[Plate]', baseValue: 80, armor: 4 },         // gear weight 8
};

const street = { isWalkable: () => true };
let nextId = 0;
function townsperson(x, y, over = {}) {
    return new Enemy({ id: `ts_${nextId++}`, type: 'Violencian', x, y, behavior: ['IDLE', 'WANDER'], gold: 300, ...over });
}

function thiefGame(enemies, { x = 5, y = 4 } = {}) {
    return {
        ...m,
        state: STATE.IDLE, wheel: createWheelState(),
        map: street, playerX: x, playerY: y, facing: 'up',
        enemies, gold: 0, inventory: [], equipment: { weapon: { damage: 10 } },
        skills: {}, ringMods: {}, _robbed: {}, _hot: {}, logs: [], bag: [],
        _log(msg) { this.logs.push(msg); },
        _render() {}, _advanceWorld() {}, _stopAutoRepeat() {}, _ensureParticleLoop() {},
        _resumeHeldWalk() {},
        _addToInventory(def) { this.bag.push(def); return true; },
        _resolveItemDef(id) { return DEFS[id] ?? null; },
        press(code) {
            if (this.state !== STATE.RADIAL_MENU) throw new Error(`pressed ${code} with the wheel shut`);
            radialKeys.call(this, { code, preventDefault() {} });
        },
    };
}

// Open the wheel and drill to Trick > Thieve > <leaf> and aim, by keys alone.
function openToAim(g, leafKey) {
    m._openWheel.call(g);
    const spinTo = (key) => {
        for (let n = 0; n < 12 && selectedNode(g.wheel).key !== key; n++) g.press('ArrowRight');
        assert.equal(selectedNode(g.wheel).key, key, `could not spin the wheel to ${key}`);
    };
    spinTo('trick'); g.press('Space');
    spinTo('thieve'); g.press('Space');
    spinTo(leafKey); g.press('Space');
    assert.equal(g.wheel.aiming, true, `${leafKey} did not enter the aim`);
}

// What the strip would show right now.
const previewNow = (g) => liftPreview(g, selectedNode(g.wheel).resolver, g.wheel.reticle);

const snapshot = (v, g) => JSON.stringify({
    gold: v.gold, loadout: v.loadout, equipped: v.equipped, damage: v.damage,
    armor: v.entity?.armor, robbed: g._robbed, disp: v.disposition, sweep: v._robbedSweep,
});

// The victim faces down. Behind: the player is above them. Flank: beside them.
const SPOTS = { behind: { x: 5, y: 4 }, flank: { x: 4, y: 5 } };

describe('the preview agrees with the lift it previews', () => {
    const CASES = [
        ['coin', { gold: 300 }],                       // 50 GP, weight 2: clean behind, noticed on the flank
        ['coin', { gold: 20 }],                        // 20 GP, weight 1: clean both ways
        ['kit',  { loadout: ['rock'] }],               // weight 1
        ['kit',  { loadout: ['shiv', 'rock'] }],       // the shiv, weight 2
        ['kit',  { loadout: ['gold_brick', 'rock'] }], // weight 4: noticed from anywhere
        ['gear', { equipped: ['cap', 'plate'] }],      // the plate, weight 8: noticed
        ['gear', { equipped: ['cap'] }],               // weight 3: clean behind, noticed on the flank
    ];

    for (const where of Object.keys(SPOTS)) {
        for (const [key, over] of CASES) {
            test(`${key} ${JSON.stringify(over)} from ${where}: the lift does what the strip said`, () => {
                const victim = townsperson(5, 5, { loadout: [], equipped: [], ...over });
                const g = thiefGame([victim], SPOTS[where]);
                assert.equal(g.isHidden(), true, 'the staging must leave the player unseen');
                openToAim(g, key);
                const p = previewNow(g);
                assert.ok(p, 'no preview beside a person with something to take');
                assert.equal(p.branch, key);

                const disp0 = victim.disposition;
                assert.equal(isHostile(victim), false);
                g.press('Space');                               // fire the real lift

                if (key === 'coin') {
                    assert.equal(g.gold, p.gp, 'the GP shown is the GP that landed');
                    assert.equal(victim.gold, over.gold - p.gp);
                } else {
                    assert.equal(g.bag.length, 1, 'one item should land in the bag');
                    assert.equal(g.bag[0].name, p.name, 'the name shown is the item that landed');
                }
                if (p.clean) {
                    assert.equal(isHostile(victim), false, 'a clean verdict means no hostility');
                    assert.equal(victim.disposition, disp0, 'a clean verdict means no disposition change');
                    assert.equal(g._robbed[victim.id].noticed, false);
                } else {
                    assert.equal(g._robbed[victim.id].noticed, true, 'a noticed verdict means they noticed');
                    assert.equal(isHostile(victim), true, 'a noticed verdict means they turn hostile');
                }
            });
        }
    }

    test('both verdicts occur across the cases (the loop above is not vacuous)', () => {
        const seen = new Set();
        for (const where of Object.keys(SPOTS)) {
            for (const [key, over] of CASES) {
                const g = thiefGame([townsperson(5, 5, { loadout: [], equipped: [], ...over })], SPOTS[where]);
                openToAim(g, key);
                seen.add(previewNow(g).clean);
            }
        }
        assert.deepEqual([...seen].sort(), [false, true]);
    });

    test('the same take is clean from behind and noticed from the flank, and the strip says both', () => {
        const mk = (spot) => {
            const g = thiefGame([townsperson(5, 5, { gold: 300 })], SPOTS[spot]);
            openToAim(g, 'coin');
            return previewNow(g);
        };
        const behind = mk('behind'), flank = mk('flank');
        assert.equal(behind.gp, flank.gp);
        assert.equal(behind.clean, true);
        assert.equal(flank.clean, false);
        assert.ok(flank.buffer < behind.buffer);
    });

    test('a take heavier than the buffer reads noticed even from behind', () => {
        const rich = townsperson(5, 5, { gold: 1000 });
        const g = thiefGame([rich]);
        g.ringMods = { stealLimit: 100 };                        // a 150 GP take: weight 6 against a buffer of 3
        openToAim(g, 'coin');
        const p = previewNow(g);
        assert.equal(p.gp, 150);
        assert.equal(p.clean, false);
        g.press('Space');
        assert.equal(isHostile(rich), true);
    });
});

describe('aiming moves nothing', () => {
    for (const [key, over] of [['coin', { gold: 300 }], ['kit', { loadout: ['shiv', 'rock'] }], ['gear', { equipped: ['cap', 'plate'] }]]) {
        test(`${key}: aim, read the strip, back out - the victim is exactly as before`, () => {
            const victim = townsperson(5, 5, { loadout: [], equipped: [], ...over });
            const g = thiefGame([victim]);
            const before = snapshot(victim, g);
            openToAim(g, key);
            for (let i = 0; i < 5; i++) assert.ok(previewNow(g));
            g.press('Escape'); g.press('Escape'); g.press('Escape'); g.press('Escape');
            assert.equal(g.state, STATE.IDLE);
            assert.equal(snapshot(victim, g), before);
            assert.deepEqual(g._robbed, {}, 'aiming must not even open a record');
            assert.equal(g.gold, 0);
            assert.equal(g.bag.length, 0);
        });
    }

    test('the pick helpers remove nothing; the takes still do', () => {
        const v = { loadout: ['shiv', 'rock'], equipped: ['cap', 'plate'], damage: 5, entity: { armor: 5 } };
        const resolve = (id) => DEFS[id];
        assert.equal(pickKit(v, resolve).def.id, 'shiv');
        assert.equal(pickGear(v, resolve).def.id, 'plate');
        assert.deepEqual(v.loadout, ['shiv', 'rock']);
        assert.deepEqual(v.equipped, ['cap', 'plate']);
        assert.equal(kitTake(v, resolve).id, 'shiv');
        assert.equal(gearTake(v, resolve).id, 'plate');
        assert.deepEqual(v.loadout, ['rock']);
        assert.deepEqual(v.equipped, ['cap']);
    });
});

describe('a second lift shows the raised weight', () => {
    test('a lift that was clean the first time flips to noticed the second', () => {
        const victim = townsperson(5, 5, { gold: 300 });
        const g = thiefGame([victim]);
        openToAim(g, 'coin');
        const first = previewNow(g);
        assert.equal(first.clean, true);
        assert.equal(first.taken, 0);
        g.press('Space');                                       // a clean lift: weight 2 of 3
        assert.equal(g._robbed[victim.id].weightTaken, 2);
        assert.equal(isHostile(victim), false);

        openToAim(g, 'coin');
        const second = previewNow(g);
        assert.equal(second.taken, 2, 'the strip reads the raised weight');
        assert.equal(second.clean, false, '2 + 2 is over the buffer of 3');
        g.press('Space');
        assert.equal(isHostile(victim), true, 'and the real lift agrees');
    });
});

describe('nothing is drawn when there is nothing to show', () => {
    const arrange = (over = {}, key = 'coin') => {
        const g = thiefGame([townsperson(5, 5, { gold: 300, ...over })]);
        openToAim(g, key);
        return g;
    };

    test('an empty tile', () => {
        assert.equal(liftPreview(arrange(), 'thieveCoin', { x: 6, y: 4 }), null);
    });

    test('someone who cannot be lifted from', () => {
        const g = arrange();
        assert.ok(previewNow(g), 'the staging should show a preview first');
        g.enemies[0].thievable = false;
        assert.equal(previewNow(g), null);
    });

    test('a corpse', () => {
        const g = arrange();
        assert.ok(previewNow(g));
        g.enemies[0].entity.alive = false;
        assert.equal(previewNow(g), null);
    });

    test('a branch with nothing in it', () => {
        for (const [key, empty] of [['coin', { gold: 0 }], ['kit', { loadout: [] }], ['gear', { equipped: [] }]]) {
            const g = arrange({ loadout: ['rock'], equipped: ['cap'] }, key);
            assert.ok(previewNow(g), `${key}: the staging should show a preview first`);
            Object.assign(g.enemies[0], empty);
            assert.equal(previewNow(g), null, key);
        }
    });

    test('any verb but the three lifts, and no aim at all', () => {
        const g = arrange();
        for (const resolver of ['combatAttack', 'trade', 'run', 'cleaveAttack', 'resolveThrow', 'castSpell', undefined]) {
            assert.equal(liftPreview(g, resolver, { x: 5, y: 5 }), null, String(resolver));
        }
        assert.equal(liftPreview(g, 'thieveCoin', null), null);
        assert.equal(liftPreview(null, 'thieveCoin', { x: 5, y: 5 }), null);
    });
});

describe('the strip', () => {
    test('the verdict words are the [TEXT] placeholders, kept in one place', () => {
        assert.deepEqual(LIFT_WORDS, { clean: '[TEXT]', noticed: '[TEXT]' });
        const g = thiefGame([townsperson(5, 5, { gold: 300 })]);
        openToAim(g, 'coin');
        assert.equal(previewNow(g).words, '[TEXT]');
    });

    test('the renderer reads it in the aim branch only, and only draws when there is a preview', () => {
        const aim = rendererSrc.indexOf('if (w.aiming) {');
        const confirm = rendererSrc.indexOf('if (w.confirming) {', aim);
        const at = rendererSrc.indexOf('liftPreview(game', aim);
        assert.ok(aim > 0 && at > aim && at < confirm, 'liftPreview is read outside the aim branch');
        assert.equal(rendererSrc.split('liftPreview(game').length - 1, 1, 'read from exactly one place');
        assert.match(rendererSrc.slice(at, confirm), /if \(lift\)/);
    });
});
