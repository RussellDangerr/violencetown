// items.js — Item definitions and use-phase resolution
// Sewer demo prototype
//
// All items are equippable. Each has an equipSlot and an optional duration.
// When equipped with a duration, the item occupies the slot for N turns,
// then the previously equipped item in that slot is restored.

export const ITEMS = {
    rock: {
        id: 'rock',
        name: '[Rock]',
        description: 'A heavy chunk of sewer masonry. Better thrown than held.',
        useType: 'throw',
        equipSlot: 'sides',
        range: 4,
        damage: 15,
        consumable: true,
        fallbackColor: '#888888',
        baseValue: 2,
    },
    soap: {
        id: 'soap',
        name: '[Soap]',
        description: 'Industrial-grade lye bar. Cuts through sludge. The Sewer\'s most valuable commodity.',
        equipSlot: 'back',
        equipDuration: 3,
        useType: 'self',
        effect: 'cure_sludge',
        consumable: true,
        fallbackColor: '#aaaaff',
        baseValue: 15,
    },
    pipe: {
        id: 'pipe',
        name: '[Pipe]',
        description: 'Rusty copper pipe, wrenched free from the wall. Swings like it means it.',
        equipSlot: 'weapon',
        useType: 'melee',
        range: 1,
        damage: 12,
        consumable: false,
        fallbackColor: '#666666',
        baseValue: 8,
    },
    bandage: {
        id: 'bandage',
        name: '[Bandage]',
        description: 'Torn fabric strip, reasonably clean. Stops the bleeding, not the pain.',
        equipSlot: 'front',
        equipDuration: 2,
        useType: 'self',
        effect: 'heal',
        healAmount: 25,
        consumable: true,
        fallbackColor: '#ffaaaa',
        baseValue: 10,
    },

    // ── Ambro (food — healing) ──────────────────────────────────────────────
    boardwalk_burger: {
        id: 'boardwalk_burger',
        name: '[Boardwalk Burger]',
        description: 'Jersey\'s house special. Grease-soaked, overcooked, perfect.',
        category: 'ambro',
        useType: 'self',
        effect: 'heal',
        healAmount: 15,
        consumable: true,
        fallbackColor: '#cc8844',
        baseValue: 5,
    },
    mystery_meat: {
        id: 'mystery_meat',
        name: '[Mystery Meat]',
        description: 'Found in the Sewer. Don\'t ask what it was. Heals more than it should.',
        category: 'ambro',
        useType: 'self',
        effect: 'heal',
        healAmount: 20,
        consumable: true,
        fallbackColor: '#884444',
        baseValue: 3,
    },
    tunnel_mushroom: {
        id: 'tunnel_mushroom',
        name: '[Tunnel Mushroom]',
        description: 'Grows where the sludge doesn\'t reach. Tastes like dirt and hope.',
        category: 'ambro',
        useType: 'self',
        effect: 'heal',
        healAmount: 10,
        consumable: true,
        fallbackColor: '#997755',
        baseValue: 2,
    },
    hot_dog: {
        id: 'hot_dog',
        name: '[Hot Dog]',
        description: 'Boardwalk classic. Been on the roller since this morning. Maybe yesterday.',
        category: 'ambro',
        useType: 'self',
        effect: 'heal',
        healAmount: 12,
        consumable: true,
        fallbackColor: '#cc6633',
        baseValue: 3,
    },

    // ── Quest items ───────────────────────────────────────────────────────────
    // questItem: true blocks throw/smash/give so it can't be lost. The malaprop
    // ("Cataclysmic") is intentional — it's how the delivery boy says it.
    catalytic_converter: {
        id: 'catalytic_converter',
        name: '[Cataclysmic Converter]',
        description: 'The thingamajig that makes the car go. Rat people tore it clean out. Smells like grease and betrayal.',
        category: 'quest',
        useType: 'none',
        consumable: false,
        questItem: true,
        fallbackColor: '#9a8a6a',
        baseValue: 0,
    },
};

// Equip an item into its slot. Returns a log message.
// If the slot is occupied, the old item is stored as a pending restore.
export function equipItem(game, itemDef) {
    const slot = itemDef.equipSlot;
    if (!slot) return null;

    const old = game.equipment[slot];

    // If this item has a duration, set up the temporary equip
    if (itemDef.equipDuration) {
        // If a temp-equip already holds this slot, drop it and inherit its
        // previousItem so the restore chain points at the REAL underlying
        // item, not the soon-to-expire temp one. Without this, two same-slot
        // temp equips (e.g. two soaps) corrupt the slot on expiry. Re-applying
        // effectively refreshes the duration.
        const existingIdx = game.tempEquips.findIndex(te => te.slot === slot);
        let underlying = old;
        if (existingIdx >= 0) {
            underlying = game.tempEquips[existingIdx].previousItem;
            game.tempEquips.splice(existingIdx, 1);
        }
        game.tempEquips.push({
            slot,
            itemDef,
            turnsLeft: itemDef.equipDuration,
            previousItem: underlying,
        });
        game.equipment[slot] = itemDef;
        return old
            ? `[${itemDef.name} equipped to ${slot} for ${itemDef.equipDuration} turns — ${old.name} removed]`
            : `[${itemDef.name} equipped to ${slot} for ${itemDef.equipDuration} turns]`;
    }

    // Permanent equip (like pipe → weapon slot)
    game.equipment[slot] = itemDef;
    return old
        ? `[${itemDef.name} equipped to ${slot} — replaced ${old.name}]`
        : `[${itemDef.name} equipped to ${slot}]`;
}

// Called each turn during enemy resolution to tick down temp equips
export function tickTempEquips(game) {
    const messages = [];
    const still = [];

    for (const te of game.tempEquips) {
        te.turnsLeft--;
        if (te.turnsLeft <= 0) {
            // Restore previous item
            game.equipment[te.slot] = te.previousItem;
            messages.push(te.previousItem
                ? `[${te.itemDef.name} expired — ${te.previousItem.name} re-equipped to ${te.slot}]`
                : `[${te.itemDef.name} expired — ${te.slot} slot empty]`
            );
        } else {
            still.push(te);
        }
    }

    game.tempEquips = still;
    return messages;
}

// Resolve a Use action. Returns a log message string.
// stackCount: how many items are in the stack (for throw damage calc)
export function resolveUse(game, itemDef, direction, stackCount = 1) {
    if (!itemDef) return null;

    switch (itemDef.useType) {
        case 'self':
            return resolveSelfUse(game, itemDef);
        case 'throw':
            return resolveThrow(game, itemDef, direction, stackCount);
        case 'melee':
            return resolveMelee(game, itemDef, direction);
        default:
            return `[Used ${itemDef.name}]`;
    }
}

function resolveSelfUse(game, itemDef) {
    // Equip into slot (with duration if applicable)
    const equipMsg = equipItem(game, itemDef);

    if (itemDef.effect === 'cure_sludge') {
        // Soap is tracked via _soapUsedThisTurn in main.js
        // It cancels sludge at end of resolution without harm
        if (game.hasBuff && game.hasBuff('sludge')) {
            return equipMsg
                ? `${equipMsg} [Soap applied — sludge will be neutralized]`
                : `[Used ${itemDef.name} — sludge will be neutralized]`;
        }
        return equipMsg
            ? `${equipMsg} [Already clean]`
            : `[Used ${itemDef.name} — already clean]`;
    }

    if (itemDef.effect === 'heal') {
        const before = game.playerHp;
        game.playerHp = Math.min(game.playerMaxHp, game.playerHp + itemDef.healAmount);
        const healed = game.playerHp - before;
        if (healed > 0 && game._spawnDamageNumber) {
            game._spawnDamageNumber(game.playerX, game.playerY, `+${healed}`, '#44ff88', 16);
        }
        const verb = itemDef.category === 'ambro' ? 'Ate' : 'Used';
        return equipMsg
            ? `${equipMsg} [Healed ${healed} HP]`
            : `[${verb} ${itemDef.name} — healed ${healed} HP]`;
    }

    return equipMsg || `[Used ${itemDef.name}]`;
}

// stackCount is passed from main.js — damage = 10 per item in stack.
// Exported so the Throw action ALWAYS throws (main.js _doThrow calls this
// directly) regardless of the item's useType — routing throw through resolveUse
// made consumable 'self' items heal-and-vanish and silently dropped the throw.
export function resolveThrow(game, itemDef, direction, stackCount = 1) {
    if (!direction) return `[Throw ${itemDef.name} — no direction]`;

    const DAMAGE_PER_ITEM = 10;
    const totalDamage = DAMAGE_PER_ITEM * stackCount;

    // Now that ANY non-quest item is throwable, items defined as non-throwers
    // (the 'self' consumables — burger, bandage, soap) carry no `range`. Give
    // them a sane default reach (rock's range) so a thrown heal item can
    // actually connect instead of always whiffing. (fix/critical-path)
    const DEFAULT_THROW_RANGE = 4;
    const range = itemDef.range || DEFAULT_THROW_RANGE;

    const { dx, dy } = direction;
    let tx = game.playerX;
    let ty = game.playerY;

    for (let i = 0; i < range; i++) {
        tx += dx;
        ty += dy;

        if (!game.map.isWalkable(tx, ty)) {
            return `[Threw ${itemDef.name} x${stackCount} — hit a wall]`;
        }

        const hit = game.enemies.find(e => e.entity.isAlive() && e.x === tx && e.y === ty);
        if (hit) {
            const result = game.combatAttack(hit, totalDamage);
            return `[Threw ${itemDef.name} x${stackCount} (${totalDamage} dmg) at ${hit.entity.name} — ${result}]`;
        }
    }

    return `[Threw ${itemDef.name} x${stackCount} — missed]`;
}

function resolveMelee(game, itemDef, direction) {
    if (!direction) return `[Swing ${itemDef.name} — no direction]`;

    const { dx, dy } = direction;
    const tx = game.playerX + dx;
    const ty = game.playerY + dy;

    const hit = game.enemies.find(e => e.entity.isAlive() && e.x === tx && e.y === ty);
    if (hit) {
        const result = game.combatAttack(hit, itemDef.damage);
        return `[Hit ${hit.entity.name} with ${itemDef.name} — ${result}]`;
    }

    return `[Swung ${itemDef.name} — nothing there]`;
}
