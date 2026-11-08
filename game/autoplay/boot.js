// boot.js — the autoplay's hook (plans/quest1-autoplay.md §5.1). index.html
// loads it before main.js. Without ?autoplay in the URL it does nothing at all;
// with it, it swaps in the virtual clock, walls the run off from the player's
// storage, counts network requests, then hands off to run.js.
//
//   ?autoplay&seed=1&script=car   virtual clock, as fast as the machine allows
//   &clock=real                   the wall clock instead — the control that shows
//                                 why the virtual one is needed
//   &jitter                       random REAL pauses between actions; must not
//                                 change a virtual-clock run at all
//   &speed=4                      watch at 4x; speed=0 is as fast as the machine
//                                 allows (the runner's default). A person opening
//                                 ?autoplay gets 1x.
//   &driver=cdp                   tools/autoplay.mjs is driving, and reloads the
//                                 page when a run asks (plans/al2-loops-reload-continue.md);
//                                 without it the page reloads itself
//   &break=player.gold            spoil that field of the save carried across a
//                                 reload: proof the reload check can fail

import { createClock } from './clock.js';
import { memoryStorage, fencedFetch } from './isolate.js';

// The in-memory store dies with the page, so a run that reloads carries it
// (and the run so far) in sessionStorage under this one key: written on
// pagehide, after the game's own save-on-leave, and removed by the next page
// as it reads it.
export const CARRY_KEY = 'violencetown.autoplay.carry';
const SAVE_KEY = 'violencetown.save';

const params = new URLSearchParams(globalThis.location?.search ?? '');
if (params.has('autoplay')) install(params);

function install(params) {
    const opts = {
        seed: Number(params.get('seed') ?? 1) >>> 0,
        script: params.get('script') || 'car',
        clock: params.get('clock') === 'real' ? 'real' : 'virtual',
        jitter: params.has('jitter'),
        speed: params.has('speed') ? Math.max(0, Number(params.get('speed')) || 0) : 1,
        driven: params.get('driver') === 'cdp',
        break: params.get('break') || null,
    };
    const real = { now: performance.now.bind(performance), setTimeout: window.setTimeout.bind(window) };

    const errors = [];
    const note = (e) => errors.push(String((e && e.stack) || e));
    window.addEventListener('error', (e) => note(e.error || e.message));
    window.addEventListener('unhandledrejection', (e) => note(e.reason));

    // The real Storage methods, kept before they are swapped out. The carry is
    // the one thing that touches the browser's own storage, and only session
    // storage, which a tab keeps across a reload and drops when it closes.
    const session = window.sessionStorage;
    const realStorage = Object.fromEntries(['getItem', 'setItem', 'removeItem'].map((m) => [m, Storage.prototype[m]]));
    const store = memoryStorage();
    for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
        Storage.prototype[m] = function (...a) { return store[m](...a); };
    }
    Object.defineProperty(Storage.prototype, 'length', { get: () => store.length, configurable: true });

    let carried = null;
    try { carried = takeCarry(realStorage.getItem.call(session, CARRY_KEY), opts); } catch (e) { note(e); }
    realStorage.removeItem.call(session, CARRY_KEY);
    if (carried) for (const [k, v] of Object.entries(carried.storage)) store.setItem(k, v);

    // run.js calls this when its script reloads. On the way out, after the
    // game has saved, the store and the run so far are written for the next page.
    const carryOnLeave = (run) => {
        window.addEventListener('pagehide', () => {
            const dump = {};
            for (let i = 0; i < store.length; i++) dump[store.key(i)] = store.getItem(store.key(i));
            realStorage.setItem.call(session, CARRY_KEY, JSON.stringify({ script: opts.script, seed: opts.seed, storage: dump, run }));
        }, { once: true });
    };

    const fence = fencedFetch(window.fetch.bind(window));
    window.fetch = fence.fetch;

    let clock = null;
    if (opts.clock === 'virtual') {
        clock = createClock({ onError: (e) => { note(e); console.error(e); } });
        Object.assign(window, {
            setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
            setInterval: clock.setInterval, clearInterval: clock.clearInterval,
            requestAnimationFrame: clock.requestAnimationFrame, cancelAnimationFrame: clock.cancelAnimationFrame,
        });
        Object.defineProperty(performance, 'now', { value: clock.now, configurable: true });
    }

    let finish;
    const done = new Promise((r) => { finish = r; });
    window.__autoplay = { opts, real, clock, errors, inflight: fence.inflight, done,
                          resumed: carried ? carried.run : null, carryOnLeave };

    const runUrl = new URL('./run.js', import.meta.url);
    runUrl.search = new URL(import.meta.url).search;   // keep the dev server's cache-buster
    import(runUrl.href)
        .then((m) => m.run(window.__autoplay))
        .catch((e) => ({ ok: false, reason: String((e && e.stack) || e), errors }))
        .then(finish);
}

// The carry a reload left, if it belongs to this run (same script and seed),
// with `opts.break` applied to the save in it. Null for none, or for one some
// other run left behind.
export function takeCarry(json, opts) {
    if (!json) return null;
    let c;
    try { c = JSON.parse(json); } catch { return null; }
    if (!c || c.script !== opts.script || c.seed !== opts.seed || !c.storage || typeof c.storage !== 'object') return null;
    if (opts.break && c.storage[SAVE_KEY] != null) c.storage[SAVE_KEY] = breakSave(c.storage[SAVE_KEY], opts.break);
    return c;
}

// A save (JSON text) with one field spoiled, named by its dotted path: a
// number goes up by one, true/false flips, a string gains "_broken" (an id
// nothing knows), and a list loses its first entry that holds anything.
// Throws on a path the save does not have, so a typo cannot pass for a break.
export function breakSave(json, path) {
    const save = JSON.parse(json);
    const keys = String(path).split('.');
    const last = keys.pop();
    let at = save;
    for (const k of keys) {
        if (!at || typeof at !== 'object' || !(k in at)) throw new Error(`the save has no ${path}`);
        at = at[k];
    }
    if (!at || typeof at !== 'object' || !(last in at)) throw new Error(`the save has no ${path}`);
    const v = at[last];
    if (typeof v === 'number') at[last] = v + 1;
    else if (typeof v === 'boolean') at[last] = !v;
    else if (typeof v === 'string') at[last] = `${v}_broken`;
    else if (Array.isArray(v) && v.some((e) => e != null)) v[v.findIndex((e) => e != null)] = null;
    else throw new Error(`nothing to break at ${path}`);
    return JSON.stringify(save);
}
