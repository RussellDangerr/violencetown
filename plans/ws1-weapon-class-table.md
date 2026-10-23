# WS1 — the weapon class table

## Goal

Give the game one table of weapon classes. Each class says how many hands it takes (1 or 2) and
which kinds of hit it lands (slash, stab, crush). Every weapon that exists today points at one
class. Nothing a player sees or does changes in this slice: the table is data that later slices
read (the splat per hit kind, two-handed grips, a class's base kit).

## Acceptance checks

- Every ruled class exists in the table, with `hands` of 1 or 2 and at least one attack kind.
- Every weapon in `game/weapons.js`, and every weapon-slot item in `game/items.js` (the pipe),
  names a class that is in the table.
- Nothing in play changes: `npm test`, `balance:check`, the naming grep and `autoplay:check` all
  pass, and the autoplay golden does not move.

## Rulings this rests on

- **Which classes are in** — both lists are classes: shield, axe, sword, dagger, hammer, great
  sword, battle axe, war hammer, book, bell, whip, fist, doll, plus wand, staff, grimoire,
  throwing axe and frying pan. Book and grimoire are one class. Shield counts once.
- **Which take both hands** — great sword, battle axe and war hammer. Everything else is
  one-handed.
- **The doll** — a voodoo doll: it hurts the target from range.
- **The fist** — two classes: knuckles crush, claws slash.

## How it is built

- `WEAPON_CLASSES` in `game/weapons.js`: one entry per class id, `{ id, hands, attackKinds, kit }`.
  Ids are internal and lower-case; no player-facing name is written here.
- `ATTACK_KINDS` lists the three hit kinds; every class's kinds come from it.
- Each weapon def gains `weaponClass: '<id>'`. `weaponClassOf(def)` returns the class or null.
- `kit` is an empty list on every class for now. What a class's base kit holds is not ruled yet.

## Out of scope

- Any change to damage, reach, hands-in-play, or what the player sees.
- A class's base kit contents, player-facing class names, and the per-kind splat art (WS4).
- New weapons for the classes nothing uses yet.
