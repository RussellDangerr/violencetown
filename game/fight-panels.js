// fight-panels.js — what the two panels in a fight say (plans/combat-hud.md
// stage 4). Pure: game data in, plain objects out, node-testable like
// fight-area.js. The renderer draws these; layout.js places them.
//
// Two panels, not one, and NOT mirror images (rulings H1-4 and the shape
// question, 2026-09-19).
//
// Caelan's reasoning for showing your own gear at all: "everything is so
// nebulous that you would always want to see your inventory in there at the
// same time, so that you're not swapping out weapons and things. Even in the
// deepest RPGs you're not swapping out equipment per fight. D&D specifically
// guards against that." The panel exists so you never feel the need to go and
// check — so it carries NO action. Nothing here may equip, and the tests assert
// the data has no verb in it.
//
// Why the two sides look different: you have six named body slots; an enemy has
// a flat `loadout` array and a `gold` number. There is no HEAD/TORSO breakdown
// on their side to show. Faking one would invent structure the game does not
// have and would read as mostly-empty slots on most enemies, so their panel is
// an honest list of what they carry.

import { ITEMS } from './items.js';

// The player's body slots, in the order the panel lists them. Fixed so the
// panel's shape never changes mid-fight — an empty slot is still a row, because
// a panel that reflows as you lose a hat is a panel you cannot read at a glance.
export const SLOT_ORDER = ['weapon', 'top', 'sides', 'front', 'back', 'bottom'];
const SLOT_LABEL = {
    weapon: 'WEAPON', top: 'HEAD', sides: 'ARMS',
    front: 'TORSO', back: 'BACK', bottom: 'FEET',
};

const itemName = (id) => (ITEMS[id] && ITEMS[id].name) || id;

// The left panel: what you are wearing and wielding. Read-only by construction.
export function playerPanel(game) {
    const eq = (game && game.equipment) || {};
    return {
        slots: SLOT_ORDER.map((key) => ({
            key,
            label: SLOT_LABEL[key],
            name: (eq[key] && eq[key].name) || null,
            id: (eq[key] && eq[key].id) || null,
        })),
    };
}

// The three theft questions, asked of one victim. main.canThieve asks the same
// three of every adjacent enemy; both now read from here, so the wheel's grey
// slices and the panel's markers can never disagree about what is takeable.
export function takeable(victim) {
    const no = { coin: false, kit: false, gear: false };
    if (!victim || victim.thievable === false) return no;
    return {
        coin: (victim.gold ?? 0) > 0,
        kit: (victim.loadout ?? []).length > 0,
        gear: (victim.equipped ?? []).length > 0,
    };
}

// The right panel: who you are fighting, what they have, and what you could
// take. HP as digits, kit by name — precision is what the player is planning
// against, and "3 items" does not tell you whether robbing them is worth it.
export function targetPanel(victim) {
    if (!victim) return null;
    const ent = victim.entity || {};
    return {
        name: victim.type || 'Something',
        hp: ent.hp ?? 0,
        maxHp: ent.maxHp ?? 0,
        armor: ent.armor ?? 0,
        gold: victim.gold ?? 0,
        kit: (victim.loadout ?? []).map((id) => ({ id, name: itemName(id) })),
        takeable: takeable(victim),
    };
}

// Who the right panel is about: the enemy under the reticle while you are
// aiming, so the panel follows what you are about to hit; otherwise the nearest
// fighter. Only real fighters count — an ambient Violencian standing next to a
// brawl is not in it, the same rule fight-area.js draws the fog from.
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const isFighter = (e) => !!e && !e.ambient && !e._ally && !!e.entity?.isAlive?.()
    && (e.state === 'chasing' || e.state === 'searching');

export function panelTarget(game) {
    const enemies = (game && game.enemies) || [];
    const w = game && game.wheel;
    if (w && w.aiming && w.reticle) {
        const aimed = enemies.find((e) => isFighter(e) && e.x === w.reticle.x && e.y === w.reticle.y);
        if (aimed) return aimed;
    }
    let best = null, bestD = Infinity;
    for (const e of enemies) {
        if (!isFighter(e)) continue;
        const d = cheb(e.x, e.y, game.playerX, game.playerY);
        if (d < bestD) { bestD = d; best = e; }
    }
    return best;
}
