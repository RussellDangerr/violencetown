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

import { createClock } from './clock.js';
import { memoryStorage, fencedFetch } from './isolate.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
if (params.has('autoplay')) install(params);

function install(params) {
    const opts = {
        seed: Number(params.get('seed') ?? 1) >>> 0,
        script: params.get('script') || 'car',
        clock: params.get('clock') === 'real' ? 'real' : 'virtual',
        jitter: params.has('jitter'),
        speed: params.has('speed') ? Math.max(0, Number(params.get('speed')) || 0) : 1,
    };
    const real = { now: performance.now.bind(performance), setTimeout: window.setTimeout.bind(window) };

    const errors = [];
    const note = (e) => errors.push(String((e && e.stack) || e));
    window.addEventListener('error', (e) => note(e.error || e.message));
    window.addEventListener('unhandledrejection', (e) => note(e.reason));

    const store = memoryStorage();
    for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
        Storage.prototype[m] = function (...a) { return store[m](...a); };
    }
    Object.defineProperty(Storage.prototype, 'length', { get: () => store.length, configurable: true });

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
    window.__autoplay = { opts, real, clock, errors, inflight: fence.inflight, done };

    const runUrl = new URL('./run.js', import.meta.url);
    runUrl.search = new URL(import.meta.url).search;   // keep the dev server's cache-buster
    import(runUrl.href)
        .then((m) => m.run(window.__autoplay))
        .catch((e) => ({ ok: false, reason: String((e && e.stack) || e), errors }))
        .then(finish);
}
