// next-slice.mjs — ask the board what the loop builds next.
//
//   node tools/roadmap-board/next-slice.mjs <dump-dir>
//
// <dump-dir> holds one JSON file per card: an ArtifactData `list` of
// collection `cards` with `out_dir` set (use a FRESH directory each run — a
// list only overwrites the ids it returns, so stale files from an older dump
// would count as cards). Prints nextSlice()'s answer as JSON:
//   { reason: 'ok' | 'wip-cap' | 'nothing-pickable', wip, pick, skipped }

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nextSlice } from './board-model.js';

const dir = process.argv[2] && resolve(process.argv[2]);
if (!dir) { console.error('usage: node next-slice.mjs <dump-dir>'); process.exit(2); }

const cards = readdirSync(dir).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .map(o => o.data ?? o);
const r = nextSlice(cards);
console.log(JSON.stringify({ ...r, pick: r.pick ?? null }, null, 2));
