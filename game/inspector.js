// inspector.js — pure model for the REMOTICON inspector panel: what stat line
// and what action buttons a selected bag item shows. No DOM, no game object —
// takes an itemDef + its zone ('safe'|'pack') and returns plain data the
// renderer draws and main.js dispatches.

import { inspectorPanelRect, inspectorActionRects } from './layout.js';
import { DELIVERY_CAP_PURSE } from './trade.js';
import { itemTier, BOON_KINDS, BOON_CAP } from './items.js';   // only read inside functions: items.js imports this file
import ITEM_SOURCES from './item-sources.json' with { type: 'json' };   // (PC10) tools/item-sources.mjs writes it

// (C3c) The button that opens an item's "use this on that" list (the overlay
// Space opens). main.js decides whether it shows; this only names it.
export const USES_ACTION = Object.freeze({ id: 'uses', label: 'Use on' });

// Where that button sits: on the action row, right of the last action button,
// with the row's own gap before it and as a margin after it.
export function inspectorUsesRect(bodyRect) {
    const p = inspectorPanelRect(bodyRect);
    const row = inspectorActionRects(bodyRect);
    const last = row[row.length - 1];
    const gap = row.length > 1 ? row[1].x - (row[0].x + row[0].w) : 12;
    const x = last.x + last.w + gap;
    return { x, y: last.y, w: p.x + p.w - gap - x, h: last.h };
}

// (fx37) A throw item's main button arms the throw (the game then waits for a
// direction). A drinkable throw item (Fire Blood) keeps its Drink.
export function armsThrow(itemDef) {
    return !!itemDef && itemDef.useType === 'throw' && !itemDef.drinkable;
}

function primaryAction(itemDef) {
    if (itemDef.useType === 'equip' && itemDef.equipSlot) return { id: 'equip', label: 'Equip' };
    // A drinkable throw item (Fire Blood): throwing needs the bar or the wheel,
    // so the device's one primary row is the drink.
    if (itemDef.drinkable) return { id: 'drink', label: 'Drink' };
    // A throw item's Use arms the throw; the flag tells the dispatcher (fx37).
    if (armsThrow(itemDef)) return { id: 'use', label: 'Use', arms: true };
    return { id: 'use', label: 'Use' };
}

// Actions for a bag item. Quest items are always kept, so they get no Protect
// (moot) and no Drop (you can't ditch a quest item). Everything else gets the
// primary action, a zone toggle (Protect in PACK / Unprotect in SAFE), and Drop.
export function itemActions(itemDef, zone) {
    if (!itemDef || itemDef.questItem) return [];
    const toggle = zone === 'safe'
        ? { id: 'unprotect', label: 'Unprotect' }
        : { id: 'protect', label: 'Protect' };
    return [primaryAction(itemDef), toggle, { id: 'drop', label: 'Drop' }];
}

// (GL1) What each armour perk does, said after "+N armor". One row per perk field;
// phrase(def) returns the words, or '' when the piece doesn't carry it. Numbers are read
// from the item or trade.js. inspector.js can't import items.js (it imports this file), so
// the rat mask's 'grates' verb is read off def.body.verbs directly.
export const ARMOUR_PERKS = Object.freeze([
    { field: 'sludgeImmune', phrase: d => (d.sludgeImmune ? 'sludge-proof' : '') },
    { field: 'meleeBonus', phrase: d => (d.meleeBonus ? `${signed(d.meleeBonus)} melee` : '') },
    { field: 'deliveryCap', phrase: d => (d.deliveryCap ? `foes carry +${Math.round((DELIVERY_CAP_PURSE - 1) * 100)}% gold` : '') },
    { field: 'powerWield', phrase: d => (d.powerWield ? 'a two-hander in each hand' : '') },
    { field: 'grates', phrase: d => ((d.body && d.body.verbs || []).includes('grates') ? 'walks through grates' : '') },
]);

export function armourPerkPhrases(d) {
    return ARMOUR_PERKS.map(r => r.phrase(d)).filter(Boolean);
}

// One-line stat summary for the panel header. Gear folds in sludge-immunity;
// weapons read their damageType (energy/sludge/…) rather than a blanket "Melee"
// — only a THROW item is prefixed with the verb, since a ranged/energy weapon
// isn't melee and a plain physical weapon needs no qualifier.
export function itemStatLine(itemDef) {
    if (!itemDef) return '';
    if (itemDef.questItem) return 'Always kept';
    // (FX35) Poitions, Soap and Alcohol: what it does. (PC10) The fact and the sources are
    // their own lines now, built by describeItem.
    const effect = effectLine(itemDef);
    if (effect) return effect;
    if (itemDef.healAmount) return `Heals ${itemDef.healAmount} HP`;
    if (itemDef.armor) return `+${itemDef.armor} armor${armourPerkPhrases(itemDef).map(p => `, ${p}`).join('')}`;
    if (itemDef.damage) {
        if (itemDef.useType === 'throw') return `Throw ${itemDef.damage} dmg`;
        const dt = itemDef.damageType;
        return dt && dt !== 'physical' ? `${dt} ${itemDef.damage} dmg` : `${itemDef.damage} dmg`;
    }
    return '';
}

// (FX35) The mechanical half of a poition / Soap / Alcohol line, or '' for
// any other item. Tick stats (HP, MP, GP) read per turn when they last;
// rider stats (strength, defence) read the turns they hold; speed is the
// action charges it buys (buffs.js worldBeatPlan), not a stat.
const POITION_UNIT = { health: 'HP', mana: 'MP', gold: 'GP', strength: 'strength', defence: 'defence' };
const signed = n => (n >= 0 ? `+${n}` : `${n}`);
const turnsWord = n => `${n} turn${n === 1 ? '' : 's'}`;

export function poitionLine(p) {
    if (!p || typeof p.amount !== 'number') return '';
    const turns = p.turns ?? 1;
    if (p.stat === 'speed') {
        return p.amount >= 0
            ? `${p.amount} free action${p.amount === 1 ? '' : 's'}`
            : `${-p.amount} doubled turn${p.amount === -1 ? '' : 's'}`;
    }
    const unit = POITION_UNIT[p.stat];
    if (!unit) return '';
    if (turns <= 1) return `${signed(p.amount)} ${unit}`;
    const tick = p.stat === 'health' || p.stat === 'mana' || p.stat === 'gold';
    return tick
        ? `${signed(p.amount)} ${unit}/turn, ${turnsWord(turns)}`
        : `${signed(p.amount)} ${unit}, ${turnsWord(turns)}`;
}

function effectLine(d) {
    const verb = d.useType === 'throw' ? 'Throw ' : '';
    if (d.poition) {
        const line = poitionLine(d.poition);
        if (line) return verb + line;
    }
    if (d.category === 'poition' && d.puddle) {
        return `${verb}${d.puddle.kind} puddle, ${turnsWord(d.puddle.turns)}`;
    }
    if (d.effect === 'cure_sludge') {
        const armor = d.armor
            ? `, +${d.armor} armor${d.equipDuration ? ` for ${turnsWord(d.equipDuration)}` : ''}`
            : '';
        return `Cures sludge${armor}`;
    }
    if (d.id === 'alcohol') return 'Car fuel: slows the car';
    return '';
}

// equipOptions — the GEAR chooser: every bag item that fits `slotKey`, each
// with its armor delta vs the currently-worn piece, plus a "Bare" unequip row.
// Pure: takes the slot key, the worn itemDef (or null), and the bag array.
export function equipOptions(slotKey, worn, bag) {
    const wornArmor = (worn && worn.armor) || 0;
    const opts = [];
    (bag || []).forEach((stack, bagIndex) => {
        const d = stack && stack.itemDef;
        if (!d || d.useType !== 'equip' || d.equipSlot !== slotKey) return;
        opts.push({
            id: d.id, name: d.name, bagIndex,
            delta: ((d.armor || 0) - wornArmor),
            sludgeImmune: !!d.sludgeImmune,
            perks: armourPerkPhrases(d),   // (GL2) what the piece does, from GL1's table
        });
    });
    if (worn) opts.push({ id: '__bare__', name: 'Bare', bagIndex: -1, delta: -wornArmor, perks: [] });
    return opts;
}

// ── describeItem (PC10, ruling PCR3) ─────────────────────────────────────────
// Every item's text, built from its data: its numbers and interactions first, then at most one
// short physical `fact` (his own, never generated), then where it comes from. No voice, no jokes.
// The stats read the same fields the game reads (items.js resolveThrow and resolveSelfUse,
// main.js for the melee-side rows). The sources come from game/item-sources.json, which
// tools/item-sources.mjs writes from the maps, slots.js, the shops and the stock kits.
//
// A weapon's hands and class, and the skills it grants, live in weapons.js, spells.js and
// tricks.js, which import items.js and so cannot be imported here: the caller passes them in
// `opts` ({ hands, weaponClass, grants: ['Boo! (8 MP)'], held: the weapon in the right hand }).

const damageWord = d => (d.damageType && d.damageType !== 'physical' ? `${d.damageType} ` : '');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const noBrackets = s => String(s || '').replace(/[\[\]]/g, '');
const THROW_DEFAULT_RANGE = 5;      // items.js resolveThrow: `itemDef.range || 5`
const FEAR_TURNS = 3;               // main.js: a Fearmur's repeat hit fears for 3 turns

const isWeaponDef = d => d.equipSlot === 'weapon' && typeof d.damage === 'number' && d.useType === 'equip';
const isHeldWeapon = h => !!h && !h.questItem && h.equipSlot === 'weapon' && typeof h.damage === 'number';

// The stat sentences, in reading order. Each is one plain statement.
export function itemStatSentences(def, opts = {}) {
    const out = [];
    if (!def) return out;
    if (def.questItem) out.push('Quest item: always kept, cannot be dropped.');

    if (isWeaponDef(def)) {
        let s = `Weapon: ${damageWord(def)}${def.damage} damage`;
        if (isHeldWeapon(opts.held)) {
            const diff = def.damage - opts.held.damage;
            s += diff === 0 ? ` (same as ${noBrackets(opts.held.name || opts.held.id)})`
                : ` (${diff > 0 ? '+' : ''}${diff} vs ${noBrackets(opts.held.name || opts.held.id)})`;
        }
        out.push(`${s}.`);
        if (opts.hands) out.push(`${plural(opts.hands, 'hand')}${opts.weaponClass ? `, ${String(opts.weaponClass).replace(/_/g, ' ')}` : ''}.`);
        if (def.reach) out.push(`Reach ${def.reach} tiles.`);
        if (def.pullDistance) out.push(`A hit enemy is pulled ${plural(def.pullDistance, 'tile')} closer.`);
        if (def.onHit === 'fearOnRepeat') out.push(`Hitting the same enemy twice in a row frightens it for ${FEAR_TURNS} turns.`);
        if (opts.grants && opts.grants.length) out.push(`Grants while worn: ${opts.grants.join(', ')}.`);
        if (def.canJamDoors) out.push('Use: wedges the door you came through shut, and the pipe stays in it.');
    }

    if (def.useType === 'throw') {
        const range = def.range || THROW_DEFAULT_RANGE;
        const p = def.poition;
        if (def.puddle) {
            out.push(`Throw: leaves a ${def.puddle.kind} puddle on up to 3 tiles for ${plural(def.puddle.turns, 'turn')}, range ${range}.`);
            if (def.puddle.kind === 'goo') out.push('Ending a turn in it gives the Goo status.');
            else out.push('Ending a turn in it applies Sludge; sewer creatures are healed instead.');
        } else if (p && typeof p.turns === 'number' && p.stat === 'health') {
            const half = Math.max(1, Math.floor(p.turns / 2));
            const kind = def.damageType && def.damageType !== 'physical' ? `${def.damageType}, ` : '';
            out.push(p.amount < 0
                ? `Throw: ${kind}${-p.amount} damage per turn for ${plural(p.turns, 'turn')}, range ${range}.`
                : `Throw: heals ${p.amount} HP per turn for ${plural(p.turns, 'turn')}, range ${range}.`);
            out.push(`It bursts over 3x3 tiles; the tiles around the centre get ${plural(half, 'turn')}.`);
        } else if (typeof def.damage === 'number') {
            const mag = Math.max(1, Math.round(def.damage / 2));
            out.push(`Throw: ${damageWord(def)}${mag} damage to everything in a 3x3 burst (half of ${def.damage}), range ${range}.`);
        } else {
            out.push(`Throw: range ${range}.`);
        }
        if (def.sewerFare) out.push('Sewer creatures are healed instead of hurt.');
        if (def.fireBlood) out.push('Whoever it burns also gets fire blood for as long; while both last, their hits set the target burning.');
        if (def.drinkable) out.push('Can be drunk.');
        if (def.pullsAggro) out.push('Idle or wandering enemies in earshot go to where it lands.');
        if (def.enemyThrows) out.push('Enemies throw it at you.');
    }

    if (def.useType === 'self' || def.useType === 'none' || def.useType === 'throw') {
        const verb = def.category === 'ambro' ? 'Eat' : 'Use';
        if (def.effect === 'heal' && def.useType === 'self') {
            out.push(`${verb}: heals ${def.healAmount} HP.`);
            if (def.armor && def.equipDuration) out.push(`Also worn on your ${def.equipSlot} for ${plural(def.equipDuration, 'turn')}: +${def.armor} armour.`);
        } else if (def.effect === 'cure_sludge') {
            out.push('Use: cures sludge and poison.');
            if (def.armor && def.equipDuration) out.push(`Also worn on your ${def.equipSlot} for ${plural(def.equipDuration, 'turn')}: +${def.armor} armour.`);
        } else if (def.poition && def.useType === 'self') {
            if (def.poition.permanent) {
                const kinds = Object.values(BOON_KINDS).map(k => `+${k.amount} ${k.label}`);
                out.push(`Drink: permanent, your choice of ${kinds.slice(0, -1).join(', ')} or ${kinds[kinds.length - 1]}. At most ${BOON_CAP} boons per game.`);
                out.push(`Thrown at an enemy: lowers its max MP by ${BOON_KINDS.mana.amount}.`);
            } else {
                const line = poitionLine(def.poition);
                if (line) out.push(`Drink: ${line}.`);
            }
        }
    }
    if (def.id === 'alcohol') out.push('Car fuel: slows the car.');
    if (def.useType === 'costume') out.push('Costume: Use puts it on, Use again takes it off.');

    if (def.useType === 'equip' && def.armor && def.equipSlot !== 'weapon') {
        out.push(`Armour: +${def.armor}, worn on ${def.equipSlot}.`);
        const perks = armourPerkPhrases(def);
        if (perks.length) out.push(`Perk: ${perks.join(', ')}.`);
        if (def.body && def.body.species) out.push(`While worn you look like a ${def.body.species}.`);
    }
    if (def.saleLockedUntil) out.push('Vendors will not buy it until the delivery is done.');

    const perks = Array.isArray(def.perks) ? def.perks : [];
    const real = perks.filter(x => !/^\[.*\]$/.test(String(x)));
    const empty = perks.length - real.length;
    if (real.length) out.push(`Perks: ${real.join(', ')}.`);
    if (empty) out.push(`${plural(empty, 'perk slot')} not yet filled.`);

    if (def.consumable) out.push('Used up when used.');
    const tier = itemTier(def);
    out.push(`${tier.name}, value ${def.baseValue ?? 0} GP.`);
    return out;
}

// "Dropped by: A, B. Sold by: C. Found in: D." as separate lines; nothing for an item with no source.
export function itemSourceLines(def, sources = ITEM_SOURCES) {
    const r = def && sources && sources[def.id];
    if (!r) return [];
    const names = list => list.join(', ');
    const out = [];
    if (r.droppedBy && r.droppedBy.length) out.push(`Dropped by: ${names(r.droppedBy)}.`);
    if (r.soldBy && r.soldBy.length) out.push(`Sold by: ${names(r.soldBy)}.`);
    if (r.foundIn && r.foundIn.length) out.push(`Found in: ${names(r.foundIn)}.`);
    return out;
}

// { stats, fact, sources } as strings: the three parts every panel shows, in this order.
export function describeItemParts(def, opts = {}) {
    if (!def) return { stats: '', fact: '', sources: [] };
    return {
        stats: itemStatSentences(def, opts).join(' '),
        fact: def.fact || '',
        sources: itemSourceLines(def, opts.sources || ITEM_SOURCES),
    };
}

// The whole text, one paragraph per part: stats, then the fact, then each source line.
export function describeItem(def, opts = {}) {
    const p = describeItemParts(def, opts);
    return [p.stats, p.fact, ...p.sources].filter(Boolean).join('\n');
}
