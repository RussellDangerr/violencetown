// next-slice.mjs — ask the board what the loop builds next.
//
//   node tools/roadmap-board/next-slice.mjs <dump-dir> [--strict]
//
// <dump-dir> holds one JSON file per card: an ArtifactData `list` of
// collection `cards` with `out_dir` set (use a FRESH directory each run — a
// list only overwrites the ids it returns, so stale files from an older dump
// would count as cards). Prints nextSlices()'s answer as JSON:
//   { reason: 'ok' | 'wip-cap' | 'nothing-pickable', wip, doing, review, pick, picks,
//     skipped, openRulings, idleWait }
// Each pick goes to its own builder; `pick` is the first. A file takes one slice
// in flight at a time, except the big ones in SHARED_FILES (main.js, renderer.js),
// which take several (plans/loop-shared-file-picks.md); run stack-check.mjs before
// a slice moves to Review. --strict goes back to one slice per file everywhere.
// `openRulings` is the count that pauses the loop's own tweaks (LOOP.md §5);
// `idleWait` is the seconds an idle pass sleeps (LOOP.md §7).

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nextSlices, SHARED_FILES, openRulings, idleWait } from './board-model.js';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const dirArg = args.find(a => !a.startsWith('--'));
const dir = dirArg && resolve(dirArg);
if (!dir) { console.error('usage: node next-slice.mjs <dump-dir> [--strict]'); process.exit(2); }

const cards = readdirSync(dir).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .map(o => o.data ?? o);
const r = nextSlices(cards, { shared: strict ? {} : SHARED_FILES });
console.log(JSON.stringify({
    ...r, pick: r.picks[0] ?? null,
    openRulings: openRulings(cards).length, idleWait: idleWait(cards, Date.now()),
}, null, 2));
