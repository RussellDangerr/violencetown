// autoplay-stats.mjs — the numbers behind the many-seeds autoplay
// (plans/sim1-autoplay-many-seeds.md). Pure: no Chrome, no files.
//
//   metricsOf(run)             one run's report -> { name: number }
//   aggregate(runs)            many runs of one script -> { n, metrics: { name: summary } }
//   compare(base, now, opts)   two aggregates -> the metrics that moved, and by how much

// Z for a two-sided 95% interval.
export const Z95 = 1.96;
// A move smaller than this share of the baseline never counts, however sure.
export const MIN_SHIFT = 0.02;

// One run as flat numbers. `finished` is 1 or 0, so its mean is the finish rate.
// A stage adds `<stage id>.<field>` for every number it carries.
export function metricsOf(run) {
    const m = { finished: run.finished ? 1 : 0 };
    if (Number.isFinite(run.turn)) m.turn = run.turn;
    if (Number.isFinite(run.deaths)) m.deaths = run.deaths;
    for (const s of run.stages ?? []) {
        for (const [k, v] of Object.entries(s)) {
            if (k !== 'id' && Number.isFinite(v)) m[`${s.id}.${k}`] = v;
        }
    }
    return m;
}

// Mean, sample standard deviation and the 95% margin of the mean.
export function summarize(values) {
    const n = values.length;
    if (!n) return { n: 0, mean: null, sd: null, margin: null };
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : 0;
    return { n, mean: round(mean), sd: round(sd), margin: round(Z95 * sd / Math.sqrt(n)) };
}

// A stage a run never reached adds nothing to that stage's numbers, so each
// metric keeps its own n.
export function aggregate(runs) {
    const values = {};
    for (const r of runs) {
        for (const [k, v] of Object.entries(metricsOf(r))) (values[k] ??= []).push(v);
    }
    const metrics = Object.fromEntries(Object.keys(values).sort(byName).map((k) => [k, summarize(values[k])]));
    return { n: runs.length, metrics };
}

// A metric moved when the means differ by more than Z95 combined standard
// errors AND by at least MIN_SHIFT of the baseline (or one whole unit when the
// baseline is 0). Metrics only one side has are listed as appeared/gone.
export function compare(base, now, { z = Z95, minShift = MIN_SHIFT } = {}) {
    const moved = [], steady = [], appeared = [], gone = [];
    for (const name of [...new Set([...Object.keys(base.metrics), ...Object.keys(now.metrics)])].sort(byName)) {
        const a = base.metrics[name], b = now.metrics[name];
        if (!a?.n) { if (b?.n) appeared.push(name); continue; }
        if (!b?.n) { gone.push(name); continue; }
        const delta = b.mean - a.mean;
        const se = Math.sqrt(a.sd ** 2 / a.n + b.sd ** 2 / b.n);
        const noise = z * se;
        const floor = a.mean === 0 ? 1 : Math.abs(a.mean) * minShift;
        const row = { name, was: a.mean, now: b.mean, delta: round(delta), noise: round(noise) };
        (Math.abs(delta) > noise && Math.abs(delta) >= floor ? moved : steady).push(row);
    }
    return { moved, steady, appeared, gone };
}

// Run-level numbers first, then the stage numbers, each group alphabetical.
const byName = (a, b) => (a.includes('.') - b.includes('.')) || a.localeCompare(b);
const round = (x) => Math.round(x * 1000) / 1000;

// ---- Spread (plans/sim4-sim-spread-changes.md) -----------------------------
// The averages can stay put while the dice stop mattering. A metric's spread
// changed when its sd moved by at least x2 or /2 AND a 95% variance test agrees
// (normal approximation on ln of the variance ratio, se^2 = 2/(n1-1) + 2/(n2-1)),
// or whenever it collapses to 0 or grows from 0. Shown, never a failure.
export const MIN_SPREAD_RATIO = 2;

export function spreadCompare(base, now, { z = Z95, ratio = MIN_SPREAD_RATIO } = {}) {
    const changed = [];
    for (const name of Object.keys(base.metrics).sort(byName)) {
        const a = base.metrics[name], b = now.metrics[name];
        if (!a || !b || a.n < 2 || b.n < 2) continue;
        if (a.sd === 0 && b.sd === 0) continue;
        const row = { name, was: a.sd, now: b.sd, n: Math.min(a.n, b.n) };
        if (a.sd === 0 || b.sd === 0) { changed.push({ ...row, kind: b.sd === 0 ? 'collapsed' : 'grew' }); continue; }
        const r = b.sd / a.sd;
        if (r < ratio && r > 1 / ratio) continue;
        const se = Math.sqrt(2 / (a.n - 1) + 2 / (b.n - 1));
        if (Math.abs(Math.log(r * r)) > z * se) changed.push({ ...row, kind: r > 1 ? 'wider' : 'narrower' });
    }
    return changed;
}

// ---- Paired comparison (plans/sim2-per-seed-numbers.md) --------------------
// Seed 17 before against seed 17 after: the per-seed differences carry far less
// luck than two separate groups do.

// Seeds-file lines (one per script and seed) -> { script: { seed: { metric: number } } }.
export function rowsByScript(lines) {
    const out = {};
    for (const { script, seed, ...metrics } of lines) (out[script] ??= {})[seed] = metrics;
    return out;
}

// One script's rows -> one jsonl line each, seeds ascending.
export function rowLines(script, perSeed) {
    return Object.entries(perSeed).sort((a, b) => a[0] - b[0]).map(([seed, metrics]) => ({ script, seed: Number(seed), ...metrics }));
}

// base and now are { seed: { metric: number } }. For each metric, the seeds both
// sides have it for are paired. MOVED means the mean difference is past
// z * sd(differences) / sqrt(n) AND at least minShift of the baseline's mean over
// those seeds (one whole unit when that mean is 0). `top` is the (up to) five
// seeds whose difference was largest, before -> after.
export function pairedCompare(base, now, { z = Z95, minShift = MIN_SHIFT, top = 5 } = {}) {
    const shared = Object.keys(base).filter((s) => s in now).map(Number).sort((a, b) => a - b);
    const names = new Set();
    for (const s of shared) for (const k of [...Object.keys(base[s]), ...Object.keys(now[s])]) names.add(k);
    const moved = [], steady = [], appeared = [], gone = [];
    for (const name of [...names].sort(byName)) {
        const pairs = shared.filter((s) => name in base[s] && name in now[s]).map((s) => ({ seed: s, was: base[s][name], now: now[s][name] }));
        if (!pairs.length) {
            if (shared.some((s) => name in now[s])) appeared.push(name); else gone.push(name);
            continue;
        }
        const d = pairs.map((p) => p.now - p.was);
        const n = d.length;
        const meanD = d.reduce((a, b) => a + b, 0) / n;
        const sd = n > 1 ? Math.sqrt(d.reduce((a, v) => a + (v - meanD) ** 2, 0) / (n - 1)) : 0;
        const noise = z * sd / Math.sqrt(n);
        const was = pairs.reduce((a, p) => a + p.was, 0) / n;
        const floor = was === 0 ? 1 : Math.abs(was) * minShift;
        const row = { name, n, was: round(was), now: round(was + meanD), delta: round(meanD), noise: round(noise) };
        if (n > 1 && Math.abs(meanD) > noise && Math.abs(meanD) >= floor) {
            row.top = pairs.filter((p) => p.now !== p.was)
                .sort((a, b) => Math.abs(b.now - b.was) - Math.abs(a.now - a.was) || a.seed - b.seed)
                .slice(0, top);
            moved.push(row);
        } else steady.push(row);
    }
    return { pairs: shared.length, moved, steady, appeared, gone };
}
