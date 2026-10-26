# WS5 — armor tiers from the same generator

## Goal

Every armor piece yields five tiered copies of itself, grey to orange, made by the same generator
the weapons use (`weaponTiers` in `game/weapons.js`, from WS2). There is no second generator for
armor: the armor set is named once in `game/items.js`, and the one generator runs over it.

A tier follows the same rule as a weapon tier: more perks, not bigger numbers. A purple foil hat
has the foil hat's armor, value and flags, plus three perk slots. No tier raises any number.

Nothing a player sees changes. The generated armor stays out of the world: it is not in `ITEMS`,
no map places it, no shop stocks it.

## Acceptance checks

- `game/items.js` names its armor pieces (`ARMOR_IDS`, and `isArmorPiece(def)`): the persistent
  wearables, i.e. `useType: 'equip'` in a body slot that is not the weapon slot. Today that is the
  foil hat, cardboard cuirass, latex gloves, red cape and shoe bags.
- Each armor piece, run through `weaponTiers`, yields exactly five items, one per tier in ladder
  order, each made from that piece. Each shows its own tier colour (`itemTier`).
- Every number on each tier is the piece's own (armor, value). The only fields a tier adds or
  changes are its id, name, tier, base id and perk slots. Each tier up has one more perk slot.
- No existing item changes: the five armor pieces keep their numbers and gain no tier or perks,
  and no generated armor id resolves as a world item or appears in any map.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass; no golden moves.

## Rulings this rests on

- **WS2, the tier generator (merged):** five tiers from the value ladder; a tier adds perks, never
  bigger numbers; every added slot is the `[PERK]` placeholder; names are bracketed placeholders.
  This slice reuses that rule unchanged. It chooses no new numbers.

## How it is built

- `ARMOR_IDS` and `isArmorPiece` in `game/items.js`. They are derived from the item data, so a new
  armor piece joins the set without a list to keep.
- The generator is not copied and not changed. `game/items.js` cannot import it: `weapons.js`
  already imports the value ladder from `items.js`, and the reverse import makes loading
  `items.js` first fail. So the armor tiers are generated where both are loaded (the test today).

## Out of scope

- A shared generated armor table the game reads (an `ARMOR_TIERS` next to `WEAPON_TIERS`). It
  needs a file outside this slice's scope.
- Which perk fills a slot, real names, prices, icon tints for tiers.
- Placing any generated armor in the world, a shop or a drop table.
- Anything a player sees or does.
