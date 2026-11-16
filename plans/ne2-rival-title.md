# NE2: a rival shows a title on its name

## Goal
An enemy that beat you and was remembered (NE1, `game/rivals.js`) is promoted the next time you
enter its zone. From then on it goes by a title plus its type, on every surface that prints its
name: the over-head nameplate, the right-hand fight panel, the KO tag and the log. Entering the
zone logs one line. The title survives a save and load.

## Acceptance
- A rival's nameplate, fight panel, KO tag and log show the title; the same enemy before it was
  promoted, and every other enemy, show their plain type.
- Entering a zone that holds a rival logs one line, once per entry, not once per step.
- The title survives a save and load (the Enemy save shape carries a `rival` flag, written only when set).
- The test reaches the title through a real zone change (`tests/rival-title.test.js`).
- Evidence: a 3440x1440 frame of the nameplate and the panel on a rival.
- npm test, balance:check, naming grep and autoplay:check pass with no drift.

## Rulings it rests on
- NE1 (done): the enemy that beat you is remembered; promotion happens on re-entry, not at the defeat.

## How
- `shownName` (enemies.js) returns `<RIVAL_TITLE> <type>` for an enemy flagged `rival`.
- `Enemy.promoteToRival()` sets the flag and re-sets the entity name (fixed at construction).
- `_rivalArrived` (main.js) promotes the zone's rival and logs `RIVAL_RETURN_LINE`.
- Renderer: the over-head label reads `shownName` for a rival (the KO tag and panel already do).
- The title and the log line are two constants, both `[TEXT]` placeholders until the owner writes them.

## Out of scope
- Any real wording; giving a rival a personal name as well as a title (a later card).
- Changing what a rival carries or how the record is kept (NE1).
