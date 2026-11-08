// fight-cost.js — what a boss fight costs the player in HP (plans/ep1-act2-boss-damage.md).
//
// A small headless fight. The boss is the real registry entry on its real map, turned
// into an Enemy by spawnEnemy. The player's swing goes through the game's own hit maths
// (computeHit, elementalMult, attack); the boss's turn is the real resolveEnemyTurns, so
// his kit (bandage, burger, Defence Poition, cuirass) and his purse (BOSS_HEAL_*) run as
// written, and his blow lands through the same sum applyDamageToPlayer uses: computeHit,
// then the worn armour soaks it, at least 1 gets through.
//
// Stand-ins are only what a fight does not need: drawing, sound, the log.

import { readFileSync } from 'node:fs';

import { GameMap } from '../../game/map.js';
import { spawnEnemy, resolveEnemyTurns } from '../../game/enemies.js';
import { resolveSpawn, defaultPicks } from '../../game/slots.js';
import { attack, computeHit, elementalMult, weaponHitKind } from '../../game/combat.js';
import { WEAPONS } from '../../game/weapons.js';
import { ITEMS } from '../../game/items.js';
import { RNG } from '../../game/rng.js';

const GAME = new URL('../../game/', import.meta.url);
const mapData = (file) => JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));

// The armour you would wear, by where you stand in the game (GP1R1 a): the Sewer gives three
// pieces; the gloves are bought in Downtown and the cuirass comes from Puck in the Factory.
export const SEWER_ARMOUR = ['foil_hat', 'shoe_bags', 'red_cape'];
export const ACT2_ARMOUR = [...SEWER_ARMOUR, 'latex_gloves', 'cardboard_cuirass'];

// The best weapon at each (GP2R1 a: the Gator Tail, the Lion Whip and the Fearmur all hit for 16).
export const SEWER_WEAPON = 'gator_tail';
export const ACT2_WEAPON = 'lion_whip';

// Armour is a flat sum of the worn pieces (main.js _playerArmor).
export const armourOf = (ids) => ids.reduce((sum, id) => {
    const piece = ITEMS[id];
    if (!piece || !piece.armor) throw new Error(`${id} is not an armour piece`);
    return sum + piece.armor;
}, 0);

// Fight one boss to the end. `slot` names the boss's place on its map (the spawn that
// carries it); `entry` is the registry entry that fills it. Returns the cost in HP, the
// turns it took, who won, and every blow the boss landed.
export function fightCost({ map, slot, entry, weapon, armour, seed = 7, maxTurns = 200 }) {
    const data = mapData(map);
    const spawn = data.enemies.find(e => e.slot === slot);
    if (!spawn) throw new Error(`no spawn for ${slot} on ${map}`);
    const picks = { ...defaultPicks(), [slot]: entry };
    const boss = spawnEnemy({ ...resolveSpawn(spawn, picks), facing: 'S' });
    const gear = WEAPONS[weapon];
    if (!gear) throw new Error(`${weapon} is not a weapon`);

    const worn = armourOf(armour);
    const player = { name: '[Player]', isDead: () => false };
    const blows = [];
    const g = {
        map: new GameMap(data, map), enemies: [boss], containers: [], groundItems: [],
        // Stood one tile south of him, where the Act 2 tests stand you: inside his reach.
        playerX: spawn.x, playerY: spawn.y + 1,
        playerHp: 100, playerMaxHp: 100,
        turn: 0, _MOVE_MS: 150, rng: new RNG(seed), gold: 0,
        logs: [],
        _log(m) { this.logs.push(m); },
        hasBuff: () => false,
        _spawnHitSplat() {}, _handleEnemyDeath() {}, _cascadeMark() {},
        applyDamageToPlayer(raw, attacker) {
            const landed = computeHit({ base: raw });
            if (landed === 0) return 0;
            const dealt = Math.max(1, landed - worn);   // main.js applyDamageToPlayer
            this.playerHp = Math.max(0, this.playerHp - dealt);
            blows.push({ by: attacker?.name ?? attacker?.type, raw, dealt });
            return dealt;
        },
    };

    let turns = 0;
    while (g.playerHp > 0 && boss.entity.isAlive() && turns < maxTurns) {
        turns++;
        g.turn = turns;
        // Your swing, as main.js combatAttack computes it.
        const kind = weaponHitKind(gear, boss);
        const hit = computeHit({ base: gear.damage, elemental: elementalMult(kind, boss), positional: 1 });
        if (hit > 0) attack(player, boss.entity, hit);
        if (!boss.entity.isAlive()) break;
        resolveEnemyTurns(g);
    }

    return {
        hpCost: 100 - g.playerHp,
        turns,
        won: !boss.entity.isAlive(),
        died: g.playerHp <= 0,
        blows,
        armour: worn,
        weaponDamage: gear.damage,
        bossDamage: boss.damage,
    };
}
