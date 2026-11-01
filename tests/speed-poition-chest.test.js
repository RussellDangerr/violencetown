// speed-poition-chest.test.js — a Speed Poition waits in a Graveyard chest, off
// the beaten path (plans/sv1-speed-poition-chest.md).
//
// Everything here reads the real map through the real GameMap (its own
// walkability rules, props included) and the real save.js, so the chest cannot
// sit somewhere a player's feet cannot go, or somewhere a tall prop paints over.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameMap } from '../game/map.js';
import { ITEMS } from '../game/items.js';
import { PROP_SPRITES } from '../game/sprites.js';
import { fillerSkips } from '../game/renderer.js';
import { serialize, loadInto } from '../game/save.js';
import { QuestEngine } from '../game/quests.js';

const URL_ = 'graveyard-map.json';
const data = JSON.parse(readFileSync(new URL(`../game/${URL_}`, import.meta.url), 'utf8'));
const map = new GameMap(data, URL_);
const chests = data.containers || [];
const chest = chests[0];

const key = (x, y) => `${x},${y}`;
const FOUR = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Steps from `from` to every tile a player can walk to by the four arrow keys.
// The chest is a wall (bumping it opens it); creatures move, so they are not.
function distancesFrom(from) {
    const dist = new Map([[key(from.x, from.y), 0]]);
    const queue = [[from.x, from.y]];
    while (queue.length) {
        const [x, y] = queue.shift();
        for (const [dx, dy] of FOUR) {
            const nx = x + dx, ny = y + dy, k = key(nx, ny);
            if (dist.has(k) || !map.isWalkable(nx, ny) || chests.some(c => c.x === nx && c.y === ny)) continue;
            dist.set(k, dist.get(key(x, y)) + 1);
            queue.push([nx, ny]);
        }
    }
    return dist;
}

// The tiles that lie on ANY shortest walk from `from` to a tile beside `goal`.
function onShortestWalks(from, goal) {
    const a = distancesFrom(from);
    const beside = FOUR.map(([dx, dy]) => ({ x: goal.x + dx, y: goal.y + dy })).filter(t => a.has(key(t.x, t.y)));
    assert.ok(beside.length, `nothing beside (${goal.x},${goal.y}) is reachable from the spawn`);
    const best = Math.min(...beside.map(t => a.get(key(t.x, t.y))));
    const out = [];
    for (const t of beside.filter(t => a.get(key(t.x, t.y)) === best)) {
        const b = distancesFrom(t);
        for (const [k, d] of a) if (b.has(k) && d + b.get(k) === best) out.push(k.split(',').map(Number));
    }
    return out;
}

const chebyshev = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

describe('the Graveyard chest', () => {
    test('there is one chest, holding one Speed Poition', () => {
        assert.equal(chests.length, 1);
        assert.equal(chest.type, 'chest');
        assert.deepEqual(chest.contents, ['speed_poition']);
        assert.ok(typeof chest.id === 'string' && chest.id.length > 0);
    });

    test('the Poition is a real, drinkable Speed Poition', () => {
        const def = ITEMS.speed_poition;
        assert.ok(def, 'speed_poition is not an item');
        assert.equal(def.category, 'poition');
        assert.equal(def.poition.stat, 'speed');
        assert.equal(def.consumable, true);
    });

    test('it stands on open ground, clear of props, creatures, items and exits', () => {
        assert.ok(map.getTileDef(chest.x, chest.y).walkable, 'the chest is built into a wall');
        assert.ok(!map.propBlocked.has(key(chest.x, chest.y)), 'the chest shares a tile with a solid prop');
        assert.ok(!data.props.some(p => p.x === chest.x && p.y === chest.y), 'the chest shares a tile with a prop');
        for (const list of [data.enemies, data.items, data.transitions]) {
            assert.ok(!list.some(e => e.x === chest.x && e.y === chest.y), 'something else stands on the chest tile');
        }
    });
});

describe('reaching the chest on foot', () => {
    test('a tile beside it is reachable from the spawn by arrow keys', () => {
        const reach = distancesFrom(map.spawn);
        const beside = FOUR.map(([dx, dy]) => [chest.x + dx, chest.y + dy]).filter(([x, y]) => reach.has(key(x, y)));
        assert.ok(beside.length >= 1, 'no walkable tile beside the chest can be reached');
    });

    test('it blocks its own tile, so the walk ends in a bump', () => {
        assert.ok(!distancesFrom(map.spawn).has(key(chest.x, chest.y)));
    });
});

describe('off the beaten path', () => {
    const boss = data.enemies.find(e => e.slot === 'graveyard.boss');
    const south = data.transitions.find(t => t.y > map.height / 2);

    test('the boss and the south exit are where the test thinks they are', () => {
        assert.ok(boss && south);
    });

    for (const [label, goal] of [['the boss', boss], ['the south exit', south]]) {
        test(`it is at least 8 tiles from every shortest walk to ${label}`, () => {
            const road = onShortestWalks(map.spawn, goal);
            assert.ok(road.length > 0, 'no road found');
            const nearest = Math.min(...road.map(t => chebyshev(t, [chest.x, chest.y])));
            assert.ok(nearest >= 8, `the chest is ${nearest} tiles from the road to ${label}`);
        });
    }
});

describe('not drawn over by a tall prop', () => {
    // A prop hTiles tall is drawn from its feet tile up through the hTiles-1 rows
    // above it, so whatever stands on those tiles is painted over (renderer.js).
    test('no tall prop on the map reaches the chest tile', () => {
        for (const p of data.props) {
            const def = PROP_SPRITES[p.type];
            assert.ok(def, `${p.type} is not a known prop`);
            for (let k = 1; k < def.hTiles; k++) {
                assert.ok(!(p.x === chest.x && p.y - k === chest.y), `${p.type} at (${p.x},${p.y}) paints over the chest`);
            }
        }
    });

    test('nor does any tile of the forest filler past the map edge', () => {
        const filler = data.border?.prop ? PROP_SPRITES[data.border.prop] : null;
        if (!filler) return;
        let checked = 0;
        for (let wy = -6; wy < map.height + 6; wy++) {
            for (let wx = -6; wx < map.width + 6; wx++) {
                if (map.isInBounds(wx, wy) || fillerSkips(wx, wy, map.width, map.height, filler.hTiles)) continue;
                checked++;
                for (let k = 1; k < filler.hTiles; k++) {
                    assert.ok(!(wx === chest.x && wy - k === chest.y), `filler at (${wx},${wy}) paints over the chest`);
                }
            }
        }
        assert.ok(checked > 0, 'no filler cells were checked');
    });

    test('the tile just below the chest is open ground or a one-tile prop, not a tall prop base', () => {
        const below = data.props.filter(p => p.x === chest.x && p.y === chest.y + 1);
        for (const p of below) assert.equal(PROP_SPRITES[p.type].hTiles, 1);
    });
});

describe('taking it once, and a reload keeping it taken', () => {
    const DEFS = { speed_poition: ITEMS.speed_poition };

    // A stand-in game with what serialize and loadInto touch (as in
    // autoplay-reload.test.js), loading the REAL Graveyard map and copying its
    // containers the way main.js _loadMap does.
    function standIn() {
        const g = {
            map: null, _mapUrl: null, rng: null, turn: 0, state: 'idle',
            playerX: 0, playerY: 0, playerHp: 100, playerMaxHp: 100, playerMp: 100, playerMaxMp: 100,
            facing: 'down', gold: 0,
            equipment: { weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null },
            tempEquips: [], buffs: [], inventory: [], groundItems: [], containers: [], enemies: [],
            _tileDiffs: [], _pendingTransition: null, _sewerEscape: null,
            _render() {},
            _resolveItemDef: (id) => (id ? DEFS[id] || null : null),
            async _loadMap(url, x, y) {
                this.map = new GameMap(data, url);
                this._mapUrl = url;
                this.playerX = x; this.playerY = y;
                this.containers = this.map.containerSpawns.map(c => ({ id: c.id, type: c.type, x: c.x, y: c.y, contents: c.contents.slice() }));
            },
            setTile() {},
        };
        g.questEngine = new QuestEngine(g);
        return g;
    }

    const count = (g) => g.inventory.reduce((n, s) => n + (s && s.itemDef.id === 'speed_poition' ? s.count : 0), 0);

    test('taking it empties the chest and a reload keeps it empty, with one Poition in the bag', async () => {
        const g = standIn();
        await g._loadMap(URL_, chest.x + 1, chest.y);
        const live = g.containers.find(c => c.id === chest.id);
        assert.deepEqual(live.contents, ['speed_poition']);
        // The trade window's take: out of the chest, into the bag.
        g.inventory.push({ itemDef: DEFS[live.contents.shift()], count: 1 });
        const next = standIn();
        await loadInto(next, JSON.parse(JSON.stringify(serialize(g))));
        assert.deepEqual(next.containers.find(c => c.id === chest.id).contents, []);
        assert.equal(count(next), 1);
    });

    test('an untouched chest is still full after a reload', async () => {
        const g = standIn();
        await g._loadMap(URL_, chest.x + 1, chest.y);
        const next = standIn();
        await loadInto(next, JSON.parse(JSON.stringify(serialize(g))));
        assert.deepEqual(next.containers.find(c => c.id === chest.id).contents, ['speed_poition']);
        assert.equal(count(next), 0);
    });
});
