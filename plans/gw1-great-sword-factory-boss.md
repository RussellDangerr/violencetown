# GW1 - one two-handed weapon is in the world

## Goal

The weapon ladder has no two-hander in it. Three two-handed classes exist
(`great_sword`, `battle_axe`, `war_hammer` in `game/weapons.js`) and the two-hands
rule already works (`game/items.js` `holdInHands`: a two-hander is the same def in
both hands, and a one-hander put in afterwards frees both). Nothing in `WEAPONS`
uses it. This slice puts one in.

## Rulings it rests on (Caelan's picks)

- GW1R1 (a): a Great Sword. It slashes and stabs like the sword, but takes both
  hands. The `great_sword` class already says exactly that.
- GW1R2 (a): the Factory's boss carries it. It drops when you win there and sits at
  the top of the weapon ladder. The Alien swings it at you too.
- GW1R3 (b): damage 20. Above the 16s, under the Ray Gun's 22.

## What gets built

- `WEAPONS.great_sword` in `game/weapons.js`: class `great_sword`, damage 20,
  equip slot `weapon`, bracket-placeholder name `[Great Sword]`.
- A picture for it in `game/sprites.js`. It borrows a sword cell from the Tiny
  Dungeon sheet (the broad-bladed one next to the Wooden Sword's), because
  `tests/weapon-art.test.js` forbids two weapons sharing one cell.
- `game/slots.js`: the `alien_invasion` entry only. `great_sword` goes into his
  loadout (so it drops when he falls) and into his worn gear in place of the
  Wooden Sword (so he swings it). No other boss's kit changes; the shared
  `placeholderBoss()` / `act2Boss()` blocks are untouched.
- `tests/two-hander-in-world.test.js`: the real main.js kill path drops it at the
  Factory, the real key picks it up, the real GEAR/bag input wields it, both
  hands hold it, and wielding a one-hander afterwards frees both.
- `tests/act2-boss-numbers.test.js`: the Alien's pins move, in their own commit.

## Acceptance

1. `WEAPONS.great_sword` exists, damage 20, class `great_sword`, and the Alien's
   kit holds it.
2. A player gets it with real keys and wields it; both hands then hold it and the
   left-hand plate shows it.
3. Wielding a one-hander afterwards frees both hands.
4. A test drives real input from getting it to wielding it.
5. Evidence: a 3440x1440 frame of GEAR with it wielded.
6. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Out of scope

- The name, the description text and the final picture: all placeholders.
- The other two-handed classes (battle axe, war hammer).
- Any other boss's kit, and the Alien's own damage number (still 14, EP1R1).
- Goldens: `balance:write` and `autoplay:write` are not run here.
