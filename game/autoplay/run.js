// run.js — the autoplay driver (plans/quest1-autoplay.md §5.1). Loaded by
// boot.js only under ?autoplay. Plays a script against the real game — real
// key events into the real input handler — on the virtual clock, and returns a
// report. Stage 3's scripts are fixed lists; stage 4 replaces them with the
// goal table.

import { FRAME_MS } from './clock.js';
import { pathTo, DIR_CODES } from './path.js';
import { fingerprint } from './fingerprint.js';

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
};

const KEY = { KeyE: 'e', KeyT: 't' };

export async function run(ap) {
    const t0 = ap.real.now();
    const vt0 = ap.clock ? ap.clock.now() : null;
    const g = await waitForGame(ap);
    const d = driver(ap, g);
    const report = (ok, reason = null) => {
        const errors = [...ap.errors];
        return {
            ok: ok && errors.length === 0,
            reason: reason ?? (errors.length ? 'errors on the page' : null),
            seed: ap.opts.seed, script: ap.opts.script, clock: ap.opts.clock,
            fingerprint: fingerprint(g),
            turn: g.turn,
            quest: { id: g.questEngine.state.activeId, stage: g.questEngine.state.stageIndex },
            at: { map: g._mapUrl, x: g.playerX, y: g.playerY },
            virtualMs: ap.clock ? ap.clock.now() - vt0 : null,
            realMs: Math.round(ap.real.now() - t0),
            errors,
        };
    };
    const script = SCRIPTS[ap.opts.script];
    if (!script) return report(false, `no script named "${ap.opts.script}"`);
    try {
        document.getElementById('splash-go').click();
        await d.settle();
        await g._fullReset({ seed: ap.opts.seed });
        await d.settle();
        for (const op of script.ops) {
            if (ap.opts.jitter) await d.realSleep(Math.floor(Math.random() * 400));
            const failure = await d.op(op);
            if (failure) return report(false, failure);
        }
        const miss = script.expect(g);
        return report(!miss, miss);
    } catch (e) {
        return report(false, String((e && e.stack) || e));
    }
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

function driver(ap, g) {
    // A real macrotask with no 4 ms clamp: long enough for every promise the
    // last callback started to settle, short enough to run thousands a second.
    const channel = new MessageChannel();
    const macrotask = () => new Promise((r) => { channel.port1.onmessage = () => r(); channel.port2.postMessage(0); });
    const realSleep = (ms) => new Promise((r) => ap.real.setTimeout(r, ms));

    // Game time never moves while a request is in flight.
    const quiesce = async () => { do { await macrotask(); } while (ap.inflight() > 0); };
    const tick = async () => {
        if (ap.clock) ap.clock.advance(FRAME_MS); else await realSleep(FRAME_MS);
        await quiesce();
    };
    const busy = () => g._animating || g._turnTimer || ap.inflight() > 0 || g.state === 'resolving';

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
    async function press(code) { key('keydown', code); key('keyup', code); await settle(); }
    async function idle(ms) { for (let t = 0; t < ms; t += FRAME_MS) await tick(); await settle(); }

    // From a standstill a tap toward a new facing only turns (main.js
    // _beginMoveOrTurn), so facing is its own press.
    async function face(dir) {
        if (g.facing !== dir) await press(DIR_CODES[dir]);
        return g.facing === dir ? null : `could not face ${dir}`;
    }

    // Walking into someone opens their verb list rather than stepping, so the
    // path treats every living character as a wall — recomputed every step,
    // because the townsfolk wander.
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

    return { settle, realSleep, op };
}
