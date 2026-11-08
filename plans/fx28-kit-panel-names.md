# FX28 — the fight's target panel names every piece of an enemy's kit

## Goal

In a fight, the right-hand panel lists what the enemy carries, by name. It looked each id up
in `ITEMS` only, so a weapon in a loadout (the Alien's Ray Gun) fell through and the panel
printed its raw id. The panel should resolve ids the same way the rest of the game does:
weapons first, then items (`resolveItemDef` in `game/item-registry.js`).

## Acceptance

- The Alien's panel reads the Ray Gun's name, not its raw id.
- A test walks every enemy spawn on every map, including spawns filled from the slot
  registry (every entry in every slot's pool, and every hand-placed `entry`), plus every
  registry entry on its own, and finds no kit row whose name is its raw id.
- Evidence: a 3440x1440 crop of the Alien's panel, with the fight opened by a real bump.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

None. No name, copy or number is chosen here: the panel shows the name a weapon already has.

## Out of scope

- The renderer and the panel's look.
- The `equipped` list (the panel does not show it).
- Any new name for a weapon or item.
