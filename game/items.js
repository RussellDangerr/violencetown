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
        damageType: 'physical',
        consumable: true,
        fallbackColor: '#888888',
        baseValue: 2,
    },
    sludge_sack: {
        id: 'sludge_sack',
        name: '[Sludge Sack]',
        description: 'A burlap sack cinched with a leather tie, heavy with sewer sludge. Bursts on impact and splashes everything close.',
        useType: 'throw',
        equipSlot: 'sides',
        range: 5,
        damage: 16,
        damageType: 'sludge',
        consumable: true,
        fallbackColor: '#9a52c8',
        baseValue: 4,
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
        canJamDoors: true,   // (zone pursuit) Use it to wedge the door you came through shut
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
        description: 'The thingamajig that makes the car go. Rat people tore it clean out. Smells like grease and betrayal. No ordinary merchant wants it — but Macc pays.',
        category: 'quest',
        useType: 'none',
        consumable: false,
        questItem: true,
        // (Phase 6d) An ORANGE tier despite baseValue 0: worthless to ordinary
        // merchants, but a legendary find to the one buyer who wants it (Macc,
        // 500 GP). The tier + the special buyer are how "this has a special use"
        // reads without a segregated quest-item tab.
        tier: 'orange',
        fallbackColor: '#9a8a6a',
        baseValue: 0,
    },

    // ── Special / mechanic-shop stock (Phase 6d) ──────────────────────────────
    // Macc the raccoon mechanic sells the chain. Its canyon rappel-route effect
    // is wired on the chapter-two canyon branch (not on dev yet) — here it's an
    // ordinary ownable item whose description teaches the route.
    chain: {
        id: 'chain',
        name: '[Rappel Chain]',
        description: 'A coil of greasy tow-chain off Macc\'s wall. "Bolt it to the canyon lip," he says, "and climb down like you got sense." A way into the gorge that isn\'t a crash.',
        useType: 'none',
        equipSlot: 'sides',
        consumable: false,
        tier: 'blue',
        fallbackColor: '#7a7a7a',
        baseValue: 40,
    },
};

// ── Value tiers (Phase 6d) ────────────────────────────────────────────────────
// A Borderlands-style rarity ladder that makes worth legible at a glance —
// examine text names the tier, the trade cell wears its colour. By default the
// tier is DERIVED from baseValue (so tier and price stay in sync — the tier is
// the visible face of the value that also sets the price); an item may override
// with an explicit `tier` when its worth isn't its ordinary-market value (the
// Converter: baseValue 0 to a merchant, but an Orange find to Macc).
export const VALUE_TIERS = [
    { key: 'grey',   name: 'Common',    color: '#9aa0a6', max: 3 },
    { key: 'green',  name: 'Uncommon',  color: '#4f9b4a', max: 9 },
    { key: 'blue',   name: 'Rare',      color: '#4a86c8', max: 24 },
    { key: 'purple', name: 'Epic',      color: '#9a52c8', max: 59 },
    { key: 'orange', name: 'Legendary', color: '#e08a2a', max: Infinity },
];

export function itemTier(itemDef) {
    if (!itemDef) return VALUE_TIERS[0];
    if (itemDef.tier) return VALUE_TIERS.find(t => t.key === itemDef.tier) || VALUE_TIERS[0];
    const v = itemDef.baseValue ?? 0;
    return VALUE_TIERS.find(t => v <= t.max) || VALUE_TIERS[VALUE_TIERS.length - 1];
}

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
        if (healed > 0 && game._spawnHitSplat) {
            game._spawnHitSplat(game.playerX, game.playerY, `+${healed}`, 'heal', { omni: true });
        }
        const verb = itemDef.category === 'ambro' ? 'Ate' : 'Used';
        return equipMsg
            ? `${equipMsg} [Healed ${healed} HP]`
            : `[${verb} ${itemDef.name} — healed ${healed} HP]`;
    }

    return equipMsg || `[Used ${itemDef.name}]`;
}

// (combat-feel-pass) Thrown items fly straight and BURST over a one-shot 3×3
// area centered on impact, applying the item's effect at HALF to every valid
// target — respect-the-target: damage hits hostiles only, heals touch
// friendlies only (latent until allies exist). Fully deterministic. Exported so
// the wheel's Throw always throws (routing through resolveUse used to make
// 'self' consumables heal-and-vanish and silently drop the throw).
export function resolveThrow(game, itemDef, direction, _stackCount = 1, targetTile = null) {
    const range = itemDef.range || 5; // match wheel-model aimRange's throw fallback (single default)
    let ix, iy, hitWall = false;

    if (targetTile) {
        // Real placement (wheel reticle): land on the chosen tile. A non-hostile on
        // this exact tile was deliberately chosen (the wheel routes offensive verbs
        // on a friendly through the Plus Ultra confirm) — allowCenterFriendly lets
        // the burst hit them (below).
        ix = targetTile.x; iy = targetTile.y;
        // Defensive range clamp (Chebyshev): the seed/nudge are range-clamped, but
        // a stale express-repeat tile (player moved) or any future caller must
        // never burst farther than the item's reach — fall the impact short.
        const dxt = ix - game.playerX, dyt = iy - game.playerY;
        if (Math.max(Math.abs(dxt), Math.abs(dyt)) > range) {
            ix = game.playerX + Math.max(-range, Math.min(range, dxt));
            iy = game.playerY + Math.max(-range, Math.min(range, dyt));
        }
    } else {
        // Legacy direction throw (hotbar / ITEM_THROW_DIR): fly straight, stop on
        // the first occupant (burst centred on it) or the last open tile.
        if (!direction) return `[Throw ${itemDef.name} — no direction]`;
        const { dx, dy } = direction;
        ix = game.playerX; iy = game.playerY;
        for (let i = 0; i < range; i++) {
            const nx = ix + dx, ny = iy + dy;
            if (!game.map.isWalkable(nx, ny)) { hitWall = true; break; }
            ix = nx; iy = ny;
            if (game.enemies.some(e => e.entity.isAlive() && e.x === ix && e.y === iy)) break;
        }
    }

    const dtype = itemDef.damageType || 'physical';
    const isDamage = typeof itemDef.damage === 'number';
    const isHeal = itemDef.effect === 'heal' && typeof itemDef.healAmount === 'number';
    const allowCenterFriendly = !!targetTile; // real placement implies the Plus Ultra gate already cleared
    let affected = 0;

    if (isDamage) {
        // 3×3 (radius 1) around impact, half effect. Bystander friendlies are
        // spared (hostile-only); the deliberately-aimed centre tile's occupant is
        // hit even if friendly (real-placement / Plus Ultra path only).
        for (const foe of game._entitiesInRadius(ix, iy, 1)) {
            const hostile = !foe.behavior || foe.behavior.includes('HOSTILE');
            const isCentre = foe.x === ix && foe.y === iy;
            if (hostile || (allowCenterFriendly && isCentre)) {
                game.combatAttack(foe, Math.max(1, Math.round(itemDef.damage / 2)), { type: dtype, omni: true });
                affected++;
            }
        }
    } else if (isHeal) {
        // Friendlies only — currently just the player (no allies in 1.0). Catches
        // the player if the impact lands within radius 1 of their tile.
        if (Math.abs(ix - game.playerX) <= 1 && Math.abs(iy - game.playerY) <= 1) {
            const before = game.playerHp;
            game.playerHp = Math.min(game.playerMaxHp, game.playerHp + Math.max(1, Math.round(itemDef.healAmount / 2)));
            const healed = game.playerHp - before;
            if (healed > 0) {
                if (game._spawnHitSplat) game._spawnHitSplat(game.playerX, game.playerY, `+${healed}`, 'heal', { omni: true });
                affected++;
            }
        }
    }

    if (isDamage) {
        if (affected > 0) return `[${itemDef.name} bursts — ${affected} caught in the splash]`;
        return hitWall ? `[${itemDef.name} splatters against the wall]` : `[Threw ${itemDef.name} — splashed no one]`;
    }
    if (isHeal) {
        return affected > 0 ? `[${itemDef.name} bursts in a healing splash]` : `[Threw ${itemDef.name} — no one to mend]`;
    }
    return `[Threw ${itemDef.name} — it shatters harmlessly]`;
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
