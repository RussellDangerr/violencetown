// autoplay-runs.mjs — play many autoplay runs at once, each its own
// `node tools/autoplay.mjs --script=S --seed=K --json` with its own Chrome.
// Shared by the sim (autoplay-sim.mjs) and the spirit harvest
// (spirit-harvest.mjs). A run that broke (console errors, a timeout, no report)
// comes back with `broken` saying why; a run that simply did not finish is data.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTOPLAY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'autoplay.mjs');

export function playOne(script, seed, timeout) {
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

// `tool` names the caller in the no-Chrome message. Exits 3 without Chrome.
export async function playAll(jobs, workers, timeout, tool = 'autoplay') {
    const results = [];
    let next = 0, done = 0;
    const t0 = Date.now();
    const worker = async () => {
        while (next < jobs.length) {
            const job = jobs[next++];
            const r = await playOne(job.script, job.seed, timeout);
            if (r.noChrome) { console.error(`${tool}: no Chrome found — set CHROME_PATH`); process.exit(3); }
            results.push(r);
            done++;
            process.stderr.write(`\r  ${done}/${jobs.length} runs · ${Math.round((Date.now() - t0) / 1000)} s `);
        }
    };
    await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, worker));
    process.stderr.write('\n');
    return results;
}

// "50" is seeds 1..50; "11-60" is 11..60.
export function parseSeeds(v) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(v ?? '');
    if (!m) throw new Error(`--seeds wants N or A-B, got ${v}`);
    const [from, to] = m[2] ? [Number(m[1]), Number(m[2])] : [1, Number(m[1])];
    if (!(from >= 1 && to >= from)) throw new Error(`bad seed range ${v}`);
    return [from, to];
}
