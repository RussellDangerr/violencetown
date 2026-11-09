#!/usr/bin/env node
// autoplay-sim.mjs — the autoplay over many seeds (plans/sim1-autoplay-many-seeds.md).
//
//   node tools/autoplay-sim.mjs [--seeds=50 | --seeds=1-50] [--scripts=quest,sneak,loops] [--workers=8]
//   node tools/autoplay-sim.mjs --write     save the result as tools/autoplay-sim-baseline.json
//   node tools/autoplay-sim.mjs --check     run the baseline's seeds again and say what moved
//   add --all to print every number, not only the ones that moved
//
// Each run is one `node tools/autoplay.mjs --script=S --seed=K --json`, several
// at once, each with its own Chrome; autoplay.mjs is unchanged. A run that
// broke (console errors, a timeout, no report) is listed by seed and kept out
// of the numbers. A run that simply did not finish is data: it lowers the
// finish rate.
// Exit: 0 ok · 1 something moved or a run broke · 3 no Chrome.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, compare } from './autoplay-stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUTOPLAY = path.join(HERE, 'autoplay.mjs');
const BASELINE = path.join(HERE, 'autoplay-sim-baseline.json');
const SCRIPTS = ['quest', 'sneak', 'loops'];

function parseArgs(argv) {
    const o = { seeds: null, scripts: SCRIPTS, workers: Math.max(1, Math.min(8, Math.floor(cpus().length / 2))),
                write: false, check: false, all: false, timeout: 180000 };
    for (const a of argv) {
        const [k, v] = a.replace(/^--/, '').split('=');
        if (k === 'seeds') o.seeds = parseSeeds(v);
        else if (k === 'scripts') o.scripts = v.split(',').filter(Boolean);
        else if (k === 'workers' || k === 'timeout') o[k] = Number(v);
        else if (k === 'write' || k === 'check' || k === 'all') o[k] = true;
        else throw new Error(`unknown option ${a}`);
    }
    return o;
}

// "50" is seeds 1..50; "11-60" is 11..60.
function parseSeeds(v) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(v ?? '');
    if (!m) throw new Error(`--seeds wants N or A-B, got ${v}`);
    const [from, to] = m[2] ? [Number(m[1]), Number(m[2])] : [1, Number(m[1])];
    if (!(from >= 1 && to >= from)) throw new Error(`bad seed range ${v}`);
    return [from, to];
}

function playOne(script, seed, timeout) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [AUTOPLAY, `--script=${script}`, `--seed=${seed}`, '--json', `--timeout=${timeout}`],
            { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        child.on('close', (code) => {
            if (code === 3) return resolve({ noChrome: true });
            let report = null;
            try { report = JSON.parse(out.slice(out.indexOf('{'))).runs?.[0] ?? null; } catch { /* broken below */ }
            const firstError = err.split('\n').find((l) => /Error|error/.test(l))?.trim() ?? err.trim().split('\n')[0] ?? '';
            const why = !report ? `no report (exit ${code}) ${firstError}`.trim()
                : report.errors?.length ? `console errors: ${report.errors[0]}`
                : report.finished === undefined ? report.reason || 'no result'
                : null;
            resolve({ script, seed, report, broken: why });
        });
    });
}

async function playAll(jobs, workers, timeout) {
    const results = [];
    let next = 0, done = 0;
    const t0 = Date.now();
    const worker = async () => {
        while (next < jobs.length) {
            const job = jobs[next++];
            const r = await playOne(job.script, job.seed, timeout);
            if (r.noChrome) { console.error('autoplay-sim: no Chrome found — set CHROME_PATH'); process.exit(3); }
            results.push(r);
            done++;
            process.stderr.write(`\r  ${done}/${jobs.length} runs · ${Math.round((Date.now() - t0) / 1000)} s `);
        }
    };
    await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, worker));
    process.stderr.write('\n');
    return results;
}

// What the baseline keeps of a script: its numbers, the broken seeds, and each
// seed's end state, so a later run can say which seeds changed at all.
function scoreScript(results) {
    const ok = results.filter((r) => !r.broken).sort((a, b) => a.seed - b.seed);
    return {
        ...aggregate(ok.map((r) => r.report)),
        broken: results.filter((r) => r.broken).map((r) => ({ seed: r.seed, why: r.broken })).sort((a, b) => a.seed - b.seed),
        seeds: Object.fromEntries(ok.map((r) => [r.seed, r.report.fingerprint])),
    };
}

const fmt = (x) => (x == null ? '—' : Number.isInteger(x) ? String(x) : x.toFixed(2));
const pct = (x) => `${Math.round(x * 100)}%`;

function printScript(name, s, all) {
    const fin = s.metrics.finished;
    console.log(`\n${name}: ${s.n} seeds · finished ${fin ? pct(fin.mean) : '—'} · ${s.broken.length} broken`);
    if (!all) {
        for (const k of ['turn', 'deaths']) {
            const m = s.metrics[k];
            if (m) console.log(`  ${k.padEnd(30)} ${fmt(m.mean).padStart(8)} ± ${fmt(m.margin)}  (sd ${fmt(m.sd)})`);
        }
        return;
    }
    for (const [k, m] of Object.entries(s.metrics)) {
        console.log(`  ${k.padEnd(30)} ${fmt(m.mean).padStart(8)} ± ${fmt(m.margin).padEnd(7)} sd ${fmt(m.sd).padEnd(7)} n ${m.n}`);
    }
}

const o = parseArgs(process.argv.slice(2));
const base = o.check ? (existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null) : null;
if (o.check && !base) { console.error(`autoplay-sim: no baseline at ${path.relative(process.cwd(), BASELINE)}; run --write first`); process.exit(1); }
const [from, to] = o.seeds ?? base?.seeds ?? [1, 50];
const scripts = o.check && !process.argv.some((a) => a.startsWith('--scripts')) ? Object.keys(base.scripts) : o.scripts;
const jobs = scripts.flatMap((script) => Array.from({ length: to - from + 1 }, (_, i) => ({ script, seed: from + i })));
console.log(`autoplay-sim: ${scripts.join(', ')} on seeds ${from}-${to} (${jobs.length} runs, ${o.workers} at a time)`);

const results = await playAll(jobs, o.workers, o.timeout);
const now = { seeds: [from, to], scripts: Object.fromEntries(scripts.map((s) => [s, scoreScript(results.filter((r) => r.script === s))])) };

let failed = false;
for (const [name, s] of Object.entries(now.scripts)) {
    printScript(name, s, o.all || o.write);
    for (const b of s.broken) console.log(`  BROKEN seed ${b.seed}: ${b.why}`);
    if (s.broken.length) failed = true;
}

if (o.check) {
    console.log(`\nAgainst the baseline (seeds ${base.seeds.join('-')}; a move counts past its 95% noise and 2% of the baseline):`);
    for (const [name, s] of Object.entries(now.scripts)) {
        const was = base.scripts[name];
        if (!was) { console.log(`  ${name}: not in the baseline`); continue; }
        const r = compare(was, s);
        const changed = Object.keys(s.seeds).filter((k) => was.seeds?.[k] && was.seeds[k] !== s.seeds[k]).length;
        console.log(`  ${name}: ${r.moved.length} moved · ${changed} of ${Object.keys(s.seeds).length} seeds ended differently`);
        const show = (tag, m) => {
            const sign = m.delta > 0 ? '+' : '';
            console.log(`    ${tag} ${m.name.padEnd(28)} ${fmt(m.was)} -> ${fmt(m.now)}  (${sign}${fmt(m.delta)}, noise ±${fmt(m.noise)})`);
        };
        for (const m of r.moved) show('MOVED', m);
        if (o.all) for (const m of r.steady.filter((x) => x.delta !== 0)) show('steady', m);
        for (const k of r.appeared) console.log(`    new   ${k}`);
        for (const k of r.gone) console.log(`    gone  ${k}`);
        if (r.moved.length) failed = true;
    }
}

if (o.write) {
    writeFileSync(BASELINE, JSON.stringify(now, null, 2) + '\n');
    console.log(`\nwrote ${path.relative(process.cwd(), BASELINE)}`);
}
process.exit(failed ? 1 : 0);
