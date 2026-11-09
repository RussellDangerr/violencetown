# NM1: a one-time talk choice you used stays used across zones

## Goal
A one-time talk choice (a compliment, a stand-down) that you have spent stays spent when you walk
out of a zone and back in. Today `_loadMap` re-spawns every person from the map file, so the choice
can be paid again by hopping zones.

## What it does
- On leaving a zone, `_rememberSpentChoices` writes `_spentChoices[mapUrl] = { spawnId: [choiceId] }`
  for every person in that zone with spent choices. A zone with none drops its entry.
- `_loadMap` re-applies the record to the freshly spawned people by spawn id.
- The record rides in the save as `world.spentChoices`, left out while empty; an old save loads
  with nothing spent.
- Mood is not kept: it resets as today (ruling NM1R1, option a). Allies are not kept either.

## Acceptance
- Take Bartho's hat compliment, leave through Borgir's door and come back by real keys: the
  compliment is no longer offered.
- Same after saving in another zone and reloading.
- A zone where nobody spent a choice writes no record; a save without one loads clean.
- Per zone and per spawn id: the same choice on a person elsewhere is untouched.
- The test uses the real zone exit and `_loadMap`.

## Rulings
NM1R1, pick (a): only the one-time choices you already used.

## Out of scope
Mood, allies, the Ruffian's gold (BS2), any new words or numbers.
