# CH1 — a chest you emptied stays empty when you come back to the zone

## Goal
`_loadMap` rebuilds every container from the map JSON, so leaving a zone and coming back refills
any chest you had emptied. A Poition in a chest could be farmed by walking out and back. Containers
should remember what is in them, the way ground items remember being taken (`_collectedItems`).

## How
- `game._chestRecords`: `"mapUrl" -> [{ id, type, x, y, contents }]`. Written by `_rememberChests`
  on every real zone change (called from `_zoneChange`, which already runs just before `_loadMap`
  and never on a save restore or a new game). Only containers that differ from the map's own
  spawn are kept: one that was taken from or deposited into, and any container the map never had
  (the robbery stash).
- `_loadMap` builds containers from the map as before, then lets a record for that map win.
- `save.js` writes `world.chestRecords` and restores it. Like `skillsEntry`, the field is left out
  of the save while empty, so a run that touches no chest saves exactly as before.
- A chest you only partly emptied keeps what you left in it; a chest something was put into keeps
  what it holds.

## Acceptance
- Empty a chest, leave the zone, come back: still empty (Sewer chest, Factory locker).
- Part-emptied chest keeps the rest; a deposited item is still there after a zone change.
- Survives save and load, and a load followed by a zone change.
- No record and no `chestRecords` key in the save while no chest has been touched.
- Test takes from a chest and changes zone with real keys.
- npm test, balance:check, naming grep, autoplay:check pass; autoplay golden untouched.

## Rulings
None. A defect with no name, copy or number in it.

## Out of scope
- Chests refilling on a timer or by a new run (a new game clears the records).
- Any change to what chests hold, or to the chest art.
- `npc.js` (soap-mine workers still deposit through the same contents array).
