// zone-haul.js — what a zone's enemies and chests can give a player who clears it,
// priced at one trader's disposition. A floor, built so a test that leans on it
// cannot be flattered by a bot's luck or by anything the game takes back.
// (plans/ek1-hurt-enemy-uses-kit.md, ruling EK1R1; the rope will reuse it.)
//
// What is counted, and what is left out on purpose:
//
//   PURSES  Gold an enemy dies holding. Left out: a boss's purse (it spends the
//           whole thing healing itself, ai.js bossSpend), any other purse big enough
//           to buy a heal (>= HEAL_MIN_GOLD), and anyone who does not fight (a
//           townsperson or vendor is not a kill). Each spawn is read once, so one
//           kill is one purse.
//   KIT     Items an enemy dies carrying, sold at sellPrice. Left out: the piece it
//           wears (gone with it, TG1R2), and anything a hurt enemy can use up
//           (a heal, a Defence Poition, an armour piece, a poison it throws), since a
//           long fight can spend all of it. What is left is only what no kit rule
//           ever touches. Quest items have no sell price and add nothing.
//   CHESTS  A chest's authored contents, sold at sellPrice, once each (a chest stays
//           empty once opened). Chests the caller names as gated are listed but not
//           added (one that needs a fire to reach is not on the plain route). Items
//           an enemy later deposits are floor items, not chest contents, so they are
//           not counted here either.
//
// Floor pickups are not counted: this is the enemies and the chests, as ruled.
import { readFileSync } from 'node:fs';
import { resolveItemDef } from '../../game/item-registry.js';
import { sellPrice } from '../../game/trade.js';
import { spawnEnemy } from '../../game/enemies.js';
import { resolveSpawn } from '../../game/slots.js';
import { HEAL_MIN_GOLD } from '../../game/ai.js';
import { kitHealValue, kitDefenceValue, kitGearWeight } from '../../game/items.js';

export function loadMap(file) {
    return JSON.parse(readFileSync(new URL(`../../game/${file}`, import.meta.url), 'utf8'));
}

// Could a hurt enemy use this up, so a long fight leaves it nowhere to drop?
function usableByEnemy(def, sewerDweller) {
    return kitHealValue(def, sewerDweller) > 0
        || kitDefenceValue(def) > 0
        || kitGearWeight(def) > 0
        || !!def.enemyThrows;
}

// map: a parsed map JSON. disposition: the trader's. opts.gatedChests: chest ids
// that are listed in `notCounted` instead of added. Returns the total and each
// part with its lines, so a failure message can show the working.
export function zoneHaul(map, disposition, { gatedChests = [] } = {}) {
    const purses = { total: 0, lines: [] };
    const kit = { total: 0, lines: [] };
    const chests = { total: 0, lines: [] };
    const notCounted = [];

    for (const spawn of map.enemies ?? []) {
        const e = spawnEnemy(resolveSpawn(spawn, {}), null);
        const who = `${e.id} (${e.type})`;
        if (!((e.damage ?? 0) > 0)) { notCounted.push(`${who}: does not fight`); continue; }

        const gold = e.gold ?? 0;
        if (e.boss) { if (gold) notCounted.push(`${who}: boss, ${gold} gp spent on healing`); }
        else if (gold >= HEAL_MIN_GOLD) notCounted.push(`${who}: ${gold} gp can buy a heal`);
        else if (gold > 0) { purses.total += gold; purses.lines.push(`${who} ${gold} gp`); }

        for (const id of e.loadout ?? []) {
            const def = resolveItemDef(id);
            if (!def) continue;
            if (usableByEnemy(def, !!e.sewerDweller)) continue;
            const price = sellPrice(def, disposition) ?? 0;
            if (price > 0) { kit.total += price; kit.lines.push(`${who} ${id} ${price} gp`); }
        }
    }

    for (const c of map.containers ?? []) {
        const value = (c.contents ?? []).reduce((sum, id) => {
            const def = resolveItemDef(typeof id === 'string' ? id : id?.type);
            return sum + (def ? sellPrice(def, disposition) ?? 0 : 0);
        }, 0);
        if (gatedChests.includes(c.id)) { notCounted.push(`chest ${c.id}: gated, ${value} gp`); continue; }
        if (value > 0) { chests.total += value; chests.lines.push(`chest ${c.id} ${value} gp`); }
    }

    return { purses, kit, chests, notCounted, total: purses.total + kit.total + chests.total };
}

// One line for a failure message: the three parts and their sum.
export function describeHaul(h) {
    return `purses ${h.purses.total} gp [${h.purses.lines.join('; ')}], `
        + `kit ${h.kit.total} gp [${h.kit.lines.join('; ')}], `
        + `chests ${h.chests.total} gp [${h.chests.lines.join('; ')}], `
        + `${h.total} gp in all`;
}
