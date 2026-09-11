// examine.js — the Examine skill (an active verb, not flavor text).
//
// Examining a nearby examinable logs its description and emits an `examine`
// event so quests can react. First taught on the broken-down car (Phase D
// content): the player learns Examine is a real action, and examining the car
// reveals the converter is gone. Examinables are loaded per-map into
// game.examinables as [{ id, x, y, text }].

import { manhattan } from './utils.js';
import { itemTier } from './items.js';
import { resolveItemDef } from './item-registry.js';
import { tileDisplayName } from './data.js';
import { isHostile } from './ai.js';

const FACE = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } };

// What a prop is called when examined, matched on the start of its type —
// the twelve gravestone silhouettes are all just "Gravestone".
const PROP_NAMES = [
    ['gravestone', 'Gravestone'],
    ['cemeteryArch', 'Cemetery gate'],
    ['streetlight', 'Streetlight'],
    ['tree', 'Tree'],
];
const propName = type => PROP_NAMES.find(([prefix]) => type.startsWith(prefix))?.[1] ?? null;

// The most salient thing at tile (x, y), as Examine reports it. One ladder for
// both entry points — the E key (doExamine, below) and the Target List / tap
// (main.js _fireResolver) — so they cannot drift apart again. First match wins:
//   1. an authored instance (game.examinables) — its own text, and its grant
//   2. a living creature                         — named, hostile or not
//   3. a container                               — whether anything rattles
//   4. an item on the ground (weapons too)       — name, value tier, description
//   5. a prop (graves, lamps, trees, the gate)   — its name, not the ground under it
//   6. the tile                                  — its name, derived from its key
// Only off the map does it still come back empty-handed.
//
// Returns { title, body, panelBody, instanceId, grantsInstance, tierName, tierColor }:
// `body` is the bracketed log line; `panelBody` is what the inspect panel shows
// (the same, except an item's panel shows its description beside the tier chip);
// `instanceId` is set only for an authored instance — the caller fires the
// `examine` quest event for those alone, as before.
export function resolveExamine(game, x, y) {
    const result = (title, body, extra = {}) => ({
        title, body, panelBody: body, instanceId: null, grantsInstance: null, tierName: null, tierColor: null, ...extra,
    });

    const inst = (game.examinables || []).find(e => e.x === x && e.y === y);
    if (inst) {
        return result(String(inst.id).replace(/_/g, ' '), inst.text || `[You examine the ${inst.id}.]`,
            { instanceId: inst.id, grantsInstance: inst.grants ? inst : null });
    }

    const npc = (game.enemies || []).find(e => e.x === x && e.y === y && e.entity?.isAlive?.());
    if (npc) {
        const name = npc.name || npc.type;
        return result(name, `[${name}. ${isHostile(npc) ? 'Looks like trouble.' : 'Minding their own business.'}]`);
    }

    const chest = (game.containers || []).find(c => c.x === x && c.y === y);
    if (chest) {
        return result(`A ${chest.type}`, `[A ${chest.type}. ${(chest.contents || []).length ? 'Something rattles inside.' : 'Empty.'}]`);
    }

    const item = (game.groundItems || []).find(i => i.x === x && i.y === y);
    const def = item && (item.def || resolveItemDef(item.type));
    if (def) {
        const tier = itemTier(def);
        const name = def.name || item.type;
        const body = `[${name} (${tier.name}).${def.description ? ` ${def.description}` : ''}]`;
        return result(name, body, { panelBody: def.description || body, tierName: tier.name, tierColor: tier.color });
    }

    const prop = (game.map?.propSpawns || []).find(p => p.x === x && p.y === y);
    const pName = prop && propName(prop.type);
    if (pName) return result(pName, `[${pName}.]`);

    const onMap = game.map && (!game.map.isInBounds || game.map.isInBounds(x, y));
    const tName = onMap ? tileDisplayName(game.map.getTile(x, y)) : null;
    if (tName) return result(tName, `[${tName}.]`);

    return result('Examine', '[Nothing here worth examining.]');
}

// The examinable the player is facing, then any adjacent (incl. current) one.
export function findExaminable(game) {
    const ex = game.examinables;
    if (!ex || ex.length === 0) return null;
    const { playerX: x, playerY: y } = game;
    const fd = FACE[game.facing] || { dx: 0, dy: 0 };
    const faced = ex.find(e => e.x === x + fd.dx && e.y === y + fd.dy);
    if (faced) return faced;
    return ex.find(e => manhattan(e.x, e.y, x, y) <= 1) || null;
}

// Examine action. A free look (no turn cost). A faced-or-adjacent authored
// instance wins, so the 2x2 car still answers when you stand beside it rather
// than facing its one tile; otherwise the faced tile — which always resolves to
// something now. Returns true.
export function doExamine(game) {
    const inst = findExaminable(game);
    const fd = FACE[game.facing] || { dx: 0, dy: 0 };
    const res = inst ? resolveExamine(game, inst.x, inst.y)
                     : resolveExamine(game, game.playerX + fd.dx, game.playerY + fd.dy);
    if (res.instanceId) game.emitGameEvent('examine', { targetId: res.instanceId });
    // Some examinables yield a one-time item (e.g. the Red Cape in a grate);
    // main.js owns the inventory + collected-set bookkeeping and its logging.
    if (res.grantsInstance && game._grantFromExaminable) return game._grantFromExaminable(res.grantsInstance);
    game._log(res.body);
    // (§12.3) Also surface it as a layered inspect panel.
    if (game._openInspect) game._openInspect({ title: res.title, body: res.panelBody, tierName: res.tierName, tierColor: res.tierColor });
    return true;
}
