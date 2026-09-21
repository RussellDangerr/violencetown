#!/usr/bin/env node
// autoplay.mjs — run the autoplay headless (plans/quest1-autoplay.md §5.1).
//
//   node tools/autoplay.mjs [--seed=1] [--script=car|quest] [--repeat=1] [--jitter] [--clock=real] [--json] [--timeout=120000]
//   node tools/autoplay.mjs --check | --write          quest 1 against tools/autoplay-golden.json
//   node tools/autoplay.mjs --script=quest --speed=3 --gif=run.gif [--frameMs=250]
//
// Serves game/ itself, drives the installed Chrome over the DevTools protocol
// (Node's built-in WebSocket — no dependencies), and prints one line per run.
// With --repeat, every run of the seed must end in the same state. --speed
// paces game time to N x real time (0, the default, is as fast as it goes);
// a --gif needs a watchable speed or the frames skip the story.
// Exit: 0 ok · 1 a run failed, drifted or did not finish · 2 runs of one seed disagreed · 3 no Chrome.

import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'game');
const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json',
    '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
    const o = { seed: 1, script: 'car', repeat: 1, jitter: false, clock: 'virtual', json: false, timeout: 120000,
                speed: 0, check: false, write: false, gif: null, frameMs: 250 };
    for (const a of argv) {
        const [k, v] = a.replace(/^--/, '').split('=');
        if (['seed', 'repeat', 'timeout', 'speed', 'frameMs'].includes(k)) o[k] = Number(v);
        else if (k === 'script' || k === 'clock' || k === 'gif') o[k] = v;
        else if (k === 'jitter' || k === 'json' || k === 'check' || k === 'write') o[k] = true;
        else throw new Error(`unknown option ${a}`);
    }
    return o;
}

function serve() {
    const server = http.createServer(async (req, res) => {
        let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (rel.endsWith('/')) rel += 'index.html';
        const file = path.join(ROOT, rel);
        if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        try {
            const body = await readFile(file);
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(body);
        } catch {
            res.writeHead(404).end();
        }
    });
    return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

const CHROMES = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

async function launchChrome() {
    const exe = CHROMES.find((p) => existsSync(p));
    if (!exe) return null;
    const profile = await mkdtemp(path.join(tmpdir(), 'vt-autoplay-'));
    const proc = spawn(exe, [
        '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
        '--no-first-run', '--no-default-browser-check', '--mute-audio', '--window-size=1280,900', 'about:blank',
    ], { stdio: 'ignore' });
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 300; i++) {
        const port = existsSync(portFile) ? Number(readFileSync(portFile, 'utf8').split('\n')[0]) : 0;
        if (port > 0) return { proc, profile, port };
        await sleep(50);
    }
    killTree(proc);
    throw new Error('Chrome never opened its DevTools port');
}

// Chrome is a process tree; on Windows, killing the parent leaves children
// holding the profile directory open.
function killTree(proc) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else proc.kill('SIGKILL');
}

async function connect(port) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('Chrome has no page to drive');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const waiting = new Map();
    const listeners = new Set();
    ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && waiting.has(msg.id)) {
            const { resolve, reject } = waiting.get(msg.id);
            waiting.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
        } else {
            for (const l of listeners) l(msg);
        }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const i = ++id;
        waiting.set(i, { resolve, reject });
        ws.send(JSON.stringify({ id: i, method, params }));
    });
    const once = (method) => new Promise((resolve) => {
        const l = (m) => { if (m.method === method) { listeners.delete(l); resolve(m.params); } };
        listeners.add(l);
    });
    return { send, once, on: (l) => listeners.add(l), close: () => ws.close() };
}

async function runOnce(cdp, base, o) {
    const q = new URLSearchParams({ autoplay: '1', seed: String(o.seed), script: o.script });
    if (o.clock === 'real') q.set('clock', 'real');
    if (o.jitter) q.set('jitter', '1');
    q.set('speed', String(o.speed));
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: `${base}/?${q}` });
    await loaded;
    const evaluation = cdp.send('Runtime.evaluate', {
        expression: 'window.__autoplay ? window.__autoplay.done : { ok: false, reason: "boot.js never installed" }',
        awaitPromise: true, returnByValue: true,
    });
    const frames = [];
    let capturing = !!o.gif;
    const capture = (async () => {
        while (capturing) {
            const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
            if (shot) frames.push(Buffer.from(shot.data, 'base64'));
            await sleep(o.frameMs);
        }
    })();
    const out = await Promise.race([evaluation, sleep(o.timeout).then(() => null)]);
    capturing = false;
    await capture;
    if (o.gif && frames.length) {
        const dir = await mkdtemp(path.join(tmpdir(), 'vt-frames-'));
        frames.forEach((f, i) => writeFileSync(path.join(dir, `f${String(i).padStart(5, '0')}.png`), f));
        const py = spawnSync('python', [path.resolve(ROOT, '..', 'tools', 'frames_to_gif.py'), dir, o.gif, String(o.frameMs)], { encoding: 'utf8' });
        process.stderr.write(py.stdout || py.stderr || '');
        await rm(dir, { recursive: true, force: true });
    }
    if (!out) return { ok: false, reason: `no result in ${o.timeout} ms` };
    if (out.exceptionDetails) return { ok: false, reason: out.exceptionDetails.text };
    return out.result.value;
}

function line(i, r) {
    const where = r.quest ? `quest ${r.quest.id}#${r.quest.stage} at ${r.at.map} ${r.at.x},${r.at.y}` : '';
    const time = r.virtualMs != null ? `virtual ${r.virtualMs} ms, real ${r.realMs} ms` : `real ${r.realMs} ms`;
    const head = `run ${i + 1}: ${r.ok ? 'ok  ' : 'FAIL'} seed ${r.seed} ${r.script} · ${where} · turn ${r.turn} · ${time} · ${r.fingerprint}`;
    const stages = (r.stages || []).map((s) =>
        `\n  ${s.id.padEnd(18)} ${String(s.turns).padStart(4)} turns · -${s.hpLost} hp · +${s.healed} hp · ${s.eats} eats · ${s.attacks} hits · ${s.deaths} deaths · ${s.gold >= 0 ? '+' : ''}${s.gold} gp`);
    const why = r.ok ? '' : `\n  ${r.reason}${(r.errors || []).length ? '\n  ' + r.errors.join('\n  ') : ''}`;
    return head + stages.join('') + why;
}

// The scripts the golden covers: the fighter (ruling Q1-2) and the sneak
// (ruling Q1-8), on the golden's seed.
const CHECKED = ['quest', 'sneak'];

// What the golden keeps of a run: whether it finished, where it ended, and
// each stage's score.
const summary = (r) => ({
    script: r.script, seed: r.seed, finished: !!r.finished, reason: r.finished ? null : r.reason,
    fingerprint: r.fingerprint, turn: r.turn, deaths: r.deaths, stages: r.stages || [],
});

// Every leaf that differs, as "path: was -> now".
function drift(want, got, at = '') {
    if (typeof want !== 'object' || want === null || typeof got !== 'object' || got === null) {
        return JSON.stringify(want) === JSON.stringify(got) ? [] : [`${at || '(root)'}: ${JSON.stringify(want)} -> ${JSON.stringify(got)}`];
    }
    const keys = new Set([...Object.keys(want), ...Object.keys(got)]);
    return [...keys].flatMap((k) => drift(want[k], got[k], at ? `${at}.${k}` : k));
}

const o = parseArgs(process.argv.slice(2));
const GOLDEN = path.resolve(ROOT, '..', 'tools', 'autoplay-golden.json');
if (o.check) o.seed = JSON.parse(readFileSync(GOLDEN, 'utf8')).seed;
const scored = o.check || o.write;
const jobs = scored ? CHECKED.map((script) => ({ ...o, script })) : Array.from({ length: o.repeat }, () => o);
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launchChrome();
if (!chrome) {
    console.error('autoplay: no Chrome found — set CHROME_PATH');
    server.close();
    process.exit(3);
}

let code = 0;
try {
    const cdp = await connect(chrome.port);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const consoleErrors = [];
    cdp.on((m) => {
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
            consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
        }
    });
    const runs = [];
    for (const [i, job] of jobs.entries()) {
        consoleErrors.length = 0;
        const r = await runOnce(cdp, base, job);
        if (consoleErrors.length) { r.ok = false; r.reason = r.reason || 'console errors'; r.errors = [...(r.errors || []), ...consoleErrors]; }
        runs.push(r);
        if (!o.json) console.log(line(i, r));
    }
    const prints = new Set(runs.map((r) => r.fingerprint));
    const disagree = !scored && runs.length > 1 && prints.size > 1;
    if (o.json) console.log(JSON.stringify({ options: o, runs, deterministic: !disagree }, null, 2));
    else if (!scored && runs.length > 1) {
        console.log(disagree
            ? `NONDETERMINISTIC: ${prints.size} different end states from seed ${o.seed}`
            : `deterministic: ${runs.length} runs, one end state (${[...prints][0]})`);
    }
    // Whether a run finishes is part of what the golden records (ruling Q1-8
    // made the fighter's failure the expected outcome), so a run that does not
    // finish is reported, and fails the check only if that is a change.
    const golden = { seed: o.seed, runs: Object.fromEntries(runs.map((r) => [r.script, summary(r)])) };
    if (o.write) {
        writeFileSync(GOLDEN, JSON.stringify(golden, null, 2) + '\n');
        console.log(`wrote ${path.relative(process.cwd(), GOLDEN)}`);
    }
    let checkFailed = false;
    if (o.check) {
        const diffs = drift(JSON.parse(readFileSync(GOLDEN, 'utf8')), golden);
        if (diffs.length) { console.log('DRIFT from the autoplay golden:'); for (const d of diffs) console.log(`  ${d}`); }
        else console.log('autoplay golden matches — no drift');
        for (const r of runs) if (!r.finished) console.log(`not finished (${r.script}): ${r.reason}`);
        checkFailed = diffs.length > 0;
    }
    const failed = runs.some((r) => !r.ok && !(scored && r.finished === false && !(r.errors || []).length));
    code = failed || checkFailed ? 1 : disagree ? 2 : 0;
    cdp.close();
} finally {
    killTree(chrome.proc);
    server.close();
    await rm(chrome.profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
process.exit(code);
