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
import { describeItemParts } from './inspector.js';
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

// (PC10) Everything a panel shows about an item, in the order it shows it: { stats, fact, sources }.
// A weapon's hands, class and granted skills come from here because weapons.js, spells.js and
// tricks.js cannot be imported by inspector.js; `held` is the weapon in the right hand.
export function itemParts(def, held, maxNames) {
    const opts = { held, maxNames };
    if (isComparableWeapon(def)) {
        const cls = weaponClassOf(def);
        opts.hands = cls ? cls.hands : 1;
        opts.weaponClass = cls ? cls.id : null;
        opts.grants = grantedSkills(def);
    }
    return describeItemParts(def, opts);
}

// The same, as the paragraphs of a panel body: stats, fact, then one paragraph per source line.
export function itemParagraphs(def, held) {
    const p = itemParts(def, held);
    return [p.stats, p.fact, ...p.sources].filter(Boolean);
}

// The same for the small panels (the bag's, the trade strip): the sources share one paragraph and
// a long list is cut to three names and a count, so all three kinds still fit.
export const COMPACT_NAMES = 3;
export function itemParagraphsCompact(def, held) {
    const p = itemParts(def, held, COMPACT_NAMES);
    return [p.stats, p.fact, p.sources.join(' ')].filter(Boolean);
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

// (EX2) The plain name of the prop on tile (x, y), or null. The long-press on touch
// offers Examine only where this finds one.
export function propNameAt(game, x, y) {
    const prop = (game.map?.propSpawns || []).find(p => p.x === x && p.y === y);
    return (prop && propName(prop.type)) || null;
}

// (ND1) What examining a character says, built from its spawn row's fields alone (never a
// per-character table). `line` is the bracketed log line: name, role, stance. `rows` are the
// inspect panel's extra lines: HP, armour, damage, weapon, what they sell, what they drop.
// The words are plain placeholders for the owner to review.
export const ROLE_WORDS = { boss: 'Leader', vendor: 'Vendor', talker: 'Talker', wanderer: 'Wanderer', guard: 'Guard', creature: 'Creature' };
export const STANCE_WORDS = { hostile: 'Looks like trouble.', neutral: 'Minding their own business.', ally: 'On your side.' };

const sentence = id => { const t = String(id).replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
const itemId = it => (it && typeof it === 'object') ? (it.type || it.id) : it;
const itemName = it => resolveItemDef(itemId(it))?.name || sentence(itemId(it));
const nameList = items => items.map(itemName).join(', ');

export function characterRole(npc) {
    if (npc.boss) return 'boss';
    if (Array.isArray(npc.stock) && npc.stock.length) return 'vendor';
    if (npc.dialogueId) return 'talker';
    if (npc.capabilities?.has?.('WANDER')) return 'wanderer';
    if (npc.capabilities?.size || (Array.isArray(npc.behavior) && npc.behavior.length)) return 'guard';
    return 'creature';
}

export function characterSheet(npc) {
    const named = typeof npc.name === 'string' && npc.name.trim() && !/[[\]]/.test(npc.name) ? npc.name.trim() : null;
    // (FX47) A boss goes by its one name. No name of its own: its role from the dialogue id, else its type.
    const name = (npc.boss && npc.shownName) || named || (npc.dialogueId ? sentence(npc.dialogueId) : null) || npc.type || 'Someone';
    const role = characterRole(npc);
    const stance = isHostile(npc) ? 'hostile' : npc.allegiance === 'ally' ? 'ally' : 'neutral';
    const line = `[${name}. ${ROLE_WORDS[role]}. ${STANCE_WORDS[stance]}]`;

    const rows = [];
    const e = npc.entity || {};
    if (Number.isFinite(e.hp)) rows.push(`HP: ${e.hp}${Number.isFinite(e.maxHp) ? ` / ${e.maxHp}` : ''}`);
    if (Number.isFinite(e.armor)) rows.push(`Armour: ${e.armor}`);
    if (Number.isFinite(npc.damage)) rows.push(`Damage: ${npc.damage}`);
    const worn = Array.isArray(npc.equipped) ? npc.equipped : [];
    const loadout = Array.isArray(npc.loadout) ? npc.loadout : [];
    const weapon = [...worn, ...loadout].find(it => weaponClassOf(resolveItemDef(itemId(it))));
    if (weapon) rows.push(`Weapon: ${itemName(weapon)}`);
    if (role === 'vendor') rows.push(`Sells: ${nameList(npc.stock)}`);
    if (loadout.length) rows.push(`Drops: ${nameList(loadout)}`);
    return { name, role, stance, line, rows };
}

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
// `fallInstance` is set when the instance drops the player to another map (MO1).
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
            { instanceId: inst.id, grantsInstance: inst.grants ? inst : null, fallInstance: inst.fallTo ? inst : null });
    }

    const npc = (game.enemies || []).find(e => e.x === x && e.y === y && e.entity?.isAlive?.());
    if (npc) {
        const sheet = characterSheet(npc);
        // A creature with examine text of its own (plans/ic4-frozen-creatures.md) says it first, then the sheet (NDR3).
        if (typeof npc.examine === 'string' && npc.examine) {
            return result(sheet.name, `${npc.examine} ${sheet.line}`, { panelBody: [npc.examine, sheet.line, ...sheet.rows].join('\n') });
        }
        return result(sheet.name, sheet.line, { panelBody: [sheet.line, ...sheet.rows].join('\n') });
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
        // (PC10) The panel shows the stats (a weapon's against the one you hold), then the fact,
        // then where it comes from, one paragraph each; the log gets the same as one line.
        const paras = itemParagraphs(def, game.equipment?.weapon);
        const body = `${name}. ${paras.join(' ')}`;
        const panelBody = paras.join('\n');
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

// (EX1) The name to float over the authored examinable the player is FACING (the Town fuel
// note, the canyon wreck, a road sign), or null. Same name resolveExamine gives it; a living creature
// standing on that tile keeps its own label instead.
export function examineLabelAt(game) {
    const fd = FACE[game.facing] || { dx: 0, dy: 1 };
    const x = game.playerX + fd.dx, y = game.playerY + fd.dy;
    if ((game.enemies || []).some(e => e.x === x && e.y === y && e.entity?.isAlive?.())) return null;
    const res = resolveExamine(game, x, y);
    return res.instanceId ? res.title : null;
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
    // (MO1) A grave you search can give way: say so, then drop the player through.
    if (res.fallInstance && game._fallThrough) { game._log(res.body); game._fallThrough(res.fallInstance); return true; }
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
