# FX22 — a table of tiered armor the game can read

## Goal

WS5 proved every armor piece makes five tiers from the weapon tier generator, but only the test
ran it: `game/items.js` cannot import the generator, so the game had no table to read. This slice
adds `ARMOR_TIERS` to `game/weapons.js`, beside `WEAPON_TIERS`: for every armor piece in
`ARMOR_IDS`, its five tiers, grey to orange, made by `weaponTiers`. A later slice reads it to
place tiered armor.

Nothing on screen changes. The table is data only; nothing in the world places, sells or drops a
tier.

## Acceptance checks

- `game/weapons.js` exports `ARMOR_TIERS`, keyed by armor piece id, with exactly the keys of
  `ARMOR_IDS`. Each entry is five frozen defs in ladder order, grey to orange.
- A test (`tests/armor-tier-table.test.js`) checks the table against the generator piece by
  piece: each entry deep-equals `weaponTiers(ITEMS[id])`. It also checks the table is frozen,
  non-empty, and that no tier in it is a world item.
- The balance and autoplay goldens do not move.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings and picks it rests on

- None of its own. It reuses WS2's rule unchanged (a tier adds perks, never bigger numbers; added
  perk slots are the `[PERK]` placeholder; names are bracketed placeholders), and WS5's armor set.
  It chooses no names, copy or numbers.

## How it is built

- `weapons.js` already imports from `items.js`, so it imports `ITEMS` and `ARMOR_IDS` too and runs
  the existing generator over them. No second generator; `items.js` is not changed.

## Out of scope

- Placing tiered armor in the world, a shop or a drop table.
- Real names, which perk fills a slot, prices, icon tints for tiers.
- Anything a player sees or does.
