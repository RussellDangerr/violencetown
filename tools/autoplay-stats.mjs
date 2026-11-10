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
