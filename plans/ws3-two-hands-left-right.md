# Two hands: left and right replace the weapon slot

## Goal

Every body has two hands. Each hand holds one thing, or both hands hold one
two-handed weapon together. Today the player has one weapon slot; after this
slice the player has a right hand and a left hand, a save remembers both, and
the fight's gear panel shows both.

Attacks still use one weapon. Dual-wield effects are not part of this slice, so
the quest-1 autoplay must play exactly as before.

## Acceptance

1. An old save (version 1, one weapon slot) loads with its weapon in the right
   hand and the left hand empty. `SAVE_VERSION` goes to 2 and `migrate` fills
   the missing hand.
2. A two-handed weapon fills both hands. Equipping a one-handed weapon into
   either hand while a two-hander is held frees both hands: the two-hander goes
   back to the bag and the new weapon takes the hand it was put in.
3. The fight's gear panel ("YOU") has a row for each hand. A two-hander shows in
   both rows.
4. `npm run autoplay:check` plays exactly as before (only the save
   fingerprints move, see below) and every gate in LOOP.md §2 passes.
5. Both fight panels are one row taller, and every line of the YOU panel,
   with the panel's padding, lands inside its frame.

## What it rests on

- **WS1 (merged):** `game/weapons.js` gives every weapon a class, and every class
  says how many hands it takes (`hands: 1 | 2`). This slice reads that field. A
  weapon with no class, or an item that is not a weapon, counts as one-handed.
- **WS4 (merged):** attacks pass the weapon they swing. That weapon is the right
  hand's, which is also where a two-hander sits.
- **Ruled: accept the new autoplay golden.** The save format change moves the
  autoplay's save fingerprints and nothing else; play is unchanged. The golden
  is rewritten for that one cause only.
- **Ruled: grow the fight panels one row** so both hands fit, rather than
  clipping the last row or folding both hands into one row.
- **His leaning (not a ruling):** two hands per body, each holds anything, or
  both hold one two-hander. No dual-wield combat in this slice.

## How it is built

- The right hand keeps the internal key `equipment.weapon`. Every existing
  reader of "the weapon" (attacks, reach, the HUD line, granted skills, the
  defeat safe-floor) then keeps reading the hand that swings, unchanged. The
  left hand is the new key `equipment.left`. A two-hander is the same def in
  both keys.
- `game/items.js` holds the rule: `holdInHands` puts a weapon in a hand and
  returns what it pushed out; `settleHands` repairs a pair of hands after a
  load. Both take a `handsOf(def)` function, because `items.js` cannot import
  `weapons.js` (that import would loop). The game supplies `_handsOf`, which
  reads the weapon's class.
- Using a weapon from the bag still equips it to the right hand, exactly as
  today, so the autoplay does not move. A two-hander also fills the left.
- `game/save.js` writes `left`, bumps the version to 2, fills `left` on older
  saves, and settles the hands after load (a saved two-hander fills both).
- `game/fight-panels.js` lists both hands.
- `game/layout.js`: both fight panels grow one row (`FIGHT_PANEL_H` 176 to
  198), so the seventh row fits inside the frame.

## Placeholders

- The panel labels for the two hands are placeholders built on the existing
  `WEAPON` label: `WEAPON [RIGHT]` and `WEAPON [LEFT]`.

## Out of scope

- Any way for the player to put something in the left hand. The rule supports
  it, but no screen offers a left-hand choice yet; the Remoticon's GEAR tab
  still shows one weapon plate (its layout and drawing are outside this slice).
- Dual-wield combat, left-hand granted skills, and left-hand safety on defeat.
- Per-class tuning of any kind.
