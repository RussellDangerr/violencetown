# GH1: an old character that turned on you fights you

## Goal
Your kept snapshot (BN1/BN2) can stand up as an enemy. If its attitude toward you is "foe"
(BNR2 a: harm done), it fights you, but only in the Graveyard (GHR2 c). A friend or neutral
stays where BN2 put it, in Town, and a foe no longer stands in Town.

## Acceptance
- A foe snapshot spawns hostile at a Graveyard spot; a friend stays friendly in Town.
- Its HP is the snapshot's max HP; it wears the snapshot's gear; beating it drops one of those items.
- No snapshot: no ghost, nothing errors.
- Screenshot at 3440x1440 of the fight.
- npm test, balance:check, naming grep, autoplay:check pass.

## Rests on
- GHR2 (c): fought only in the Graveyard. BNR2 (a): friend or foe by how you played. BNR3 (a): pale tint.
- Lazy: worked out when the map loads, never tracked while away.

## How
- `ECHO_SLOTS` gets a Graveyard entry; each echo slot says which attitudes it shows.
- `echoStands(slot, snap)` decides; `_echoEnemies` in main.js uses it. Still not in SLOTS, so no picks, balance or golden move.
- A foe's HP is `snap.maxHp`; one worn item moves to its loadout so killing it drops that item.
- Placeholders: damage reuses the existing mob damage; all text is [TEXT].

## Out of scope
New names, copy, tuning, a bag in the snapshot (it stores gear only), art beyond the existing tint.
