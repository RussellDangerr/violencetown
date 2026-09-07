// export-board.mjs — the board's live state, back into markdown.
//
// The board is the working view; plans/roadmap-2026-09.md is the committed
// record. Dragging a card changes the store, not the markdown, so without this
// the two drift. Run it after moving cards, diff the output against the
// roadmap by eye, and paste what you want to keep.
//
// It deliberately PRINTS rather than overwriting the roadmap: that file carries
// prose, a Mermaid graph and section commentary the board does not model, and a
// machine rewrite would flatten all of it. The human stays in the loop.
//
// Feed it with:
//   Artifact read_db, db_op "list", collection "cards",
//   out_dir tools/roadmap-board/dist/db
// then:  node tools/roadmap-board/export-board.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LANES, byLane } from './board-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const DUMP = join(here, 'dist', 'db', 'cards');

export function loadDump(dir) {
    if (!existsSync(dir)) {
        throw new Error(`no dump at ${dir} — run Artifact read_db with out_dir first (see the header of this file)`);
    }
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    if (!files.length) throw new Error(`dump at ${dir} is empty`);
    // The files contain card data directly (or wrapped in {id, data, ...})
    // Handle both formats: if file has .data field, unwrap it; else use the whole object
    return files.map(f => {
        const obj = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        return obj.data ?? obj;
    });
}

// A markdown table cell cannot contain a raw pipe or newline.
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();

export function toMarkdown(cards) {
    const lanes = byLane(cards);
    const out = [];
    for (const lane of LANES) {
        const rows = lanes[lane.id] ?? [];
        out.push(`## ${lane.label} — ${rows.length} card${rows.length === 1 ? '' : 's'}`, '');
        if (!rows.length) { out.push('_(empty)_', ''); continue; }
        out.push('| # | Item | Size | Blocked by | Doc |', '|---|---|---|---|---|');
        for (const c of rows) {
            out.push(`| ${cell(c.id)} | **${cell(c.title)}** | ${cell(c.size)} | ${c.blockedBy?.length ? cell(c.blockedBy.join(', ')) : 'nothing'} | ${cell(c.doc)} |`);
        }
        out.push('');
    }
    return out.join('\n');
}

// Cards whose lane differs from the seed the markdown was built from.
export function movedSince(dumpCards, seedCards) {
    const seed = Object.fromEntries(seedCards.map(c => [c.id, c]));
    const moved = [];
    for (const c of dumpCards) {
        const was = seed[c.id];
        if (!was) { moved.push(`+ ${c.id} — new on the board, not in the seed (lane: ${c.lane})`); continue; }
        if (was.lane !== c.lane) moved.push(`~ ${c.id} — ${was.lane} → ${c.lane}`);
    }
    for (const c of seedCards) if (!dumpCards.some(d => d.id === c.id)) moved.push(`- ${c.id} — in the seed, gone from the board`);
    return moved;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const cards = loadDump(DUMP);
    const seed = JSON.parse(readFileSync(join(here, 'cards.json'), 'utf8'));
    const moved = movedSince(cards, seed);
    console.log(`<!-- ${cards.length} cards from the board, ${new Date().toISOString()} -->`);
    console.log(moved.length
        ? `<!-- CHANGED SINCE THE SEED:\n${moved.map(m => '     ' + m).join('\n')}\n-->`
        : '<!-- no lane changes since the seed -->');
    console.log('');
    console.log(toMarkdown(cards));
}
