# AT1: the GEAR tab shows your total armour

## Goal
Opening GEAR in the Remoticon shows one line, `ARMOR n`, where n is exactly what
`game._playerArmor()` returns. Today that line is drawn only by the old stand-alone
EQUIPMENT modal, which nothing opens any more, so the GEAR tab never shows it.

## How
- `game/layout.js` gets one small helper, `gearArmourRect(bodyRect)`: the box the line
  sits in, in the top-left corner of the GEAR body. The HEAD plate, the other plates and
  the open chooser all start further in or lower down, so it collides with nothing.
- `game/renderer.js` `_drawEquipmentModal`, hosted branch only, draws the line there with
  the same wording, colour and size as the old modal's line. It reads `_playerArmor()`
  on every frame, so wearing or taking off a piece changes it at once with GEAR open.
- The old stand-alone branch is left as it is.

## Acceptance
1. GEAR shows `ARMOR n`, n the same number `_playerArmor()` returns.
2. Equipping or removing a piece changes the number without closing GEAR.
3. A new test (`tests/gear-armour-total.test.js`) opens GEAR with real key handling,
   reads the drawn line, equips a piece through the chooser, reads it again.
4. The line overlaps no plate, no chooser, no tab bar (pinned by a layout test).
5. Evidence: 3440x1440 frames before and after equipping, and one at phone width.
6. npm test, balance:check, naming grep, autoplay:check all pass.

## Rulings it rests on
None. The wording `ARMOR` already exists; no new words, names or numbers.

## Out of scope
- Any new label, tooltip or per-piece breakdown.
- Changing how armour is summed.
- The old stand-alone EQUIPMENT modal.
- Moving or resizing any plate.
