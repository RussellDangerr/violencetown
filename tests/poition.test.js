// poition.test.js — wiring the five previously-inert Poition stats (mana,
// gold, strength, defence, speed) onto real runtime effects, plus the
// SELF-USE path (drinking one) that nothing exercised before this task —
// health included, since resolveSelfUse never had a `poition` branch at all
// prior to this change (only the THROWN health-poitions, aliased via `as` to
// sludge/fire/poison, ever reached buffs.js's applyDot).
//
// game/main.js can't be imported under Node (it touches `document` at module
// load — see drops.js's header comment for the established pattern), so:
//   - items.js's resolveUse/resolveSelfUse ARE importable (no DOM anywhere in
//     its module graph) and are exercised directly against a faithful fake
//     Game, the same technique throw-vs-use.test.js and give-action.test.js
//     already use for this exact file.
//   - the strength/defence "rider" read (Game._poitionMod) is backed by a new
//     pure export, buffs.js's sumBuffStat — tested directly, then composed
//     with combat.js's real computeHit to prove the flats bucket produces
//     the same final number Game.combatAttack would.
//   - the speed/haste/slow charge arithmetic is backed by a new pure export,
//     buffs.js's worldBeatPlan — tested directly since Game._advanceWorld
//     itself can't be invoked here.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ITEMS, resolveUse, poitionBuff } from '../game/items.js';
import { sumBuffStat, worldBeatPlan, tickBuffList } from '../game/buffs.js';
import { computeHit } from '../game/combat.js';

// ── A faithful fake Game ─────────────────────────────────────────────────────
// Exposes exactly what resolveUse/resolveSelfUse touch: playerHp/Mp, gold,
// buffs (+ addBuff/hasBuff/removeBuff matching main.js's REAL implementation,
// not a simplification of it), equipment/tempEquips (every 'self' item runs
// through the unconditional equipItem() call first), and the haste/slow
// counters a speed poition writes to directly.
function fakeGame(over = {}) {
    return {
        playerHp: 100, playerMaxHp: 100,
        playerMp: 50, playerMaxMp: 100,
        gold: 20,
        equipment: {}, tempEquips: [],
        buffs: [],
        _hasteCharges: 0, _slowCharges: 0,
        logs: [],
        _log(m) { this.logs.push(m); },
        // Mirrors Game.addBuff/hasBuff/removeBuff (main.js) exactly — a refresh
        // on an existing id only updates `turns`, same as the real thing.
        addBuff(id, name, turns, type = 'buff', extra = {}) {
            const existing = this.buffs.find(b => b.id === id);
            if (existing) { existing.turns = turns; return; }
            this.buffs.push({ id, name, turns, type, ...extra });
        },
        hasBuff(id) { return this.buffs.some(b => b.id === id); },
        removeBuff(id) { this.buffs = this.buffs.filter(b => b.id !== id); },
        ...over,
    };
}

// A stat-poition item def with a negative amount — the poison twin of one of
// the six shipped potions, built the same way sludge_sack/tunnel_mushroom are
// (positive item, negative sibling), just not authored/priced for real.
function poisonOf(itemDef, amount) {
    return { ...itemDef, poition: { ...itemDef.poition, amount } };
}

describe('poition — self-use (drinking one), each of the six stats', () => {
    test('health: instant, heals, clamps at max HP', () => {
        const g = fakeGame({ playerHp: 90 });
        resolveUse(g, ITEMS.health_poition);
        assert.equal(g.playerHp, 100, 'clamped — not 115');
    });

    test('mana: instant, restores MP, clamps at max MP', () => {
        const g = fakeGame({ playerMp: 90, playerMaxMp: 100 });
        resolveUse(g, ITEMS.mana_poition);
        assert.equal(g.playerMp, 100, 'clamped — not 110');
    });

    test('mana: a poison variant never drives MP below 0', () => {
        const g = fakeGame({ playerMp: 5 });
        resolveUse(g, poisonOf(ITEMS.mana_poition, -20));
        assert.equal(g.playerMp, 0);
    });

    test('gold: instant, mints the full amount from nothing', () => {
        const g = fakeGame({ gold: 20 });
        resolveUse(g, ITEMS.gold_poition);
        assert.equal(g.gold, 70);
    });

    test('gold: a poison cannot take a broke player below 0 — takes what is there, no more', () => {
        const g = fakeGame({ gold: 10 });
        resolveUse(g, poisonOf(ITEMS.gold_poition, -50));
        assert.equal(g.gold, 0);
    });

    test('gold: a poison on a well-off player just takes the full dose', () => {
        const g = fakeGame({ gold: 100 });
        resolveUse(g, poisonOf(ITEMS.gold_poition, -50));
        assert.equal(g.gold, 50);
    });

    test('strength: pushes a rider buff, readable via sumBuffStat while active', () => {
        const g = fakeGame();
        resolveUse(g, ITEMS.strength_poition);
        assert.equal(sumBuffStat(g.buffs, 'strength'), 6);
        assert.equal(g.buffs[0].turns, 5);
    });

    test('defence: pushes a rider buff, readable via sumBuffStat while active', () => {
        const g = fakeGame();
        resolveUse(g, ITEMS.defence_poition);
        assert.equal(sumBuffStat(g.buffs, 'defence'), 4);
        assert.equal(g.buffs[0].turns, 6);
    });

    test('strength/defence riders are GONE after they expire', () => {
        const g = fakeGame();
        resolveUse(g, ITEMS.strength_poition);   // turns: 5
        resolveUse(g, ITEMS.defence_poition);    // turns: 6
        for (let i = 0; i < 6; i++) tickBuffList(g.buffs, g, g, null);
        assert.equal(sumBuffStat(g.buffs, 'strength'), 0, 'expired after 5 — no bonus left');
        assert.equal(sumBuffStat(g.buffs, 'defence'), 0, 'expired after 6 — no bonus left');
        assert.equal(g.buffs.length, 0);
    });

    test('speed: +2 grants 2 haste charges, and never touches the buff list', () => {
        const g = fakeGame();
        resolveUse(g, ITEMS.speed_poition);
        assert.equal(g._hasteCharges, 2);
        assert.equal(g._slowCharges, 0);
        assert.equal(g.buffs.length, 0, 'speed is charges, not a buff');
    });

    test('speed: a poison variant grants slow charges instead of haste', () => {
        const g = fakeGame();
        resolveUse(g, poisonOf(ITEMS.speed_poition, -2));
        assert.equal(g._slowCharges, 2);
        assert.equal(g._hasteCharges, 0);
    });
});

describe('poitionBuff — the one flip seam, and the two record shapes it emits', () => {
    test('tick-family stats (health/mana/gold/speed) stay DoT-shaped: {id, turns, dmg}', () => {
        const buff = poitionBuff({ stat: 'health', amount: 25, turns: 1 });
        assert.equal(buff.id, 'health');
        assert.equal(buff.dmg, -25, 'positive amount (a potion) becomes negative dmg (a heal)');
        assert.equal(buff.stat, undefined);
    });

    test('rider-family stats (strength/defence) are shaped {id, turns, stat, amount} — no dmg', () => {
        const buff = poitionBuff({ stat: 'strength', amount: 6, turns: 5 });
        assert.equal(buff.stat, 'strength');
        assert.equal(buff.amount, 6);
        assert.equal(buff.dmg, undefined);
    });

    test('flip inverts the sign for BOTH shapes', () => {
        const dot = poitionBuff({ stat: 'gold', amount: 50, turns: 1 }, true);
        assert.equal(dot.dmg, 50, 'a flipped potion becomes a poison — dmg flips positive');
        const rider = poitionBuff({ stat: 'strength', amount: 6, turns: 5 }, true);
        assert.equal(rider.amount, -6, 'a flipped strength buff becomes a weakness debuff');
    });

    // give-action.js already flips sewer fare by species (Task 16); this proves
    // resolveSelfUse routes through the SAME seam rather than inventing a second
    // inversion path. No shipped self-use poition carries sewerFare — synthesize
    // one to exercise the wiring end-to-end.
    test('the sewer-fare flip inverts a poition at self-use too, same seam as give/throw', () => {
        const sewerGold = { ...ITEMS.gold_poition, sewerFare: true };

        const dweller = fakeGame({ gold: 20, sewerDweller: true });
        resolveUse(dweller, sewerGold);
        assert.equal(dweller.gold, 0, 'flipped to a poison for a sewer-dweller — takes what is there, no more (20 < 50)');

        const human = fakeGame({ gold: 20, sewerDweller: false });
        resolveUse(human, sewerGold);
        assert.equal(human.gold, 70, 'unflipped for anyone else — still mints the full +50');
    });
});

describe('strength — a rider read at computeHit\'s flats bucket (Law 2), not a tick', () => {
    test('sumBuffStat totals only the matching stat, ignoring unrelated buffs', () => {
        const buffs = [
            { id: 'strength', stat: 'strength', amount: 6, turns: 5 },
            { id: 'guard', turns: 2 },
        ];
        assert.equal(sumBuffStat(buffs, 'strength'), 6);
    });

    test('composed into computeHit exactly as Game.combatAttack does, it raises the final damage', () => {
        const buffs = [{ id: 'strength', stat: 'strength', amount: 6, turns: 5 }];
        const without = computeHit({ base: 10, flats: sumBuffStat([], 'strength') });
        const withBuff = computeHit({ base: 10, flats: sumBuffStat(buffs, 'strength') });
        assert.equal(without, 10);
        assert.equal(withBuff, 16, 'a +6 Strength Poition adds flat damage to a 10-damage swing');
    });

    test('gone after expiry: the same swing returns to its unbuffed damage', () => {
        const buffs = [{ id: 'strength', stat: 'strength', amount: 6, turns: 1 }];
        tickBuffList(buffs, {}, {}, null);   // one tick — turns 1 -> 0 -> expired
        assert.equal(buffs.length, 0);
        assert.equal(computeHit({ base: 10, flats: sumBuffStat(buffs, 'strength') }), 10);
    });
});

describe('defence — a rider summed into _playerArmor (main.js not importable; pin the same arithmetic here)', () => {
    test('an active Defence Poition adds to the worn-armor + ring-mod sum', () => {
        const buffs = [{ id: 'defence', stat: 'defence', amount: 4, turns: 6 }];
        const wornArmor = 2;   // e.g. a Cardboard Cuirass-adjacent total
        const ringMod = 0;
        assert.equal(wornArmor + ringMod + sumBuffStat(buffs, 'defence'), 6);
    });
});

describe('worldBeatPlan — speed Poition charge arithmetic (pure; backs Game._advanceWorld)', () => {
    test('no charges: the world runs once, charges untouched', () => {
        assert.deepEqual(worldBeatPlan(0, 0), { runs: 1, hasteCharges: 0, slowCharges: 0 });
    });

    test('a haste charge: the world does NOT run, one charge spent', () => {
        assert.deepEqual(worldBeatPlan(3, 0), { runs: 0, hasteCharges: 2, slowCharges: 0 });
    });

    test('haste charges make _advanceWorld a no-op exactly N times, then behave normally', () => {
        let haste = 3, slow = 0, noops = 0, realRuns = 0;
        for (let i = 0; i < 5; i++) {
            const plan = worldBeatPlan(haste, slow);
            haste = plan.hasteCharges; slow = plan.slowCharges;
            if (plan.runs === 0) noops++; else realRuns++;
        }
        assert.equal(noops, 3, 'exactly 3 haste charges spent as exactly 3 no-ops');
        assert.equal(realRuns, 2, 'the remaining 2 calls actually advance the world');
        assert.equal(haste, 0);
    });

    test('a slow charge (no haste): the world runs TWICE, one charge spent', () => {
        assert.deepEqual(worldBeatPlan(0, 2), { runs: 2, hasteCharges: 0, slowCharges: 1 });
    });

    test('haste takes priority if somehow both are active — holding still leaves nothing to double', () => {
        const plan = worldBeatPlan(1, 1);
        assert.equal(plan.runs, 0);
        assert.equal(plan.hasteCharges, 0);
        assert.equal(plan.slowCharges, 1, 'untouched this call — still there for later');
    });
});

describe('speed Poition charges survive a save round-trip', () => {
    test('serialize captures them; loadInto restores them; an old save without them migrates to 0', async () => {
        const { serialize, loadInto } = await import('../game/save.js');
        const { QuestEngine } = await import('../game/quests.js');

        function makeFakeMap() {
            const W = 10, H = 10;
            return {
                url: 'town-map.json', width: W, height: H,
                isInBounds: (x, y) => x >= 0 && y >= 0 && x < W && y < H,
                isWalkable: () => true, zoneName: 'Town',
            };
        }
        function makeBlankGame() {
            const g = {
                map: null, rng: null, turn: 0,
                playerX: 0, playerY: 0, playerHp: 100, playerMaxHp: 100,
                playerMp: 100, playerMaxMp: 100, facing: 'down', gold: 0,
                equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
                tempEquips: [], buffs: [], inventory: [], selectedSlot: -1,
                groundItems: [], containers: [], enemies: [],
                _tileDiffs: [], _pendingTransition: null, _sewerEscape: null,
                _lastAutosaveTurn: 0, state: 'boot',
                questEngine: null,
                _log() {}, _render() {},
                _resolveItemDef: () => null,
                async _loadMap(url, x, y) {
                    this.map = makeFakeMap();
                    this.playerX = typeof x === 'number' ? x : 1;
                    this.playerY = typeof y === 'number' ? y : 1;
                },
                setTile() {},
            };
            g.questEngine = new QuestEngine(g);
            return g;
        }

        const src = makeBlankGame();
        src.map = makeFakeMap();
        src._hasteCharges = 3;
        src._slowCharges = 1;

        const blob = JSON.parse(JSON.stringify(serialize(src)));
        assert.equal(blob.player.hasteCharges, 3);
        assert.equal(blob.player.slowCharges, 1);

        const dst = makeBlankGame();
        await loadInto(dst, blob);
        assert.equal(dst._hasteCharges, 3);
        assert.equal(dst._slowCharges, 1);

        // An old save predating this field: migrate/validate must default to 0,
        // not undefined/NaN, same discipline as every other numeric save field.
        delete blob.player.hasteCharges;
        delete blob.player.slowCharges;
        const dst2 = makeBlankGame();
        await loadInto(dst2, blob);
        assert.equal(dst2._hasteCharges, 0);
        assert.equal(dst2._slowCharges, 0);
    });
});
