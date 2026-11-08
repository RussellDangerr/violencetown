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
import { weaponClassOf } from './weapons.js';
import { SPELLS } from './spells.js';
import { TRICKS } from './tricks.js';

// (FX44) The weapon compare block. One model for the three places a player
// meets a weapon: the bag's inspector, this examine panel and the shop's
// description strip (the renderer draws all three). It is built from the
// weapon's own data and the weapon in the right hand (the hand a plain Equip
// fills); it names nothing new. It lives here, not in inspector.js, because
// items.js imports inspector.js and the class table is in weapons.js, which
// imports items.js.
export function isComparableWeapon(def) {
    return !!def && !def.questItem && def.equipSlot === 'weapon' && typeof def.damage === 'number';
}

const plainName = d => String(d.name || d.id || '').replace(/[\[\]]/g, '');

// A granted skill by the name its table carries, with what it costs.
function grantedSkills(def) {
    const out = [];
    for (const id of def.grantsSpells || []) {
        const s = SPELLS[id];
        if (s) out.push(`${s.name} (${s.mpCost} MP)`);
    }
    for (const id of def.grantsTricks || []) {
        const t = TRICKS[id];
        if (t) out.push(`${t.name} (${t.gpCost} GP)`);
    }
    return out;
}

// { damage, build, grants } as three plain strings (grants is null when the
// weapon grants nothing), or null for anything that is not a weapon. `held` is
// the weapon in the right hand, or null/undefined for none: with none there is
// no difference to show.
export function weaponCompare(def, held) {
    if (!isComparableWeapon(def)) return null;
    const type = def.damageType && def.damageType !== 'physical' ? `${def.damageType} ` : '';
    let damage = `${type}${def.damage} dmg`;
    if (isComparableWeapon(held)) {
        const diff = def.damage - held.damage;
        damage += diff === 0
            ? ` (same as ${plainName(held)})`
            : ` (${diff > 0 ? '+' : ''}${diff} vs ${plainName(held)})`;
    }
    const cls = weaponClassOf(def);
    const hands = cls ? cls.hands : 1;
    const parts = [`${hands} hand${hands === 1 ? '' : 's'}`];
    if (cls) parts.push(cls.id.replace(/_/g, ' '));
    if (def.reach) parts.push(`reach ${def.reach}`);
    if (def.pullDistance) parts.push(`pulls ${def.pullDistance}`);
    const skills = grantedSkills(def);
    return {
        damage,
        build: parts.join(', '),
        grants: skills.length ? `Grants: ${skills.join(', ')}` : null,
    };
}

// The block as lines, or null for a non-weapon.
export function weaponCompareLines(def, held) {
    const c = weaponCompare(def, held);
    return c ? [c.damage, c.build, ...(c.grants ? [c.grants] : [])] : null;
}

const FACE = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } };

// What a prop is called when examined, matched on the start of its type —
// the twelve gravestone silhouettes are all just "Gravestone".
const PROP_NAMES = [
    ['gravestone', 'Gravestone'],
    ['cemeteryArch', 'Cemetery gate'],
    ['streetlight', 'Streetlight'],
    ['tree', 'Tree'],
    ['grappleRock', 'Jutting rock'],
    ['wreckedCar', 'Wrecked car'],
    // Interior furniture: each piece by its plain name. The bank's service
    // counter (`desk*`) is a counter, the casino's felt table a table.
    ['counter', 'Counter'],
    ['desk', 'Counter'],
    ['feltTable', 'Table'],
    ['table', 'Table'],
    ['chair', 'Chair'],
    ['shelf', 'Shelf'],
    ['plant', 'Plant'],
    ['stove', 'Stove'],
    // The casino's slot machine and the bank's vault door, by their plain names.
    ['slotMachine', 'Slot machine'],
    ['vaultDoor', 'Vault door'],
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
// `examine` quest event for those alone, as before. `bare` is true only on the
// last two rungs (the tile's own name, and off the map): nothing there but the
// ground, so the E key logs the line and opens no panel (FX42).
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
        // (FX47) A boss goes by its one name; anyone else reads as before.
        const name = (npc.boss && npc.shownName) || npc.name || npc.type;
        // A creature with examine text of its own says it (plans/ic4-frozen-creatures.md).
        if (typeof npc.examine === 'string' && npc.examine) return result(name, npc.examine);
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
        // (FX44) A weapon's panel keeps its description and adds the compare
        // block under it (what it hits for against what you hold, hands, class,
        // skills). The panel splits its body on newlines; the log line stays as
        // it was.
        const block = weaponCompareLines(def, game.equipment?.weapon);
        const panelBody = block ? [def.description || '', '', ...block].join('\n').trim() : (def.description || body);
        return result(name, body, { panelBody, tierName: tier.name, tierColor: tier.color });
    }

    const prop = (game.map?.propSpawns || []).find(p => p.x === x && p.y === y);
    const pName = prop && propName(prop.type);
    if (pName) return result(pName, `[${pName}.]`);

    const onMap = game.map && (!game.map.isInBounds || game.map.isInBounds(x, y));
    const tName = onMap ? tileDisplayName(game.map.getTile(x, y)) : null;
    if (tName) return result(tName, `[${tName}.]`, { bare: true });

    return result('Examine', '[Nothing here worth examining.]', { bare: true });
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
// ── Pointing at what the quest is waiting for ────────────────────────────────
//
// The opening objective says "examine it (E)", but E reads the tile you FACE and
// the car is eight tiles from where you spawn. So the one instruction the game
// gives a new player could not be followed as written: E answered "[Road.]" —
// indistinguishable, to someone new, from the key doing nothing at all.
//
// When the active quest stage is waiting on an EXAMINE of some examinable, and
// the player examined anything else, say where the real target is. Generic on
// purpose: it reads the stage's own trigger rather than naming the car, so any
// later "examine X" stage gets the same help without a second implementation.
const COMPASS = ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'];
function compassTo(dx, dy) {
    // Screen y grows downward, so north is -dy. Eight 45-degree sectors, east first.
    const deg = (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
    return COMPASS[Math.round(deg / 45) % 8];
}

export function questExamineHint(game, res) {
    const stage = game.questEngine?.currentStage?.();
    const on = stage?.on;
    if (!on || on.type !== 'examine' || !on.match?.targetId) return null;
    const targetId = on.match.targetId;
    if (res && res.instanceId === targetId) return null;         // you ARE examining it
    const target = (game.examinables || []).find(e => e.id === targetId);
    if (!target) return null;                                     // not on this map
    const dx = target.x - game.playerX, dy = target.y - game.playerY;
    const name = String(target.id).replace(/_/g, ' ');
    if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1) {
        return `Your ${name}'s right beside you - face it and press E.`;
    }
    return `Your ${name}'s to the ${compassTo(dx, dy)} - walk over and try E.`;
}

export function doExamine(game) {
    const inst = findExaminable(game);
    const fd = FACE[game.facing] || { dx: 0, dy: 0 };
    const res = inst ? resolveExamine(game, inst.x, inst.y)
                     : resolveExamine(game, game.playerX + fd.dx, game.playerY + fd.dy);
    if (res.instanceId) game.emitGameEvent('examine', { targetId: res.instanceId });
    // Some examinables yield a one-time item (e.g. the Red Cape in a grate);
    // main.js owns the inventory + collected-set bookkeeping and its logging.
    if (res.grantsInstance && game._grantFromExaminable) return game._grantFromExaminable(res.grantsInstance);
    // A quest stage waiting on some OTHER examinable: say where it is, so E
    // never answers the opening objective with just the name of the floor.
    const hint = questExamineHint(game, res);
    if (hint) {
        res.body = String(res.body).replace(/\]\s*$/, '') + ' ' + hint + ']';
        res.panelBody = (res.panelBody ? res.panelBody + ' ' : '') + hint;
    }
    game._log(res.body);
    // (§12.3) Also surface it as a layered inspect panel — unless it is bare
    // ground with nothing added to it (FX42): that is one log line, no panel.
    if (game._openInspect && !(res.bare && !hint)) game._openInspect({ title: res.title, body: res.panelBody, tierName: res.tierName, tierColor: res.tierColor });
    return true;
}
