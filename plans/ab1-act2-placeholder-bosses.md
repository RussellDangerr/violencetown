# AB1 — a placeholder boss in each Act 2 zone

**Date:** 2026-10-22
**Parent:** `plans/spine.md` §1 (the Act 2 beats) and §2 (slots), `plans/slot-registry.md`.

## Goal

The Carnival, the Factory and the Graveyard each get one boss, standing in its own spine slot
(`carnival.boss`, `factory.boss`, `graveyard.boss`). Beating it drops that zone's required item.
Every name, picture and line on them is an obvious stand-in until Caelan names and draws them.

This is the slot registry doing what it was built for: each boss is one `ENTRIES` row, one
`SLOTS` row and one map spawn. The death handler already drops by slot, so `main.js` is not
touched.

## The shape

- `game/slots.js`
  - Three entries, one per slot, filled from the spine's first pool entry for that zone (Bigfoot,
    Alien Invasion, The Deity). They share one placeholder stat block: the Were-Rat's numbers
    as they stand today, the existing `Boss` sprite cell, and `[TEXT]` barks. No new tuning.
  - Three slots, each `kind: 'boss'`, on its own map, with a pool of one and its required item.
    No `dropLine`: the drop logs the handler's existing generic line.
- `game/items.js` — three quest items, `[ITEM A]` (Carnival), `[ITEM B]` (Factory) and `[ITEM C]`
  (Graveyard), shaped like the Converter (quest item, can't be sold, thrown or lost), with
  `[TEXT]` descriptions.
- `carnival-map.json`, `factory-map.json`, `graveyard-map.json` — one `{ id, slot, x, y }` spawn
  each, on open ground away from the arrival tile and the exits.
- `plans/spine.md` — records Caelan's 2026-10-23 ruling on the Act 2 items (below).

## Acceptance

- Each of the three zones has exactly one boss; beating it drops that zone's required item.
- The required-drop test (SL-4) covers all four boss slots.
- Every placeholder is obviously fake and listed for Caelan's eye.
- Screenshots at 3440×1440 of each boss and its drop.
- `npm test`, the naming grep and `autoplay:check` pass. `balance:check` gains rows for the new
  bosses, so the build stops and asks before the golden is rewritten.

## Rulings it rests on

- **The item names (SP1).** Caelan will name them himself and hasn't yet, so they stay
  `[ITEM A]`, `[ITEM B]`, `[ITEM C]`, mapped per the spine's beat table.
- **The Act 2 items come from quests (2026-10-23).** Caelan: *"The boss fights will become part of
  the three quests."* Each zone's item comes from a quest (given, taken or earned) with the boss
  fight a step inside it. That replaces the Locked row "each zone's boss drops one required item";
  the spine records it. Until the quest wrapper is built, the boss drops the item directly.
- **Which boss is built first** is a later slice. The Ray Gun stays where it is.

## The rulings that unblocked it (2026-10-25)

- **AB1R1 — c, move Puck off the helm.** The bosses keep the `Boss` knight-helm cell; Puck takes
  the free grey-haired cell (4,8) in `game/sprites.js`.
- **AB1R2 — a, the bag until they're named.** The three items join the bag allowlist in
  `tests/visual-breakage.test.js`, in their own commit.
- **AB1R3 — a, accept the goldens moving.** The two save pins in `tests/save-roundtrip.test.js`
  and `tools/balance-golden.txt` are updated, each in its own commit. The autoplay golden's
  fingerprints move too (below); that file is rewritten only by the loop under this ruling.
- **Which zone's quest is which (2026-10-25):** Graveyard given, Factory taken, Carnival earned.
  Recorded in `plans/spine.md` §9; nothing in this slice builds the quests.

## Status before the rulings (2026-10-22)

The build was written and run, then held back from the branch, because it turns five checks red
that live outside this slice's files:

- **The Factory boss looks like Puck.** Puck already wears the `Boss` cell, and
  `tests/sprite-coverage.test.js` forbids two types sharing a cell on one map.
- **The three items have no picture**, so they draw the plain bag, and
  `tests/visual-breakage.test.js` pins the list of items allowed to.
- **Two save tests pin today's picks** (`tests/save-roundtrip.test.js`), which now carry four
  slots, not one.
- **The balance golden** gains the three boss rows, and each zone's coin total rises by 44.
- **The autoplay golden's fingerprints** move, because the save now carries four picks. Every
  stage's turns, damage and deaths are unchanged; with the three new picks left out of the
  fingerprint, the run matches the golden exactly.

Everything else passed: the new tests, the slot tests, content validation, the naming grep, and
the game ran headless at 3440×1440 with each boss standing and dropping its item.

## Out of scope

- Real names, art, barks, stats or item names.
- The three quests that wrap the fights.
- Moving the Ray Gun, or any second entry in any pool.
- Any `main.js` change.
