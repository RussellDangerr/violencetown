// inspector.js — pure model for the REMOTICON inspector panel: what stat line
// and what action buttons a selected bag item shows. No DOM, no game object —
// takes an itemDef + its zone ('safe'|'pack') and returns plain data the
// renderer draws and main.js dispatches.

function primaryAction(itemDef) {
    if (itemDef.useType === 'equip' && itemDef.equipSlot) return { id: 'equip', label: 'Equip' };
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
    if (itemDef.healAmount) return `Heals ${itemDef.healAmount} HP`;
    if (itemDef.armor) return `+${itemDef.armor} armor${itemDef.sludgeImmune ? ', sludge-proof' : ''}`;
    if (itemDef.damage) {
        if (itemDef.useType === 'throw') return `Throw ${itemDef.damage} dmg`;
        const dt = itemDef.damageType;
        return dt && dt !== 'physical' ? `${dt} ${itemDef.damage} dmg` : `${itemDef.damage} dmg`;
    }
    return itemDef.description || '';
}
