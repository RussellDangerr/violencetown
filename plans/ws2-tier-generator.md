# WS2 — the tier generator

## Goal

One base weapon makes five tiered copies of itself: grey, green, blue, purple and orange, the same
colour ladder the game already uses for value (`VALUE_TIERS` in `game/items.js`). The copies are
generated, not written by hand, so every weapon class gets its five tiers from one base definition
instead of dozens of hand-kept items.

What a tier changes follows the ruling: **more perks, not bigger numbers.** A blue axe does what a
grey axe does, plus effects. No tier raises damage, reach, value or any other number.

Nothing a player sees changes in this slice. The generated weapons stay out of the world: they are
not in `WEAPONS` or `ITEMS`, no map places them, and no shop stocks them.

## Acceptance checks

- Every class in `WEAPON_CLASSES` yields exactly five tier items, one per tier, in ladder order,
  all made from that class's one base definition.
- Every number on a tier item equals the number on its base. The only things a tier adds are its
  tier key and its perk slots, and each tier up has one more perk slot than the tier below
  (grey has none, orange has four).
- Each tier item's tier colour is the tier it was made for (`itemTier` reads its explicit `tier`).
- The same generator works on any existing weapon (the wooden sword, the pipe) without changing it.
- No existing item changes id or behaviour: `WEAPONS` and `ITEMS` hold the same ids as before, the
  wooden sword, ray gun, fearmur, gator tail, lion whip and pipe are untouched, and no generated
  id resolves as a world item or appears in any map.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass; the goldens do not move.

## Rulings this rests on

- **The weapon class table (WS1, merged):** 18 classes. The generator runs over whatever classes
  `WEAPON_CLASSES` holds.
- **What a tier changes:** more perks, not bigger numbers. Horizontal progression.

## How it is built

- `weaponTiers(base)` in `game/weapons.js` returns five frozen defs. Each is a deep copy of the
  base with a new id (`<base id>_<tier key>`), an explicit `tier`, a bracketed placeholder name,
  and `perks`: the base's own perks plus one placeholder slot per tier step.
- `classBase(classId)` is the one base definition per class: its class, the weapon slot, and a
  bracketed placeholder name. It carries no damage number: that is tuning and is not ruled.
- `WEAPON_TIERS` maps each class id to its five generated defs.

## Out of scope

- Which perk fills which slot. Every slot is the placeholder `[PERK]` until that is ruled.
- Real names for generated weapons, their damage, their price, and their icon tint.
- Placing any generated weapon in the world, a shop or a drop table.
- Anything a player sees or does.
