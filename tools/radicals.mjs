// tools/radicals.mjs — build maps out of hand-made pieces; game/*-map.json stays the truth.
// Spec: plans/map-radicals.md.
//
//   node tools/radicals.mjs check                                  every radical, against the rules
//   node tools/radicals.mjs place <zone>/<name> <map> <x> <y> [--dry-run]
//
// A radical is game/radicals/<zone>/<name>.json: a map cut down to tiles (null =
// keep the map's tile), the props and examinables that belong to the piece, named
// marks and edge sockets. Placing one stamps it into the map JSON surgically, the
// way tools/tiled.mjs export does: only tiles, the appended lists and _radicals
// change. The runtime never reads a radical.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE_BY_ID } from '../game/data.js';
import { TILE_SPRITE_MAP, TOWN_TILE_SPRITE_MAP, ZONE_TILE_SPRITE_MAP, PROP_SPRITES } from '../game/sprites.js';
import { SLOTS } from '../game/slots.js';
import { parseSpans } from './tiled.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAME = join(ROOT, 'game');
export const RADICALS = join(GAME, 'radicals');

// What a radical may carry, positioned relative to its top-left.
export const CARRIED = ['props', 'examinables'];
// Map objects a wall may never land on. Anchors are left out: an anchor sits on
// the thing you climb, which is solid.
const BLOCKERS = ['enemies', 'items', 'containers', 'transitions'];

const tileRef = id => TILE_SPRITE_MAP[id] || TOWN_TILE_SPRITE_MAP[id] || ZONE_TILE_SPRITE_MAP[id];
const isQuad = id => !!tileRef(id)?.quad;
const walkableTile = id => !!TILE_BY_ID[id]?.walkable;
const solidProp = p => p.solid !== false;

// The slot ids the spine's beat table names (`canyon.npc` lives there before it
// lives in SLOTS).
export function spineSlotIds(text = readFileSync(join(ROOT, 'plans', 'spine.md'), 'utf8')) {
    return new Set([...text.matchAll(/`([a-z]+\.[a-z0-9]+)`/g)].map(m => m[1]));
}

// A socket is a strip one cell thick along one edge. Its side is where it opens.
export function socketSide(s, W, H) {
    const along = [];
    if (s.h === 1 && s.y === 0) along.push('n');
    if (s.h === 1 && s.y === H - 1) along.push('s');
    if (s.w === 1 && s.x === 0) along.push('w');
    if (s.w === 1 && s.x === W - 1) along.push('e');
    return along.length === 1 ? along[0] : null;
}
const OUT = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const cellsOf = s => {
    const out = [];
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) out.push([x, y]);
    return out;
};

// Everything wrong with one radical, as readable lines. Empty means it is fine.
export function radicalProblems(r, { slotIds = new Set([...Object.keys(SLOTS), ...spineSlotIds()]) } = {}) {
    const p = [];
    const W = r.width, H = r.height;
    if (!Number.isInteger(W) || !Number.isInteger(H) || W < 1 || H < 1) return ['width and height must be whole numbers above zero'];
    if (!Array.isArray(r.tiles) || r.tiles.length !== W * H) return [`tiles must hold ${W * H} cells (${W}x${H})`];
    if (typeof r.note !== 'string' || !r.note.trim()) p.push('no note saying what the piece is');
    const at = (x, y) => r.tiles[y * W + x];
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    r.tiles.forEach((id, n) => {
        if (id !== null && !TILE_BY_ID[id]) p.push(`tile (${n % W},${Math.floor(n / W)}) = ${id} is not in TILES`);
    });
    if (r.tiles.every(id => id === null)) p.push('every cell is null — the piece paints nothing');

    // Quad tiles draw by absolute parity, so the piece must keep it.
    const quads = r.tiles.map((id, n) => [id, n % W, Math.floor(n / W)]).filter(([id]) => id !== null && isQuad(id));
    if (quads.length && r.align !== 2) p.push('has 2x2 tiles but no "align": 2 — they would draw split at an odd spot');
    for (const [id, x, y] of quads) {
        const bx = x - (x & 1), by = y - (y & 1);
        const whole = [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => inside(bx + dx, by + dy) && at(bx + dx, by + dy) === id);
        if (!whole) p.push(`2x2 tile ${id} at (${x},${y}) is not a whole block on even cells`);
    }

    const solid = new Set((r.props || []).filter(solidProp).map(o => `${o.x},${o.y}`));
    const walk = (x, y) => inside(x, y) && at(x, y) !== null && walkableTile(at(x, y)) && !solid.has(`${x},${y}`);
    for (const key of CARRIED) for (const o of r[key] || []) {
        if (!inside(o.x, o.y)) p.push(`${key} ${o.id || o.type} at (${o.x},${o.y}) is outside the piece`);
    }
    for (const o of r.props || []) if (!PROP_SPRITES[o.type]) p.push(`prop ${o.type} has no PROP_SPRITES entry — it would draw nothing`);
    // Tile 19 is the Town car: bumping one runs main.js _interactCar anywhere.
    if (r.tiles.includes(19)) p.push('uses the CAR tile (19), whose bump is the Town car — use the wreckedCar prop');
    for (const key of Object.keys(r)) {
        if (Array.isArray(r[key]) && !['tiles', 'marks', 'sockets', ...CARRIED].includes(key)) {
            p.push(`"${key}" can't travel with a piece — it belongs in the map`);
        }
    }
    const markIds = new Set();
    for (const m of r.marks || []) {
        if (markIds.has(m.id)) p.push(`two marks named ${m.id}`);
        markIds.add(m.id);
        // A mark stands on open ground, or on a prop the piece carries (the rock an anchor hooks).
        const onProp = (r.props || []).some(o => o.x === m.x && o.y === m.y);
        if (!walk(m.x, m.y) && !onProp) p.push(`mark ${m.id} at (${m.x},${m.y}) is neither on a walkable cell nor on a prop of the piece`);
        if (m.slot && !slotIds.has(m.slot)) p.push(`mark ${m.id} names slot ${m.slot}, which is neither in SLOTS nor in spine.md`);
    }
    for (const s of r.sockets || []) {
        const side = socketSide(s, W, H);
        const label = `socket at (${s.x},${s.y}) ${s.w}x${s.h}`;
        if (!side) { p.push(`${label} is not a strip along exactly one edge`); continue; }
        if (cellsOf(s).some(([x, y]) => !walk(x, y))) p.push(`${label} is not walkable all along`);
    }
    return p;
}

// Every radical on disk, as { name, file, data }.
export function listRadicals(dir = RADICALS) {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const zone of readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory())) {
        for (const f of readdirSync(join(dir, zone.name)).filter(f => f.endsWith('.json')).sort()) {
            const file = join(dir, zone.name, f);
            out.push({ name: `${zone.name}/${f.replace(/\.json$/, '')}`, file, data: JSON.parse(readFileSync(file, 'utf8')) });
        }
    }
    return out;
}

// One line of JSON in the maps' spaced style: {"type": "x", "x": 1}.
export const oneLine = v => Array.isArray(v) ? `[${v.map(oneLine).join(', ')}]`
    : v && typeof v === 'object' ? `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${oneLine(x)}`).join(', ')}}`
        : JSON.stringify(v);

const indentAt = (text, pos) => text.slice(text.lastIndexOf('\n', pos - 1) + 1).match(/^[ \t]*/)[0];
const sameObject = (a, b) => oneLine(a) === oneLine(b);

// Stamp radical `r` (named `name`) into the map text with its top-left at (ox, oy).
// Returns { errors, report, text }; on any error the text is unchanged.
export function placeRadical(mapText, r, name, ox, oy) {
    const m = JSON.parse(mapText);
    const errors = [], report = [];
    const fail = () => ({ errors, report, text: mapText });
    const W = r.width, H = r.height;
    const problems = radicalProblems(r);
    if (problems.length) return { errors: problems.map(x => `${name}: ${x}`), report, text: mapText };
    if (!Number.isInteger(ox) || !Number.isInteger(oy)) { errors.push('x and y must be whole numbers'); return fail(); }
    if (r.align && (ox % r.align || oy % r.align)) {
        errors.push(`${name} has "align": ${r.align} — place it where x and y are multiples of ${r.align}`);
        return fail();
    }
    const list = a => a.slice(0, 12).join(' ') + (a.length > 12 ? ` …(+${a.length - 12})` : '');

    // Off the map.
    const off = [];
    r.tiles.forEach((id, n) => {
        const x = ox + n % W, y = oy + Math.floor(n / W);
        if (id !== null && (x < 0 || y < 0 || x >= m.width || y >= m.height)) off.push(`(${x},${y})`);
    });
    if (off.length) errors.push(`runs off the ${m.width}x${m.height} map at ${list(off)}`);
    if (errors.length) return fail();

    // The map after the stamp, and what blocks a cell in it.
    const tiles = m.tiles.slice();
    r.tiles.forEach((id, n) => { if (id !== null) tiles[(oy + Math.floor(n / W)) * m.width + ox + n % W] = id; });
    const moved = o => ({ ...o, x: o.x + ox, y: o.y + oy });
    const newProps = (r.props || []).map(moved);
    const solid = new Set([...(m.props || []), ...newProps].filter(solidProp).map(o => `${o.x},${o.y}`));
    const blocked = (x, y) => !walkableTile(tiles[y * m.width + x]) || solid.has(`${x},${y}`);

    // A wall on something that has to stand there.
    const buried = [];
    const things = BLOCKERS.flatMap(k => (m[k] || []).map(o => [k, o]));
    if (m.spawn) things.push(['spawn', m.spawn]);
    for (const [k, o] of things) {
        const lx = o.x - ox, ly = o.y - oy;
        if (lx < 0 || ly < 0 || lx >= W || ly >= H) continue;
        if (blocked(o.x, o.y)) buried.push(`${k} ${o.id || o.name || o.toMap || ''} at (${o.x},${o.y})`.replace(/ +/g, ' '));
    }
    if (buried.length) errors.push(`would wall in: ${buried.join('; ')}`);

    // A socket that opens onto rock.
    for (const s of r.sockets || []) {
        const side = socketSide(s, W, H);
        const [dx, dy] = OUT[side];
        const dead = cellsOf(s).map(([x, y]) => [ox + x + dx, oy + y + dy])
            .filter(([x, y]) => x < 0 || y < 0 || x >= m.width || y >= m.height || blocked(x, y))
            .map(([x, y]) => `(${x},${y})`);
        if (dead.length) errors.push(`the ${side} socket opens onto rock or off the map at ${list(dead)}`);
    }

    // Carried objects: an examinable id must be new, or the same one already here.
    const add = { props: [], examinables: [] };
    for (const o of newProps) {
        if (!(m.props || []).some(p => sameObject(p, o))) add.props.push(o);
    }
    for (const o of (r.examinables || []).map(moved)) {
        const had = (m.examinables || []).find(e => e.id === o.id);
        if (!had) add.examinables.push(o);
        else if (!sameObject(had, o)) errors.push(`examinable ${o.id} is already on the map, at (${had.x},${had.y}) — move or remove that one first`);
    }
    if (errors.length) return fail();

    for (const mk of r.marks || []) report.push(`mark ${mk.id}${mk.slot ? ` (${mk.slot})` : ''} at (${mk.x + ox},${mk.y + oy})`);
    for (const s of r.sockets || []) report.push(`${socketSide(s, W, H)} socket at (${s.x + ox},${s.y + oy}) ${s.w}x${s.h}`);

    // Surgical edits, applied back to front.
    const root = parseSpans(mapText);
    const top = root.entries;
    const eol = mapText.includes('\r\n') ? '\r\n' : '\n';
    const edits = [];
    const changed = tiles.filter((t, n) => t !== m.tiles[n]).length;
    if (changed) {
        const node = top.get('tiles');
        const indent = indentAt(mapText, node.start);
        const rows = [];
        for (let y = 0; y < m.height; y++) rows.push(indent + indent + tiles.slice(y * m.width, (y + 1) * m.width).join(','));
        edits.push([node.start, node.end, `[${eol}${rows.join(',' + eol)}${eol}${indent}]`]);
        report.unshift(`${changed} tile${changed === 1 ? '' : 's'} changed`);
    }
    const record = { name, x: ox, y: oy };
    if (!(m._radicals || []).some(e => sameObject(e, record))) add._radicals = [record];

    const missing = [];
    for (const [key, objs] of Object.entries(add)) {
        if (!objs.length) continue;
        report.push(`${key}: +${objs.length}`);
        const node = top.get(key);
        if (!node) { missing.push([key, objs]); continue; }
        const keyIndent = indentAt(mapText, node.start);
        if (!node.items.length) {
            const inner = keyIndent + keyIndent;
            edits.push([node.start, node.end, `[${eol}${objs.map(o => inner + oneLine(o)).join(',' + eol)}${eol}${keyIndent}]`]);
            continue;
        }
        const last = node.items[node.items.length - 1];
        const multiline = mapText.slice(node.start, node.items[0].start).includes('\n');
        const sep = multiline ? `,${eol}${indentAt(mapText, last.start)}` : ', ';
        edits.push([last.end, last.end, objs.map(o => sep + oneLine(o)).join('')]);
    }
    if (missing.length) {
        const entries = [...top.values()];
        const last = entries[entries.length - 1];
        const keyIndent = indentAt(mapText, last.start);   // a value starts on its key's line
        const inner = keyIndent + keyIndent;
        const block = missing.map(([key, objs]) =>
            `,${eol}${keyIndent}${JSON.stringify(key)}: [${eol}${objs.map(o => inner + oneLine(o)).join(',' + eol)}${eol}${keyIndent}]`).join('');
        edits.push([last.end, last.end, block]);
    }
    edits.sort((a, b) => b[0] - a[0]);
    let text = mapText;
    for (const [s, e, rep] of edits) text = text.slice(0, s) + rep + text.slice(e);
    return { errors, report, text };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main([cmd, ...args]) {
    if (cmd === 'check') {
        const all = listRadicals();
        let bad = 0;
        for (const { name, data } of all) {
            const p = radicalProblems(data);
            if (p.length) { bad++; for (const x of p) console.error(`${name}: ${x}`); }
        }
        console.log(`check: ${all.length} radical${all.length === 1 ? '' : 's'}, ${bad} with problems.`);
        if (bad) process.exitCode = 1;
        return;
    }
    if (cmd === 'place') {
        const [name, mapArg, xs, ys] = args.filter(a => !a.startsWith('--'));
        const dry = args.includes('--dry-run');
        if (!name || !mapArg || xs == null || ys == null) throw new Error('usage: place <zone>/<name> <map> <x> <y> [--dry-run]');
        const file = join(RADICALS, `${name}.json`);
        if (!existsSync(file)) throw new Error(`No radical at ${relative(ROOT, file)}`);
        const map = mapArg.replace(/\.json$/, '').replace(/-map$/, '');
        const json = join(GAME, `${map}-map.json`);
        if (!existsSync(json)) throw new Error(`No map at game/${map}-map.json`);
        const before = readFileSync(json, 'utf8');
        const { errors, report, text } = placeRadical(before, JSON.parse(readFileSync(file, 'utf8')), name, Number(xs), Number(ys));
        if (errors.length) {
            for (const e of errors) console.error(`error: ${e}`);
            console.error('place: nothing written.');
            process.exitCode = 1;
            return;
        }
        for (const line of report) console.log(`  ${line}`);
        if (text === before) return console.log(`place: ${name} is already there — no changes.`);
        if (dry) return console.log('place: dry run — nothing written.');
        writeFileSync(json, text);
        console.log(`place: wrote game/${map}-map.json — now run npm test.`);
        return;
    }
    console.log('usage: node tools/radicals.mjs check | place <zone>/<name> <map> <x> <y> [--dry-run]');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
