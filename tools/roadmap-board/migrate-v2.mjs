// migrate-v2.mjs — the one-time move from the roadmap-seeded board to the
// ticket board (plans/ticket-board.md §3). After this runs, the db is the
// record and extract-roadmap.mjs is not run again.
//
// It writes nothing to the store itself. It turns cards.json into one JSON
// file per card in the new model, compares them with a live dump, and prints
// the ArtifactData batches to send (pinned with the live versions):
//
//   node tools/roadmap-board/migrate-v2.mjs <live-dump-dir> <versions.txt> <out-dir>
//
// <live-dump-dir> is an ArtifactData `list` of `cards` saved with out_dir;
// <versions.txt> is "<id> <version>" per line, copied from that listing (the
// saved files hold data only). Batches are written to <out-dir>/batch-N.json.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { migrateCard } from './board-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const [dumpDir, versionsFile, outDir] = process.argv.slice(2).map(p => p && resolve(p));
if (!dumpDir || !versionsFile || !outDir) {
    console.error('usage: node migrate-v2.mjs <live-dump-dir> <versions.txt> <out-dir>');
    process.exit(2);
}

const seed = JSON.parse(readFileSync(join(here, 'cards.json'), 'utf8')).map(migrateCard);
const live = Object.fromEntries(readdirSync(dumpDir).filter(f => f.endsWith('.json'))
    .map(f => [f.slice(0, -5), JSON.parse(readFileSync(join(dumpDir, f), 'utf8'))]));
const versions = Object.fromEntries(readFileSync(versionsFile, 'utf8').split(/\r?\n/)
    .filter(Boolean).map(l => l.trim().split(/\s+/)).map(([id, v]) => [id, Number(v)]));

const ids = seed.map(c => c.id);
const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dups.length) { console.error(`duplicate ids in cards.json: ${dups.join(', ')}`); process.exit(1); }
const known = new Set(ids);
const dangling = seed.flatMap(c => (c.blockedBy ?? []).filter(b => !known.has(b)).map(b => `${c.id} -> ${b}`));

const cardsDir = join(outDir, 'cards'); mkdirSync(cardsDir, { recursive: true });
const writes = [];
for (const c of seed) {
    const file = join(cardsDir, `${c.id}.json`);
    writeFileSync(file, JSON.stringify(c, null, 2));
    const pin = live[c.id] ? versions[c.id] : undefined;
    if (live[c.id] && !pin) { console.error(`no version for live card ${c.id}`); process.exit(1); }
    writes.push({ op: 'set', collection: 'cards', doc_id: c.id, file_path: file, ...(pin ? { if_version: pin } : {}) });
}
const removed = Object.keys(live).filter(id => !known.has(id));
for (const id of removed) writes.push({ op: 'delete', collection: 'cards', doc_id: id, if_version: versions[id] });

const batches = [];
for (let i = 0; i < writes.length; i += 50) batches.push(writes.slice(i, i + 50));
batches.forEach((b, i) => writeFileSync(join(outDir, `batch-${i + 1}.json`), JSON.stringify(b, null, 1)));

const lanes = {};
for (const c of seed) lanes[c.lane] = (lanes[c.lane] ?? 0) + 1;
console.log(JSON.stringify({
    cards: seed.length, new: seed.filter(c => !live[c.id]).length, removed, dangling, lanes,
    batches: batches.map(b => b.length),
}, null, 1));
