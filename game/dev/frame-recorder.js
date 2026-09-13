// frame-recorder.js — stage 1's proof for plans/screen-fill-implementation.md.
//
// Records WHAT the renderer draws and WHERE for one frame of three fixed
// scenes: every drawing call with its arguments, the transform it was drawn
// under and the paint state it was drawn with, on the game canvas and on any
// offscreen canvas the frame touches. How the transform was built (save,
// translate, setTransform) is not recorded, so moving that plumbing around
// does not change a hash; drawing anything anywhere else does.
//
// Development only: nothing in the game imports it. Deleted with the classic
// viewport in Task 14.
//
// Use it in a Browser-pane test tab that has just loaded, had its autosave
// stubbed and pressed GAME START (see Task 1, Step 3). Always a FRESH tab:
// the log strip and quest state carry over between runs in one tab.

const CHUNK = 200;   // log lines per chunk hash, to locate a difference

const DRAW = new Set([
    'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage', 'putImageData',
    'fill', 'stroke', 'clip', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'ellipse', 'rect', 'roundRect', 'quadraticCurveTo', 'bezierCurveTo',
]);
const MAKE = new Set(['createRadialGradient', 'createLinearGradient', 'createConicGradient', 'createPattern']);

const r3 = (n) => Math.round(n * 1000) / 1000;

function label(v, names) {
    if (typeof v === 'number') return r3(v);
    if (v == null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (names.has(v)) return names.get(v);
    if (v instanceof HTMLImageElement) return 'img:' + v.src.split('/').pop().split('?')[0];
    if (v instanceof HTMLCanvasElement) return `canvas:${v.width}x${v.height}`;
    if (typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap) return `bitmap:${v.width}x${v.height}`;
    return v.constructor ? v.constructor.name : typeof v;
}

function recording(ctx, name, log, names) {
    const paint = () => {
        const m = ctx.getTransform();
        return [
            [m.a, m.b, m.c, m.d, m.e, m.f].map(r3).join(' '),
            label(ctx.fillStyle, names), label(ctx.strokeStyle, names), r3(ctx.globalAlpha),
            ctx.globalCompositeOperation, r3(ctx.lineWidth), ctx.font, ctx.textAlign, ctx.textBaseline,
            ctx.getLineDash().map(r3).join(','), ctx.imageSmoothingEnabled,
        ].join('|');
    };
    return new Proxy(ctx, {
        get(target, key) {
            const v = Reflect.get(target, key);
            if (typeof v !== 'function') return v;
            if (DRAW.has(key)) return (...args) => {
                log.push(`${name}.${key}(${args.map((a) => label(a, names)).join(',')}) @ ${paint()}`);
                return v.apply(target, args);
            };
            if (MAKE.has(key)) return (...args) => {
                const made = v.apply(target, args);
                if (!made) return made;
                names.set(made, `${key.slice(6)}(${args.map((a) => label(a, names)).join(',')})`);
                if (typeof made.addColorStop === 'function') {
                    const add = made.addColorStop.bind(made);
                    made.addColorStop = (offset, color) => {
                        names.set(made, `${names.get(made)}[${r3(offset)}:${color}]`);
                        return add(offset, color);
                    };
                }
                return made;
            };
            return v.bind(target);
        },
        set(target, key, value) { target[key] = value; return true; },
    });
}

async function sha256(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Settle a scene with 60 unrecorded frames (eases such as the combat arena
// converge), then record one frame. Called with the clock already frozen.
async function frame(game) {
    const r = game.renderer;
    game._idleTick = 0;
    game._animating = false;
    game._damageNumbers = [];
    game._logStripMessages = [
        { text: '[Recorder: a system line]', category: 'system' },
        { text: '[Recorder: a combat line]', category: 'combat' },
    ];
    for (let i = 0; i < 60; i++) r.renderFrame(game);
    r._vignetteGradient = null;   // rebuilt inside the recorded frame, so its geometry is logged
    r._ditherCache = null;        // likewise the threat stipple's pattern
    const log = [];
    const names = new Map();
    const realCtx = r.ctx;
    const realGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        const c = realGetContext.call(this, type, ...rest);
        return (type === '2d' && c && this !== r.canvas) ? recording(c, `off${this.width}x${this.height}`, log, names) : c;
    };
    r.ctx = recording(realCtx, 'main', log, names);
    try { r.renderFrame(game); }
    finally { r.ctx = realCtx; HTMLCanvasElement.prototype.getContext = realGetContext; }
    const chunks = [];
    for (let i = 0; i < log.length; i += CHUNK) chunks.push((await sha256(log.slice(i, i + CHUNK).join('\n'))).slice(0, 16));
    return { summary: { calls: log.length, hash: await sha256(log.join('\n')), chunks }, log };
}

// Records the three scenes. Returns { town, sewer, device } summaries
// ({ calls, hash, chunks }) and leaves the full logs on window.__frameLogs.
export async function recordScenes(game) {
    if (game.state !== 'idle') throw new Error(`recordScenes needs the game IDLE (it is ${game.state}): use a fresh tab`);
    const realNow = performance.now.bind(performance);
    const realRandom = Math.random;
    game.autosave = () => {};          // never write the save from a test tab
    game._worldBeat = () => {};        // freeze the free-roam heartbeat (NPCs, the clock)
    performance.now = () => 1e7;       // freeze every time-driven animation
    Math.random = () => 0.5;           // the renderer's only randomness is screen shake
    const out = {}, logs = {};
    try {
        // 1. Town at dusk: tiles, props, townsfolk, lighting, the HUD.
        game.rng.setState(1234);
        await game._loadMap('town-map.json');
        game._nightLevel = 0.6;
        ({ summary: out.town, log: logs.town } = await frame(game));

        // 2. A Sewer fight with the wheel open: arena, threat stipple, wheel.
        game.rng.setState(1234);
        await game._loadMap('sewer-map.json');
        game._nightLevel = 0;
        const foe = game.enemies.find((e) => e.entity.isAlive() && !e.ambient);
        const spot = [[-2, 0], [2, 0], [0, -2], [0, 2]]
            .map(([dx, dy]) => [foe.x + dx, foe.y + dy])
            .find(([x, y]) => game.map.isWalkable(x, y) && !game.enemies.some((e) => e.x === x && e.y === y));
        game.playerX = spot[0]; game.playerY = spot[1];
        foe.state = 'chasing';
        game._openWheel();
        game._overlayOpenedAt = 0;     // the open animation is long finished
        ({ summary: out.sewer, log: logs.sewer } = await frame(game));
        game._closeWheel();

        // 3. The Remoticon over Town: a menu.
        game.rng.setState(1234);
        await game._loadMap('town-map.json');
        game._openDevice('items');
        ({ summary: out.device, log: logs.device } = await frame(game));
        game._closeDevice();
    } finally {
        performance.now = realNow;
        Math.random = realRandom;
    }
    window.__frameLogs = logs;
    return out;
}

// Records the scenes again and compares them with classic-frames.json. Each
// scene reports 'match', or the first 200-call chunk that differs with that
// chunk's lines from this run, to show where to look.
export async function compareScenes(game) {
    const want = await (await fetch('/dev/classic-frames.json', { cache: 'no-store' })).json();
    const got = await recordScenes(game);
    const report = {};
    for (const name of ['town', 'sewer', 'device']) {
        const a = want[name], b = got[name];
        if (a.hash === b.hash) { report[name] = 'match'; continue; }
        let at = a.chunks.findIndex((c, i) => c !== b.chunks[i]);
        if (at < 0) at = Math.min(a.chunks.length, b.chunks.length);
        report[name] = { calls: { want: a.calls, got: b.calls }, chunk: at, lines: window.__frameLogs[name].slice(at * CHUNK, (at + 1) * CHUNK) };
    }
    return report;
}
