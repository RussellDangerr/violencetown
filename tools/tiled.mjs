// tools/tiled.mjs — paint maps in Tiled; game/*-map.json stays the only truth.
// Spec: plans/tiled-pipeline.md.
//
//   node tools/tiled.mjs tileset                 tiled/violencetown.tsx + .png
//   node tools/tiled.mjs import <map> [--force]  game/<map>-map.json -> tiled/<map>.tmj
//   node tools/tiled.mjs export <map>            tiled/<map>.tmj -> game/<map>-map.json
//
// <map> may also be radical:<zone>/<name> (plans/map-radicals.md): a piece in
// game/radicals/, painted the same way. Its empty cells are null — "keep the
// map's tile" — so export keeps them instead of refusing.
//
// Tiled tile N is game tile id N (gid N+1). Export is surgical: it rewrites only
// the tiles array, width/height, and the coordinates of objects that moved, so
// every other byte of the map file survives (the maps use three JSON styles).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE_BY_ID } from '../game/data.js';
import { SHEETS, TILE_SPRITE_MAP, TOWN_TILE_SPRITE_MAP, ZONE_TILE_SPRITE_MAP } from '../game/sprites.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAME = join(ROOT, 'game');
const OUT = join(ROOT, 'tiled');
const relPath = p => relative(ROOT, p).replace(/\\/g, '/');
const PX = 16;
const TILESET = 'violencetown';
const COLUMNS = 10;

// Positioned lists, drawn as one object layer each (colour = Tiled layer tint).
export const LIST_LAYERS = {
    enemies: '#e05050', items: '#e0c040', containers: '#c08040', examinables: '#40c0e0',
    props: '#a0a0a0', anchors: '#40e080', transitions: '#40e080', lights: '#ff9030',
    regions: '#a060e0', marks: '#ffe040', sockets: '#40a0ff',
};
// Lists drawn as rectangles, whose size Tiled can change.
const SIZED = new Set(['regions', 'sockets']);
export const SINGLE_LAYERS = { spawn: '#ffffff', bossRoom: '#ff40ff' };

// Same lookup as renderer.js tileRef.
const tileRef = id => TILE_SPRITE_MAP[id] || TOWN_TILE_SPRITE_MAP[id] || ZONE_TILE_SPRITE_MAP[id];

// ── A JSON parser that remembers where every value sits in the text ─────────

export function parseSpans(text) {
    let i = 0;
    const ws = () => { while (i < text.length && ' \t\r\n﻿'.includes(text[i])) i++; };
    const fail = msg => { throw new Error(`JSON at ${i}: ${msg}`); };
    const str = () => {
        const start = i++;
        while (text[i] !== '"') { if (text[i] === '\\') i++; i++; if (i >= text.length) fail('unterminated string'); }
        i++;
        return JSON.parse(text.slice(start, i));
    };
    const value = () => {
        ws();
        const start = i, c = text[i];
        if (c === '{') {
            i++; const entries = new Map(); ws();
            if (text[i] === '}') { i++; return { start, end: i, entries }; }
            for (;;) {
                ws(); if (text[i] !== '"') fail('expected key');
                const k = str(); ws(); if (text[i++] !== ':') fail('expected :');
                entries.set(k, value()); ws();
                if (text[i] === ',') { i++; continue; }
                if (text[i] === '}') { i++; return { start, end: i, entries }; }
                fail('expected , or }');
            }
        }
        if (c === '[') {
            i++; const items = []; ws();
            if (text[i] === ']') { i++; return { start, end: i, items }; }
            for (;;) {
                items.push(value()); ws();
                if (text[i] === ',') { i++; continue; }
                if (text[i] === ']') { i++; return { start, end: i, items }; }
                fail('expected , or ]');
            }
        }
        if (c === '"') { str(); return { start, end: i }; }
        const m = /-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null/y;
        m.lastIndex = i;
        if (!m.exec(text)) fail('unexpected character');
        i = m.lastIndex;
        return { start, end: i };
    };
    const root = value();
    ws();
    if (i !== text.length) fail('trailing content');
    return root;
}

// ── Game map -> Tiled map ────────────────────────────────────────────────────

const prop = (name, type, value) => ({ name, type, value });
const labelOf = (key, e) =>
    e.name || e.type || e.id || (e.toMap ? `-> ${e.toMap.replace('-map.json', '')}` : null) || key.replace(/s$/, '');

export function toTiled(mapText) {
    const m = JSON.parse(mapText);
    let nextObject = 1, nextLayer = 1;
    const box = (key, e, index, name) => ({
        id: nextObject++, name, x: e.x * PX, y: e.y * PX,
        width: (e.w ?? 1) * PX, height: (e.h ?? 1) * PX, rotation: 0, visible: true,
        properties: index == null ? [prop('vt_key', 'string', key)]
            : [prop('vt_key', 'string', key), prop('vt_index', 'int', index)],
    });
    const layers = [{
        id: nextLayer++, name: 'tiles', type: 'tilelayer', width: m.width, height: m.height,
        data: m.tiles.map(t => t === null ? 0 : t + 1), opacity: 1, visible: true, x: 0, y: 0,
    }];
    const group = (key, color, objects) => layers.push({
        id: nextLayer++, name: key, type: 'objectgroup', color, draworder: 'topdown',
        objects, opacity: 1, visible: true, x: 0, y: 0,
    });
    for (const [key, color] of Object.entries(LIST_LAYERS)) {
        if (Array.isArray(m[key]) && m[key].length) group(key, color, m[key].map((e, n) => box(key, e, n, labelOf(key, e))));
    }
    for (const [key, color] of Object.entries(SINGLE_LAYERS)) {
        if (m[key]) group(key, color, [box(key, m[key], null, key)]);
    }
    return {
        type: 'map', version: '1.10', tiledversion: '1.12.2', orientation: 'orthogonal',
        renderorder: 'right-down', infinite: false, compressionlevel: -1,
        width: m.width, height: m.height, tilewidth: PX, tileheight: PX,
        nextlayerid: nextLayer, nextobjectid: nextObject,
        tilesets: [{ firstgid: 1, source: `${TILESET}.tsx` }],
        layers,
    };
}

// ── Tiled map -> surgical edits to the game map ──────────────────────────────

const FLIP_BITS = 0x20000000; // any gid at or above this carries a flip/rotate flag

// A cell coordinate back from pixels. An untouched object keeps its exact
// authored value (a light at y 7.5 stays 7.5); a moved one snaps to the grid,
// or to half-cells if it was authored off-grid.
function cellOf(px, orig) {
    if (px === orig * PX) return orig;
    const v = px / PX;
    return Number.isInteger(orig) ? Math.round(v) : Math.round(v * 2) / 2;
}

export function fromTiled(mapText, tmj, { radical = false } = {}) {
    const m = JSON.parse(mapText);
    const root = parseSpans(mapText);
    const errors = [], warnings = [], changes = [], edits = [];
    const eol = mapText.includes('\r\n') ? '\r\n' : '\n';

    if (tmj.infinite) errors.push('The Tiled map is set to Infinite — make it Fixed size (Map > Map Properties).');
    if (tmj.tilewidth !== PX || tmj.tileheight !== PX) errors.push(`Tile size must be ${PX}x${PX} px.`);
    const tileLayers = (tmj.layers || []).filter(l => l.type === 'tilelayer');
    if (tileLayers.length !== 1) errors.push(`Use exactly one tile layer (found ${tileLayers.length}).`);
    const layer = tileLayers[0];
    if (layer && !Array.isArray(layer.data)) errors.push('Tile layer format must be CSV (Map > Map Properties > Tile Layer Format).');
    if (errors.length) return { errors, warnings, changes, text: mapText };

    const firstgid = tmj.tilesets?.[0]?.firstgid ?? 1;
    const W = tmj.width, H = tmj.height;
    const ids = [];
    const bad = { empty: [], flipped: [], unknown: [] };
    layer.data.forEach((gid, n) => {
        const at = `(${n % W},${Math.floor(n / W)})`;
        if (gid === 0) { if (!radical) bad.empty.push(at); return ids.push(radical ? null : 0); }
        if (gid >= FLIP_BITS) { bad.flipped.push(at); return ids.push(0); }
        const id = gid - firstgid;
        if (!TILE_BY_ID[id]) bad.unknown.push(`${at}=${id}`);
        ids.push(id);
    });
    const list = a => a.slice(0, 12).join(' ') + (a.length > 12 ? ` …(+${a.length - 12})` : '');
    if (bad.empty.length) errors.push(`Empty cells (paint every cell): ${list(bad.empty)}`);
    if (bad.flipped.length) errors.push(`Flipped/rotated tiles (the game has no flips): ${list(bad.flipped)}`);
    if (bad.unknown.length) errors.push(`Tiles that are not in data.js TILES: ${list(bad.unknown)}`);
    if (errors.length) return { errors, warnings, changes, text: mapText };

    // Size and tiles.
    const top = root.entries;
    const num = (key, v) => { if (m[key] !== v) { edits.push([top.get(key), String(v)]); changes.push(`${key} ${m[key]} -> ${v}`); } };
    num('width', W);
    num('height', H);
    const resized = W !== m.width || H !== m.height;
    const diff = resized ? ids.length : ids.filter((id, n) => id !== m.tiles[n]).length;
    if (diff) {
        const node = top.get('tiles');
        const lineStart = mapText.lastIndexOf('\n', node.start) + 1;
        const indent = mapText.slice(lineStart).match(/^[ \t]*/)[0];
        const rows = [];
        for (let y = 0; y < H; y++) rows.push(indent + indent + ids.slice(y * W, (y + 1) * W).map(String).join(','));
        edits.push([node, `[${eol}${rows.join(',' + eol)}${eol}${indent}]`]);
        changes.push(resized ? `tiles rewritten at ${W}x${H}` : `${diff} tile${diff === 1 ? '' : 's'} changed`);
    }

    // Objects: moves apply, additions and deletions are reported.
    const seen = new Set();
    for (const group of (tmj.layers || []).filter(l => l.type === 'objectgroup')) {
        for (const o of group.objects || []) {
            const props = Object.fromEntries((o.properties || []).map(p => [p.name, p.value]));
            const key = props.vt_key, index = props.vt_index;
            const single = key in SINGLE_LAYERS;
            const orig = single ? m[key] : m[key]?.[index];
            const node = single ? top.get(key) : top.get(key)?.items?.[index];
            if (!key || !orig || !node) {
                warnings.push(`New object "${o.name || '?'}" in layer "${group.name}" was NOT applied — add it in the JSON; Tiled can move it after.`);
                continue;
            }
            seen.add(single ? key : `${key}#${index}`);
            const moved = [];
            const set = (field, v) => {
                if (orig[field] === v) return;
                const at = node.entries.get(field);
                if (!at) { warnings.push(`${key}[${index}] has no "${field}" to update.`); return; }
                edits.push([at, String(v)]); moved.push(`${field} ${orig[field]} -> ${v}`);
            };
            set('x', cellOf(o.x, orig.x));
            set('y', cellOf(o.y, orig.y));
            if (SIZED.has(key)) { set('w', cellOf(o.width, orig.w)); set('h', cellOf(o.height, orig.h)); }
            if (moved.length) changes.push(`${single ? key : `${key}[${index}]`} ${labelOf(key, orig)}: ${moved.join(', ')}`);
            const nx = cellOf(o.x, orig.x), ny = cellOf(o.y, orig.y);
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) warnings.push(`${key} ${labelOf(key, orig)} is outside the map at (${nx},${ny}).`);
        }
    }
    for (const key of Object.keys(LIST_LAYERS)) {
        (m[key] || []).forEach((e, n) => {
            if (!seen.has(`${key}#${n}`)) warnings.push(`${key}[${n}] ${labelOf(key, e)} is missing in Tiled — NOT deleted from the JSON.`);
        });
    }
    for (const key of Object.keys(SINGLE_LAYERS)) {
        if (m[key] && !seen.has(key)) warnings.push(`${key} is missing in Tiled — NOT deleted from the JSON.`);
    }

    // Apply back to front so earlier spans keep their offsets.
    edits.sort((a, b) => b[0].start - a[0].start);
    let text = mapText;
    for (const [node, replacement] of edits) text = text.slice(0, node.start) + replacement + text.slice(node.end);
    return { errors, warnings, changes, text };
}

// ── Tileset ──────────────────────────────────────────────────────────────────

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// What to paint for one tile id, bottom layer first: flat colours and sheet crops.
function paintLayers(id) {
    const def = TILE_BY_ID[id];
    const ref = tileRef(id);
    if (!ref) return [{ fill: def.fallbackColor }];
    const crop = r => {
        const cell = r.quad ? r.quad[0] : r;
        const sheet = SHEETS[cell.sheet];
        const pad = sheet.padding || 0;
        return cell.region
            ? { src: join(GAME, sheet.src), x: cell.x, y: cell.y, w: cell.w, h: cell.h }
            : { src: join(GAME, sheet.src), x: cell.col * (sheet.frameW + pad), y: cell.row * (sheet.frameH + pad), w: sheet.frameW, h: sheet.frameH };
    };
    const layers = [];
    if (ref.under === 'fill') layers.push({ fill: def.fallbackColor });
    else if (ref.under != null) layers.push(...paintLayers(ref.under));
    layers.push(crop(ref));
    return layers;
}

export function buildTileset() {
    const maxId = Math.max(...Object.keys(TILE_BY_ID).map(Number));
    const count = Math.ceil((maxId + 1) / COLUMNS) * COLUMNS;
    const rows = count / COLUMNS;
    const recipe = { out: join(OUT, `${TILESET}.png`), size: PX, columns: COLUMNS, rows, tiles: [] };
    const tsxTiles = [];
    for (let id = 0; id <= maxId; id++) {
        const def = TILE_BY_ID[id];
        if (!def) continue;
        recipe.tiles.push({ id, layers: paintLayers(id) });
        const props = [`   <property name="name" value="${esc(def.name)}"/>`,
            `   <property name="walkable" type="bool" value="${def.walkable}"/>`];
        if (def.hazard) props.push(`   <property name="hazard" value="${esc(def.hazard)}"/>`);
        tsxTiles.push(` <tile id="${id}">\n  <properties>\n${props.join('\n')}\n  </properties>\n </tile>`);
    }
    const tsx = `<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.12.2" name="${TILESET}" tilewidth="${PX}" tileheight="${PX}" tilecount="${count}" columns="${COLUMNS}">
 <image source="${TILESET}.png" width="${COLUMNS * PX}" height="${rows * PX}"/>
${tsxTiles.join('\n')}
</tileset>
`;
    return { recipe, tsx };
}

function writeTileset() {
    mkdirSync(OUT, { recursive: true });
    const { recipe, tsx } = buildTileset();
    const py = spawnSync('python', [join(ROOT, 'tools', 'gen_tiled_tileset.py')], { input: JSON.stringify(recipe), encoding: 'utf8' });
    if (py.status !== 0) throw new Error(`gen_tiled_tileset.py failed:\n${py.stderr || py.error}`);
    writeFileSync(join(OUT, `${TILESET}.tsx`), tsx);
    console.log(`tileset: tiled/${TILESET}.tsx + .png (${recipe.tiles.length} tiles)`);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function mapName(arg) {
    if (!arg) throw new Error('Name a map, e.g. canyon');
    if (arg.startsWith('radical:')) {
        const name = arg.slice('radical:'.length).replace(/\.json$/, '');
        const json = join(GAME, 'radicals', `${name}.json`);
        if (!existsSync(json)) throw new Error(`No radical at game/radicals/${name}.json`);
        return { name: arg, json, tmj: join(OUT, `radical-${name.replace(/\//g, '-')}.tmj`), radical: true };
    }
    const name = basename(arg).replace(/\.(json|tmj)$/, '').replace(/-map$/, '');
    const json = join(GAME, `${name}-map.json`);
    if (!existsSync(json)) throw new Error(`No map at game/${name}-map.json`);
    return { name, json, tmj: join(OUT, `${name}.tmj`) };
}

function main([cmd, arg, ...flags]) {
    if (cmd === 'tileset') return writeTileset();
    if (cmd === 'import') {
        const { json, tmj } = mapName(arg);
        if (existsSync(tmj) && !flags.includes('--force')) {
            throw new Error(`tiled/${basename(tmj)} already exists — export it first, or re-import with --force to throw its edits away.`);
        }
        writeTileset();
        writeFileSync(tmj, JSON.stringify(toTiled(readFileSync(json, 'utf8')), null, 1));
        console.log(`import: ${relPath(json)} -> tiled/${basename(tmj)} — open that in Tiled.`);
        return;
    }
    if (cmd === 'export') {
        const { name, json, tmj, radical } = mapName(arg);
        if (!existsSync(tmj)) throw new Error(`No tiled/${basename(tmj)} — run: npm run tiled:import -- ${name}`);
        const before = readFileSync(json, 'utf8');
        const { errors, warnings, changes, text } = fromTiled(before, JSON.parse(readFileSync(tmj, 'utf8')), { radical });
        for (const w of warnings) console.log(`warning: ${w}`);
        if (errors.length) {
            for (const e of errors) console.error(`error: ${e}`);
            console.error(`export: nothing written.`);
            process.exitCode = 1;
            return;
        }
        if (text === before) return console.log(`export: no changes to ${relPath(json)}.`);
        writeFileSync(json, text);
        for (const c of changes) console.log(`  ${c}`);
        console.log(`export: wrote ${relPath(json)} — now run npm test.`);
        return;
    }
    console.log('usage: node tools/tiled.mjs tileset | import <map> [--force] | export <map>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
