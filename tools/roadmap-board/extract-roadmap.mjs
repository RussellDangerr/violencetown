// extract-roadmap.mjs — plans/roadmap-2026-09.md tables -> cards.json
//
// The board is seeded from this output, so the markdown stays the committed
// record and the board is a view of it. Lanes are the numbered sections; each
// table row is a card. Run: node tools/roadmap-board/extract-roadmap.mjs
//
// Pure: extractCards(markdown) -> cards[]. The file I/O is at the bottom.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const LANE_FOR_SECTION = {
    '1': 'now', '2': 'rulings', '3': 'ready', '4': 'design', '5': 'later', '6': 'done',
};

// Lane -> the card kind the page colours by. Rulings are their own kind.
const KIND_FOR_LANE = {
    now: 'build', rulings: 'ruling', ready: 'build', design: 'design', later: 'later', done: 'done',
};

const strip = s => s
    .replace(/\*\*/g, '')          // bold
    .replace(/(^|[^`])\*(?!\*)/g, '$1')  // stray single asterisks
    .replace(/<br\s*\/?>/g, ' ')
    .trim();

const slug = s => strip(s)
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

// A ruling row leads with a short code in bold: "**A1**", "**Z2**", "**AU**".
const RULING_ID = /^\*{0,2}([A-Z]{1,2}\d?)\*{0,2}$/;

function parseBlockedBy(cell) {
    const s = strip(cell);
    if (!s || /^nothing$/i.test(s)) return [];
    // "**A1, A4**" or "A1, A4" -> ids. Ignore prose like "needs 0".
    return s.split(/[,/]/).map(x => x.trim()).filter(x => RULING_ID.test(x) || /^[A-Z]\d$/.test(x))
        .map(x => x.replace(/\*/g, ''));
}

function splitRow(line) {
    // "| a | b | c |" -> ["a","b","c"], tolerating escaped pipes inside code spans.
    const cells = [];
    let cur = '', inCode = false;
    for (let i = 1; i < line.length; i++) {
        const ch = line[i];
        if (ch === '`') inCode = !inCode;
        if (ch === '|' && !inCode) { cells.push(cur); cur = ''; continue; }
        cur += ch;
    }
    return cells.map(c => c.trim()).filter((_, i, a) => !(i === a.length - 1 && a[i] === ''));
}

export function extractCards(markdown) {
    const lines = markdown.split(/\r?\n/);
    const cards = [];
    let lane = null, header = null, orderInLane = {};

    for (const raw of lines) {
        const line = raw.trimEnd();
        const sec = line.match(/^## (\d)\./);
        if (sec) { lane = LANE_FOR_SECTION[sec[1]] ?? null; header = null; continue; }
        if (!lane || !line.startsWith('|')) { if (!line.startsWith('|')) header = null; continue; }

        const cells = splitRow(line);
        if (cells.every(c => /^:?-+:?$/.test(c))) continue;          // the |---| separator
        if (!header) { header = cells.map(h => strip(h).toLowerCase()); continue; }

        const col = name => {
            const i = header.findIndex(h => h.includes(name));
            return i >= 0 ? (cells[i] ?? '') : '';
        };

        // Which column is the title depends on the table. Rulings: "#" then "ruling".
        // NOW/READY/DESIGN/LATER: "item" or "thread". DONE: "item".
        const idCell = col('#');
        const titleCell = col('ruling') || col('item') || col('thread') || cells[0];
        // Rulings carry their code in a `#` column. READY/DESIGN rows carry it
        // at the head of the title — "B1 — first real boss" — because those
        // tables have no `#` column. Either way the code is the id, so a
        // `Blocked by` cell naming "B1" resolves to that card.
        const TITLE_CODE = /^([A-Z]{1,2}\d?)\s+—\s/;
        const fromCol   = strip(idCell).match(RULING_ID);
        const fromTitle = strip(titleCell).match(TITLE_CODE);
        const id = fromCol ? fromCol[1] : fromTitle ? fromTitle[1] : slug(titleCell);
        if (!id) continue;

        orderInLane[lane] = (orderInLane[lane] ?? 0) + 10;
        cards.push({
            id,
            title: strip(titleCell).replace(/\.$/, ''),
            lane,
            order: orderInLane[lane],
            kind: KIND_FOR_LANE[lane],
            size: strip(col('size')).replace(/[^SML–\-]/g, '').slice(0, 3),
            blockedBy: parseBlockedBy(col('blocked by')),
            doc: strip(col('doc') || col('source') || col('where') || col('shipped as')),
            note: strip(col('state') || col('what it gates') || col('one line') || col('open questions') || col('shipped as') || ''),
        });
    }
    return cards;
}

// CLI: regenerate cards.json beside this file.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const here = dirname(fileURLToPath(import.meta.url));
    const md = readFileSync(join(here, '..', '..', 'plans', 'roadmap-2026-09.md'), 'utf8');
    const cards = extractCards(md);
    writeFileSync(join(here, 'cards.json'), JSON.stringify(cards, null, 2) + '\n');
    console.log(`wrote ${cards.length} cards to cards.json`);
}
