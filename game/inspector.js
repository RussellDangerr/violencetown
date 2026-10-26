// inspector.js — pure model for the REMOTICON inspector panel: what stat line
// and what action buttons a selected bag item shows. No DOM, no game object —
// takes an itemDef + its zone ('safe'|'pack') and returns plain data the
// renderer draws and main.js dispatches.

import { inspectorPanelRect, inspectorActionRects } from './layout.js';

// (C3c) The button that opens an item's "use this on that" list (the overlay
// Space opens). main.js decides whether it shows; this only names it.
export const USES_ACTION = Object.freeze({ id: 'uses', label: '[TEXT]' });

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

function primaryAction(itemDef) {
    if (itemDef.useType === 'equip' && itemDef.equipSlot) return { id: 'equip', label: 'Equip' };
    // A drinkable throw item (Fire Blood): throwing needs the bar or the wheel,
    // so the device's one primary row is the drink.
    if (itemDef.drinkable) return { id: 'drink', label: 'Drink' };
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

// One-line stat summary for the panel header. Gear folds in sludge-immunity;
// weapons read their damageType (energy/sludge/…) rather than a blanket "Melee"
// — only a THROW item is prefixed with the verb, since a ranged/energy weapon
// isn't melee and a plain physical weapon needs no qualifier.
export function itemStatLine(itemDef) {
    if (!itemDef) return '';
    if (itemDef.questItem) return 'Always kept';
    // (FX35) Poitions, Soap and Alcohol: what it does, then the description,
    // in the panel's one wrapped text block.
    const effect = effectLine(itemDef);
    if (effect) return itemDef.description ? `${effect}. ${itemDef.description}` : effect;
    if (itemDef.healAmount) return `Heals ${itemDef.healAmount} HP`;
    if (itemDef.armor) return `+${itemDef.armor} armor${itemDef.sludgeImmune ? ', sludge-proof' : ''}`;
    if (itemDef.damage) {
        if (itemDef.useType === 'throw') return `Throw ${itemDef.damage} dmg`;
        const dt = itemDef.damageType;
        return dt && dt !== 'physical' ? `${dt} ${itemDef.damage} dmg` : `${itemDef.damage} dmg`;
    }
    return itemDef.description || '';
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
        });
    });
    if (worn) opts.push({ id: '__bare__', name: 'Bare', bagIndex: -1, delta: -wornArmor });
    return opts;
}
