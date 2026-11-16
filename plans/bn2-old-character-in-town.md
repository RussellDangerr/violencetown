# BN2 - your old character appears in Town

**Parent:** `plans/slot-registry.md` (a new character slot), BN1 (the kept snapshots in `game/bones.js`).

## Goal

After a Restart, the next game shows a figure in Town that is your old character: your own sprite
tinted pale like a ghost (BNR3 a), wearing the gear the snapshot recorded, and treating you by how
you played it (BNR2 a): one who was kind to people is peaceful and friendly, one who did harm is
a fight. It talks with `[TEXT]` barks. With no snapshot, Town is exactly as it is today.

## How

- `game/slots.js`: a new slot `town.echo` (kind `echo`) on `town-map.json`, one pool entry
  `old_self`. An echo slot is **not an anchor pick**: `pickSlots` and `defaultPicks` skip it, so
  the saved `slots` object, the seed's stream and the autoplay fingerprint do not move.
  `echoSpawn(spawn, snapshot)` builds the NPC from a snapshot, or returns null when there is none.
  It never fills a Locked character's seat (it has its own spot and spawn id) and strips every
  required drop and quest item from the gear it carries.
- `game/bones.js`: the snapshot also records two small facts from the run (the best disposition
  anyone showed, and how many people it harmed: mugged, robbed, killed). `attitudeOf(snapshot)`
  maps them to `foe` / `friend` / `neutral`. Old snapshots without them read as `neutral`.
- `game/town-map.json`: one spawn `{ id, slot: "town.echo", x, y }`.
- `game/main.js`: `_loadMap` hands an echo-slot spawn the newest snapshot; none, no spawn.
- `game/sprites.js`: a pale tinted sheet and an `Old Self` sprite on the player's cell.

## Acceptance checks

1. With a snapshot, a new game's Town holds the old character, tinted pale, in its old gear.
2. With none, Town's enemy list is exactly today's.
3. Attitude: harm done -> hostile; otherwise good disposition -> friendly; else peaceful neutral.
4. A screenshot at 3440x1440 of meeting it.
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass; the golden is untouched.

## Rulings

- BNR2 a: attitude by its last disposition and deeds.
- BNR3 a: your sprite, one pale tint.

## Out of scope

Barks and name are `[TEXT]` placeholders; the friend does not join your party (it is peaceful and
friendly only); no loot from it beyond what any NPC drops; no choice between the three snapshots
(the newest is used); the thresholds in the attitude rule are placeholders for Caelan to set.
