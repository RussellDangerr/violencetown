// run.js — the autoplay driver (plans/quest1-autoplay.md §5.1). Loaded by
// boot.js only under ?autoplay. Plays a script against the real game — real
// key events into the real input handler — on the virtual clock, and returns a
// report. A script is a fixed list of ops (`car`, stage 3) or a route the
// standard fighter plays until the quest completes (`quest`).

import { FRAME_MS } from './clock.js';
import { pathTo, DIR_CODES } from './path.js';
import { fingerprint } from './fingerprint.js';
import { decide, FIGHTER, SNEAK } from './player.js';
import { ROUTES } from './route.js';
import { QUESTS } from '../quests.js';
import { isHostile } from '../ai.js';
import { isBoss } from '../defeat-scenarios.js';
import { selectedNode, activeRing, ROOT, aimRange, autoAimTile } from '../wheel-model.js';
import { SPELLS } from '../spells.js';
import { perceives, VERDICT } from '../perception.js';

export const SCRIPTS = {
    // Quest 1's first stage. The car sits in a wall block with no open tile
    // beside it; (24,8) facing up is where E reaches it (measured 2026-09-21).
    // The idle is deliberate: three seconds of the free-roam heartbeat moving
    // the townsfolk is exactly what broke seeded replays.
    car: {
        ops: [{ walkTo: { x: 24, y: 8 } }, { idle: 3000 }, { face: 'up' }, { press: 'KeyE' }, { press: 'Escape' }],
        expect: (g) => (g.questEngine.state.activeId === 'fix_car' && g.questEngine.state.stageIndex >= 1)
            ? null : 'quest 1 is still waiting on examine_car',
    },
    // All of quest 1, played by the standard fighter (ruling Q1-2)...
    quest: { route: 'fix_car', knobs: FIGHTER },
    // ...and by the sneak, the way ruling Q1-8 says the Fungus King is passed.
    sneak: { route: 'fix_car', knobs: SNEAK },
};

const KEY = { KeyE: 'e', KeyT: 't', KeyD: 'd', Space: ' ' };
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const REPEAT_GAP_MS = 260;      // a Space within 250 ms of the last one repeats the last action (main.js ~1329)
const BEAT_MS = 200;            // game time after every action — identical watched or headless
const STAGE_TURN_BUDGET = 1500;   // room for a dozen attempts at a boss, each a walk back from the spawn
const MAX_WAITS = 60;
// Ruling Q1-10: after a defeat the player goes back and tries again, and stops
// only when an attempt changed nothing — see `standing` below. The cap is a
// backstop against a slow bleed that never ends, not the rule.
const MAX_ATTEMPTS = 12;

export async function run(ap) {
    const t0 = ap.real.now();
    const vt0 = ap.clock ? ap.clock.now() : null;
    const g = await waitForGame(ap);
    const d = driver(ap, g);
    const watching = ap.opts.speed > 0;
    const label = watching ? showLabel(`AUTOPLAY · seed ${ap.opts.seed} · x${ap.opts.speed} · any key or tap stops it`) : null;
    const stop = (e) => {
        if (!e.isTrusted) return;
        ap.stopRequested = true;
        e.preventDefault();
        e.stopImmediatePropagation();
    };
    if (watching) { window.addEventListener('keydown', stop, true); window.addEventListener('pointerdown', stop, true); }

    let outcome = { finished: false, failure: null, stages: [] };
    const script = SCRIPTS[ap.opts.script];
    try {
        if (!script) throw new Error(`no script named "${ap.opts.script}"`);
        document.getElementById('splash-go').click();
        await d.settle();
        await g._fullReset({ seed: ap.opts.seed });
        await d.settle();
        outcome = script.route ? await d.playRoute(script.route, script.knobs) : await d.playOps(script);
    } catch (e) {
        outcome = { ...outcome, failure: String((e && e.stack) || e) };
    }

    const errors = [...ap.errors];
    const report = {
        ok: outcome.finished && !outcome.failure && errors.length === 0,
        finished: outcome.finished,
        reason: outcome.failure ?? (errors.length ? 'errors on the page' : null),
        seed: ap.opts.seed, script: ap.opts.script, clock: ap.opts.clock,
        fingerprint: fingerprint(g),
        turn: g.turn,
        deaths: d.deaths(),
        quest: { id: g.questEngine.state.activeId, stage: g.questEngine.state.stageIndex },
        at: { map: g._mapUrl, x: g.playerX, y: g.playerY },
        stages: outcome.stages,
        virtualMs: ap.clock ? ap.clock.now() - vt0 : null,
        realMs: Math.round(ap.real.now() - t0),
        errors,
        trace: d.trace(),
        log: (g._logHistory || []).slice(-40).map((l) => l.text),
        // Where everything stood when an unfinished run gave up — what a
        // "no way to …" needs to be read.
        scene: outcome.finished ? null : {
            items: g.groundItems.map((i) => `${i.type}@${i.x},${i.y}${g.map.isWalkable(i.x, i.y) ? '' : ' (not walkable)'}`),
            enemies: g.enemies.filter((e) => e.entity.isAlive()).map((e) => `${e.type}@${e.x},${e.y} hp${e.entity.hp}${isHostile(e) ? '' : ' (not hostile)'}`),
            containers: (g.containers || []).map((c) => `${c.type || 'container'}@${c.x},${c.y}`),
        },
    };
    if (watching) {
        window.removeEventListener('keydown', stop, true);
        window.removeEventListener('pointerdown', stop, true);
        label.textContent = report.finished ? `AUTOPLAY · quest 1 done in ${report.turn} turns` : `AUTOPLAY · ${report.reason}`;
        ap.real.setTimeout(() => label.remove(), 6000);
        handBack(ap);
    }
    return report;
}

// The game is ready once init() has run to its end: the map is loaded and
// _idleTick, set after every binding, exists. Polled on the REAL clock — game
// time must not move while the page loads, or the heartbeat's phase would
// depend on how fast the files arrived.
async function waitForGame(ap) {
    const until = ap.real.now() + 30000;
    for (;;) {
        const g = window.__game;
        if (g && g.map && g._idleTick !== undefined && g.state === 'splash' && document.getElementById('splash-go')) return g;
        if (ap.real.now() > until) throw new Error('the game never finished loading');
        await new Promise((r) => ap.real.setTimeout(r, 20));
    }
}

// The game as the player sees it — plain data and lookups, so player.js
// stays pure. seenAt asks the enemies' own question (perception.js), so the
// sneak hides from exactly what the AI would see.
const RANK = { [VERDICT.NONE]: 0, [VERDICT.PERIPHERAL]: 1, [VERDICT.DIRECT]: 2 };
// The Magic ring's spells, read off the wheel itself, so a spell added there
// is one the autoplay can cast.
const FIGHT = ROOT.children.find((c) => c.key === 'fight').children;
const MAGIC = FIGHT.find((c) => c.key === 'magic').children;
const RANGED = FIGHT.find((c) => c.key === 'ranged');

// The reticle moves one tile a press, only onto open tiles within the leaf's
// reach (main.js _reticleKey). The presses that walk it from `from` to `at`,
// or null when a wall cuts `at` off. The player asks (canAim) and the driver
// walks (aim) through this one function, so they cannot disagree.
function aimPath(g, leaf, from, at) {
    const reach = aimRange(leaf, g);
    const open = (x, y) => g.map.isWalkable(x, y) && Math.max(Math.abs(x - g.playerX), Math.abs(y - g.playerY)) <= reach;
    return pathTo(open, from, at);
}
function view(g) {
    const m = g.map;
    const watchers = g.enemies.filter((e) => e.entity.isAlive() && isHostile(e));
    return {
        seenAt: (x, y) => watchers.reduce((worst, w) => {
            const v = perceives(m, w, x, y);
            return RANK[v] > RANK[worst] ? v : worst;
        }, VERDICT.NONE),
        mapUrl: g._mapUrl, width: m.width, height: m.height,
        player: { x: g.playerX, y: g.playerY },
        hp: g.playerHp, maxHp: g.playerMaxHp,
        canEat: g.barSlot('eat') >= 0,
        canDrink: g.barSlot('drink') >= 0,
        mp: g.playerMp,
        spells: MAGIC.filter((n) => SPELLS[n.spellId] && g.hasSpell(n.spellId) && !SPELLS[n.spellId].fear)
            .map((n) => ({ key: n.key, cost: SPELLS[n.spellId].mpCost, range: SPELLS[n.spellId].range, shape: SPELLS[n.spellId].aoe?.shape })),
        throwRange: throwRange(g),
        // Could the reticle be walked onto `t` for a spell (by key) or 'throw'?
        // From where the game seeds it, as main.js does on entering the aim.
        canAim: (what, t) => {
            const leaf = what === 'throw' ? RANGED : MAGIC.find((n) => n.key === what);
            if (!leaf) return false;
            const seed = autoAimTile(leaf, g) || { x: g.playerX, y: g.playerY };
            return !!aimPath(g, leaf, seed, { x: t.x, y: t.y });
        },
        isWalkable: (x, y) => m.isWalkable(x, y),
        tileAt: (x, y) => m.getTile(x, y),
        transitions: (m.transitions || []).map((t) => ({ x: t.x, y: t.y, toMap: t.toMap })),
        enemies: g.enemies.filter((e) => e.entity.isAlive())
            .map((e) => ({ x: e.x, y: e.y, hp: e.entity.hp, hostile: isHostile(e), tag: e.tag || null,
                           aware: e.state === 'chasing' || e.state === 'searching' })),
        items: g.groundItems.map((i) => ({ type: i.type, x: i.x, y: i.y })),
        containers: (g.containers || []).map((c) => ({ x: c.x, y: c.y })),
        inventory: g.inventory.filter(Boolean).map((s) => s.itemDef.id),
        targetIdAt: (x, y) => g._targetAt(x, y)?.examinable?.id ?? null,
    };
}

// How far the bar's throwable reaches (wheel-model aimRange: the item's own
// range, else 5), or 0 with nothing to throw.
function throwRange(g) {
    const slot = g.barSlot('throw');
    if (slot < 0) return 0;
    return g.inventory[slot]?.itemDef?.range || 5;
}

// What the enemies still have: every live hostile's HP, kit and gold. A boss
// defeat refills the boss's HP and nothing else, so an attempt that burned a
// heal, spent gold or killed anything leaves this lower than it found it.
function standing(g) {
    const live = g.enemies.filter((e) => e.entity.isAlive() && isHostile(e));
    return {
        map: g._mapUrl,
        alive: live.length,
        hp: live.reduce((n, e) => n + e.entity.hp, 0),
        kit: live.reduce((n, e) => n + (e.loadout || []).length, 0),
        gold: live.reduce((n, e) => n + (e.gold || 0), 0),
    };
}
const sameStanding = (a, b) => a.map === b.map && a.alive === b.alive && a.hp === b.hp && a.kit === b.kit && a.gold === b.gold;

function driver(ap, g) {
    // A real macrotask with no 4 ms clamp: long enough for every promise the
    // last callback started to settle, short enough to run thousands a second.
    const channel = new MessageChannel();
    const macrotask = () => new Promise((r) => { channel.port1.onmessage = () => r(); channel.port2.postMessage(0); });
    const realSleep = (ms) => new Promise((r) => ap.real.setTimeout(r, ms));
    let deaths = 0;
    let lastKiller = null;
    const trace = [];   // the flight recorder: every action the fighter took, newest last

    // Deaths are counted where they are resolved. A step's world turn runs
    // after its slide — inside settle(), not at the key press — so a death on a
    // step was invisible to the press. And not in _die: a second blow landing
    // while you are already down calls _die again (its guard returns early),
    // which counted one death twice. _resolveDefeat runs once per death, and
    // reads the same last blow the game does to choose a boss retry or a
    // defeat scenario. This only observes: the original still runs.
    const resolveDefeat = g._resolveDefeat.bind(g);
    g._resolveDefeat = (...args) => {
        deaths++;
        const k = g._lastDefeatedBy;   // read now: the defeat clears it
        lastKiller = (k && (k.type || k.name || k.cause)) || 'something';
        trace.push(`t${g.turn} ${g._mapUrl.replace('-map.json', '')} ${g.playerX},${g.playerY} DIED to ${lastKiller}`
            + ` (${isBoss(k) ? 'a boss: retry' : 'a defeat scenario'})`);
        return resolveDefeat(...args);
    };

    // Game time never moves while a request is in flight. Watching, game time
    // is held to `speed` times real time — measured against the real clock, not
    // slept per frame: a browser timer cannot sleep 4 ms reliably, and sleeping
    // every frame ran a 4x watch at under 1x.
    const quiesce = async () => { do { await macrotask(); } while (ap.inflight() > 0); };
    let paceReal = null, paceVirtual = null;
    const tick = async () => {
        if (!ap.clock) await realSleep(FRAME_MS);
        else {
            ap.clock.advance(FRAME_MS);
            if (ap.opts.speed > 0) {
                if (paceReal === null) { paceReal = ap.real.now(); paceVirtual = ap.clock.now(); }
                const ahead = (ap.clock.now() - paceVirtual) / ap.opts.speed - (ap.real.now() - paceReal);
                if (ahead > 0) await realSleep(ahead);
            }
        }
        await quiesce();
    };
    const busy = () => g._animating || g._turnTimer || ap.inflight() > 0 || g.state === 'resolving' || g.state === 'dead';

    async function settle(maxMs = 5000) {
        await quiesce();
        for (let t = 0; busy(); t += FRAME_MS) {
            if (t > maxMs) throw new Error(`the game stayed busy for ${maxMs} ms (state "${g.state}")`);
            await tick();
        }
    }
    function key(type, code) {
        document.dispatchEvent(new KeyboardEvent(type, { code, key: KEY[code] ?? code, bubbles: true, cancelable: true }));
    }
    async function press(code) {
        key('keydown', code);
        key('keyup', code);
        await settle();
    }
    async function idle(ms) { for (let t = 0; t < ms; t += FRAME_MS) await tick(); await settle(); }

    // From a standstill a tap toward a new facing only turns (main.js
    // _beginMoveOrTurn), so facing is its own press.
    async function face(dir) {
        if (g.facing !== dir) await press(DIR_CODES[dir]);
        return g.facing === dir ? null : `could not face ${dir}`;
    }

    // Open the wheel and fire the leaf at `keys` (e.g. ['treat', 'eat']),
    // choosing each ring's slice by name — the ring reopens wherever it was
    // last left, and can be padded, so positions mean nothing.
    // A reticle leaf is aimed at `at` when given — walked there with the arrow
    // keys, the way a player nudges it — and otherwise fired where it seeded.
    async function wheel(keys, at = null) {
        await idle(REPEAT_GAP_MS);
        await press('Space');
        if (g.state !== 'radial_menu') return 'the wheel did not open';
        for (const want of keys) {
            const size = activeRing(g.wheel).length || 1;
            for (let n = 0; n < size && selectedNode(g.wheel)?.key !== want; n++) await press('KeyD');
            if (selectedNode(g.wheel)?.key !== want) { await closeWheel(); return `no "${want}" on the wheel`; }
            await press('Space');   // drill in; on a leaf this fires, or starts aiming
            if (g.state !== 'radial_menu') return null;
        }
        if (g.wheel.aiming && at) {
            const missed = await aim(at);
            if (missed) { await closeWheel(); return missed; }
        }
        if (g.wheel.aiming) await press('Space');   // commit the reticle
        // Plus Ultra: the blast would clip a friendly. The ruling is to use
        // everything, so the player says yes.
        if (g.state === 'radial_menu' && g.wheel.confirming) await press('Space');
        if (g.state === 'radial_menu') { await closeWheel(); return `${keys.join(' > ')} would not fire`; }
        return null;
    }
    // Walk the reticle to `at`, a press a tile (aimPath).
    async function aim(at) {
        const from = g.wheel.reticle || { x: g.playerX, y: g.playerY };
        const path = aimPath(g, selectedNode(g.wheel), from, at);
        if (!path) return `no way to aim at ${at.x},${at.y}`;
        for (const dir of path) await press(DIR_CODES[dir]);
        const r = g.wheel.reticle;
        return r && r.x === at.x && r.y === at.y ? null : `the reticle stopped short of ${at.x},${at.y}`;
    }
    async function closeWheel() { for (let n = 0; n < 6 && g.state === 'radial_menu'; n++) await press('Escape'); }

    const leftIdle = () => (g.state === 'idle' ? null : `left the game in state "${g.state}"`);

    async function act(a) {
        if (a.kind === 'eat') return wheel(['treat', 'eat']);
        if (a.kind === 'drink') return wheel(['treat', 'cleanse']);
        if (a.kind === 'cast') return wheel(['fight', 'magic', a.spell], a.at);
        if (a.kind === 'throw') return wheel(['fight', 'ranged'], a.at);
        if (a.kind === 'attack') {
            if (!a.dir) return wheel(['fight', 'melee', 'hit']);
            const turned = await face(a.dir);
            if (turned) return turned;
            await press('KeyE');
            return null;
        }
        if (a.kind === 'step') {
            const turned = await face(a.dir);
            if (turned) return turned;
            // Turning takes game time, and a passer-by can walk into the tile
            // meanwhile; stepping into them would open their trade or talk.
            // Leave the step for the next decision instead.
            const [dx, dy] = STEP[a.dir];
            if (occupied(g.playerX + dx, g.playerY + dy)) return null;
            await press(DIR_CODES[a.dir]);
            return leftIdle();
        }
        if (a.kind === 'use') {
            const turned = await face(a.dir);
            if (turned) return turned;
            await press('KeyE');
            if (g.state === 'inspect') await press('Escape');
            return leftIdle();
        }
        if (a.kind === 'wait') { await press('KeyT'); return null; }
        return `an action this driver does not know: ${a.kind}`;
    }

    // The standard fighter plays `name` until the quest completes, a stage runs
    // out of turns, an attempt ends in a defeat that changed nothing (or the
    // MAX_ATTEMPTS backstop), or it is stopped. Each stage is scored as it is
    // played.
    async function playRoute(name, knobs = FIGHTER) {
        const quest = QUESTS[name], route = ROUTES[name], q = g.questEngine;
        const stages = [];
        let cur = null, waits = 0;
        let before = standing(g);   // the enemies' standing when this attempt began
        const close = () => { if (cur) { cur.turns = g.turn - cur.startTurn; cur.gold = g.gold - cur.startGold; } };
        const result = (failure) => {
            close();
            for (const s of stages) { delete s.startTurn; delete s.startGold; }
            return { finished: !failure, failure, stages };
        };
        for (;;) {
            if (ap.stopRequested) return result('stopped by the player');
            if ((q.state.completed || []).includes(name)) return result(null);
            if (q.state.activeId !== name) return result(`quest ${name} is not active (active: ${q.state.activeId})`);
            const stageId = quest.stages[q.state.stageIndex]?.id;
            if (!cur || cur.id !== stageId) {
                close();
                cur = { id: stageId, turns: 0, hpLost: 0, healed: 0, eats: 0, drinks: 0, attacks: 0, casts: 0, mpSpent: 0, throws: 0,
                        deaths: 0, gold: 0, startTurn: g.turn, startGold: g.gold };
                stages.push(cur);
                waits = 0;
            }
            if (g.turn - cur.startTurn > STAGE_TURN_BUDGET) return result(`${stageId}: unfinished after ${STAGE_TURN_BUDGET} turns`);
            if (deaths >= MAX_ATTEMPTS) return result(`${stageId}: died ${deaths} times, last to ${killer()}`);
            const goals = route[stageId];
            if (!goals) return result(`no route for stage ${stageId}`);
            if (before.map !== g._mapUrl) before = standing(g);   // a new map: its first attempt starts here

            const a = decide(view(g), goals, knobs);
            if (a.kind === 'wait' && ++waits > MAX_WAITS) return result(`${stageId}: stuck — ${a.why}`);
            if (a.kind !== 'wait') waits = 0;
            const hp = g.playerHp, mp = g.playerMp, died = deaths;
            trace.push(`t${g.turn} ${g._mapUrl.replace('-map.json', '')} ${g.playerX},${g.playerY} hp${hp} ${a.kind}`
                + (a.dir ? ` ${a.dir}` : '') + (a.at ? ` @${a.at.x},${a.at.y}` : '')
                + (a.exposure && a.exposure !== 'unseen' ? ` [${a.exposure}]` : '') + (a.why ? ` (${a.why})` : ''));
            const failure = await act(a);
            if (failure) return result(`${stageId}: ${failure}`);
            if (deaths > died) { cur.deaths += deaths - died; cur.hpLost += hp; }
            else if (g.playerHp < hp) cur.hpLost += hp - g.playerHp;
            else cur.healed += g.playerHp - hp;
            if (a.kind === 'eat') cur.eats++;
            if (a.kind === 'drink') cur.drinks++;
            if (a.kind === 'attack') cur.attacks++;
            if (a.kind === 'throw') cur.throws++;
            if (a.kind === 'cast') { cur.casts++; if (deaths === died) cur.mpSpent += Math.max(0, mp - g.playerMp); }
            await idle(BEAT_MS);
            if (deaths > died) {
                // Back on your feet: did that attempt cost the enemies anything?
                const now = standing(g);
                if (sameStanding(now, before)) {
                    return result(`${stageId}: attempt ${deaths} changed nothing — died to ${killer()}, the enemies as they were`);
                }
                before = now;
            }
        }
    }
    const killer = () => lastKiller || 'something';

    // Stage 3's fixed scripts.
    const occupied = (x, y) => g.enemies.some((e) => e.entity.isAlive() && e.x === x && e.y === y);
    const isOpen = (x, y) => g.map.isWalkable(x, y) && !occupied(x, y);
    async function walkTo(to, maxSteps = 200) {
        for (let n = 0; n < maxSteps; n++) {
            if (g.playerX === to.x && g.playerY === to.y) return null;
            const path = pathTo(isOpen, { x: g.playerX, y: g.playerY }, to);
            if (!path) { await press('KeyT'); continue; }   // hemmed in by passers-by: wait a turn
            const turned = await face(path[0]);
            if (turned) return turned;
            await press(DIR_CODES[path[0]]);
            if (g.state !== 'idle') return `a step ${path[0]} left the game in state "${g.state}"`;
        }
        return `did not reach ${to.x},${to.y} in ${maxSteps} steps (stopped at ${g.playerX},${g.playerY})`;
    }
    async function op(o) {
        if (o.walkTo) return walkTo(o.walkTo);
        if (o.face) return face(o.face);
        if (o.press) { await press(o.press); return null; }
        if (o.idle) { await idle(o.idle); return null; }
        return `unknown op ${JSON.stringify(o)}`;
    }
    async function playOps(script) {
        for (const o of script.ops) {
            if (ap.opts.jitter) await realSleep(Math.floor(Math.random() * 400));
            const failure = await op(o);
            if (failure) return { finished: false, failure, stages: [] };
        }
        const miss = script.expect(g);
        return { finished: !miss, failure: miss, stages: [] };
    }

    return { settle, playRoute, playOps, deaths: () => deaths, trace: () => trace.slice(-300) };
}

function showLabel(text) {
    const el = document.createElement('div');
    el.id = 'autoplay-label';
    el.textContent = text;
    Object.assign(el.style, {
        position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)', zIndex: '9999',
        padding: '4px 10px', font: '18px VT323, monospace', color: '#fff3d0',
        background: 'rgba(20, 12, 8, 0.85)', border: '1px solid #cba43c', pointerEvents: 'none',
    });
    document.body.appendChild(el);
    return el;
}

// After a watched run, give the player the game: let the virtual clock follow
// real time from here on, so it plays like any other page.
function handBack(ap) {
    if (!ap.clock) return;
    let last = ap.real.now();
    const pump = () => {
        const now = ap.real.now();
        ap.clock.advance(now - last);
        last = now;
        ap.real.setTimeout(pump, 16);
    };
    pump();
}
