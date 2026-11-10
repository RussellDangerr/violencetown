# IN1 — Interaction rules

## Goal
A table of rows, "carry this, in this zone, and this happens, with a note". `game/interactions.js`
holds the rows and a few small pure helpers. `main.js` checks them when a zone is entered and after
each world beat. A row's first firing shows its note once, in the log, in its own colour, and
remembers it in the save. Remembered notes are listed on a new Remoticon tab so they can be reread.

The module ships with no real row, so nothing a player can meet changes yet. FD1 adds the first row;
each later idea is one row.

## Row shape
`{ id, carry: <item id>, zone: <map url>, effect(game) (optional), note: '[TEXT]' }`

## Rulings
- INR1, pick b (Caelan): a log line in its own colour, and the first time each one happens it is kept
  in a list you can reread on the Remoticon. Cost: a new device tab and its name.

## Acceptance
1. A test row fires when its item is carried into its zone, shows its note once, and is not shown
   again after a reload.
2. A row never fires in a zone it does not name.
3. Evidence: none possible until FD1 adds a row (UNSEEN).
4. npm test, balance:check, naming grep and autoplay:check pass.

## Details
- Save field `interactionNotes` (list of row ids) sits in `player`, left out while empty so the
  autoplay fingerprint does not move. New game and restart clear it.
- Log colour: a new log category `note`, drawn with an existing palette colour.
- The tab id is `notes`; its label is a `[TEXT]` placeholder. When empty it shows a `[TEXT]` line.
- A test pinning the tab list is edited in its own commit (the card requires the new tab).

## Out of scope
Any real row, any real copy or tab name (FD1 and Caelan), art.
