#!/usr/bin/env node
// spirit-harvest.mjs — the heroic spirits' harvest (plans/heroic-spirits.md, slice 2).
//
//   node tools/spirit-harvest.mjs [--seeds=1-50] [--scripts=quest,sneak,loops,caster] [--per-hero=3] [--workers=8]
//
// Plays every hero's script over the sim baseline's seeds, the way the sim does,
// and writes tools/autoplay-sim-spirits.json beside the baseline:
//   - every attempt's outcome, one short row per seed (the montage and the stats)
//   - a few curated spirits per hero with their tracks, the failures first (rule 5)
//   - each kept spirit's provenance: the hash of every zone map it walked
//   - the hash of the sim baseline the set was harvested against (rule 4)
// The harvest only reads runs: it changes no golden and no baseline. Run it
// again whenever `npm run sim:write` re-records the baseline; a test fails
// until it is.
// Exit: 0 written · 1 a run broke · 3 no Chrome.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playAll, parseSeeds } from './autoplay-runs.mjs';
import { HEROES, hashJson, zonesOf, curate, attemptOf, describeRow } from '../game/spirits.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..', 'game');
const BASELINE = path.join(HERE, 'autoplay-sim-baseline.json');
const OUT = path.join(HERE, 'autoplay-sim-spirits.json');

const o = { seeds: null, scripts: Object.keys(HEROES), perHero: 3, workers: Math.max(1, Math.min(8, Math.floor(cpus().length / 2))), timeout: 180000 };
for (const a of process.argv.slice(2)) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'seeds') o.seeds = parseSeeds(v);
    else if (k === 'scripts') o.scripts = v.split(',').filter(Boolean);
    else if (k === 'per-hero') o.perHero = Number(v);
    else if (k === 'workers' || k === 'timeout') o[k] = Number(v);
    else throw new Error(`unknown option ${a}`);
}
if (!existsSync(BASELINE)) { console.error('spirit-harvest: no sim baseline; run npm run sim:write first'); process.exit(1); }
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const [from, to] = o.seeds ?? baseline.seeds;
const jobs = o.scripts.flatMap((script) => Array.from({ length: to - from + 1 }, (_, i) => ({ script, seed: from + i })));
console.log(`spirit-harvest: ${o.scripts.map((s) => `${HEROES[s]} (${s})`).join(', ')} on seeds ${from}-${to} (${jobs.length} runs, ${o.workers} at a time)`);

const results = (await playAll(jobs, o.workers, o.timeout, 'spirit-harvest')).sort((a, b) => a.seed - b.seed);

// The hash of a zone's map file, parsed, so line endings never move it.
const mapHashes = {};
const hashOfZone = (z) => {
    if (!(z in mapHashes)) {
        const file = path.join(GAME, `${z}-map.json`);
        mapHashes[z] = existsSync(file) ? hashJson(JSON.parse(readFileSync(file, 'utf8'))) : null;
    }
    return mapHashes[z];
};

const broken = results.filter((r) => r.broken).map((r) => ({ script: r.script, seed: r.seed, why: r.broken }));
const spirits = results.filter((r) => !r.broken && r.report.spirit).map((r) => {
    const s = r.report.spirit;
    return { ...s, provenance: { ...s.provenance, baseline: hashJson(baseline), maps: Object.fromEntries(zonesOf(s.track).map((z) => [z, hashOfZone(z)])) } };
});
const attempts = Object.fromEntries(o.scripts.map((script) => [script, spirits.filter((s) => s.provenance.script === script).map(attemptOf)]));
const kept = curate(spirits, o.perHero);

const set = {
    v: 1,
    baseline: hashJson(baseline),
    seeds: [from, to],
    version: spirits[0]?.provenance.version ?? null,
    heroes: Object.fromEntries(o.scripts.map((s) => [s, HEROES[s]])),
    broken,
    attempts,
    spirits: kept,
};
// One attempt list and one spirit per line, so a re-harvest diffs by hero and seed.
const lines = [
    '{',
    ...['v', 'baseline', 'seeds', 'version', 'heroes', 'broken'].map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(set[k])},`),
    '  "attempts": {',
    Object.entries(attempts).map(([k, v]) => `    ${JSON.stringify(k)}: [\n${v.map((a) => `      ${JSON.stringify(a)}`).join(',\n')}\n    ]`).join(',\n'),
    '  },',
    '  "spirits": [',
    kept.map((s) => `    ${JSON.stringify(s)}`).join(',\n'),
    '  ]',
    '}',
];
writeFileSync(OUT, lines.join('\n') + '\n');
JSON.parse(readFileSync(OUT, 'utf8'));   // the hand-built layout is still JSON

for (const script of o.scripts) {
    const all = attempts[script];
    const cleared = all.filter((a) => a.cleared).length;
    console.log(`\n${HEROES[script]} (${script}): ${all.length} attempts · cleared ${cleared} · ${broken.filter((b) => b.script === script).length} broken`);
    const endings = {};
    for (const a of all) endings[a.ending] = (endings[a.ending] || 0) + 1;
    for (const [e, n] of Object.entries(endings).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${e}`);
    for (const s of kept.filter((k) => k.provenance.script === script)) {
        const lastFall = [...s.track].reverse().find((r) => r.act === 'fell');
        console.log(`  kept seed ${s.attempt}: ${attemptOf(s).ending} (${s.track.length} rows)${lastFall ? ` · last fall ${describeRow(lastFall)}` : ''}`);
    }
}
for (const b of broken) console.log(`BROKEN ${b.script} seed ${b.seed}: ${b.why}`);
console.log(`\nwrote ${path.relative(process.cwd(), OUT)} (${Math.round(readFileSync(OUT).length / 1024)} KB)`);
process.exit(broken.length ? 1 : 0);
