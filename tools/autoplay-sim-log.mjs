// autoplay-sim-log.mjs — the sim's run log (plans/sim3-run-log.md).
// Each sim:check / sim:write adds one JSON line to tools/.sim-runs/runs.jsonl and keeps
// that run's per-seed lines as tools/.sim-runs/<runId>.jsonl. Local only (gitignored).
// buildRow and historyLines are pure; appendRun and readRows touch the disk.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const RUNS_FILE = 'runs.jsonl';

// 2026-11-15T09:30:05.123Z + abc1234 -> 20261115T093005-abc1234
export function runIdOf(at, sha) {
    return `${new Date(at).toISOString().replace(/\.\d+Z$/, '').replace(/[-:]/g, '')}-${sha ?? 'nosha'}`;
}

const keep = (m) => (m ? { mean: m.mean, margin: m.margin } : null);

// scripts: { name: { n, metrics, broken: [{seed, why}] } } (the sim's scored scripts)
// moved: { name: [metric names] } or null (a write moves nothing)
// changed: { name: count } or null
export function buildRow({ at, sha, dirty, command, seeds, scripts, moved = null, changed = null, minutes }) {
    return {
        id: runIdOf(at, sha),
        at: new Date(at).toISOString(),
        sha: sha ?? null,
        dirty: Boolean(dirty),
        command,
        seeds,
        scripts: Object.fromEntries(Object.entries(scripts).map(([name, s]) => [name, {
            n: s.n,
            finished: s.metrics?.finished ? s.metrics.finished.mean : null,
            turn: keep(s.metrics?.turn),
            deaths: keep(s.metrics?.deaths),
            broken: (s.broken ?? []).map((b) => b.seed),
            moved: moved?.[name] ?? [],
            changed: changed?.[name] ?? null,
        }])),
        minutes: Math.round(minutes * 10) / 10,
    };
}

export function appendRun(dir, row, seedLines) {
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, RUNS_FILE), `${JSON.stringify(row)}\n`);
    writeFileSync(path.join(dir, `${row.id}.jsonl`), seedLines.map((l) => `${JSON.stringify(l)}\n`).join(''));
}

export function readRows(dir) {
    const f = path.join(dir, RUNS_FILE);
    if (!existsSync(f)) return [];
    return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// One line per run, newest first: date, short sha (+ when dirty), finish rates, MOVED count.
export function historyLines(rows) {
    return [...rows].reverse().map((r) => {
        const rates = Object.entries(r.scripts)
            .map(([n, s]) => `${n} ${s.finished == null ? '—' : `${Math.round(s.finished * 100)}%`}`).join(' ');
        const moved = Object.values(r.scripts).reduce((a, s) => a + s.moved.length, 0);
        const how = r.command === 'check' ? `${moved} MOVED` : r.command;
        return `${r.at.slice(0, 16).replace('T', ' ')}  ${(r.sha ?? '-------').slice(0, 7)}${r.dirty ? '+' : ' '}  ${rates}  ${how}`;
    });
}
