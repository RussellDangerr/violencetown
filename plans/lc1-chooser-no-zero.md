# LC1: the left-hand GEAR chooser stops showing a meaningless 0

## Goal

The GEAR chooser draws an armour difference at the right of each row: +N green,
-N red, 0 dim. On an armour plate that 0 means "same as what you wear". On the
left-hand weapon plate the rows are weapons, which carry no armour, so every row
read "0" and told the player nothing. After this slice a left-plate row draws a
number only when the armour it would change is not zero. Otherwise the row shows
its name and nothing on the right.

## How

- `game/renderer.js`, `_drawGearPicker`: when the chooser belongs to the left
  plate and a row's difference is 0, skip the number. Armour plates are untouched,
  so their dim 0 for an equal piece stays.
- The row data and tap zones (`gearOptions`, `equipOptions`) are not touched, so
  the drawn rows and the tapped rows are still the same list.

## Acceptance

1. Opening GEAR and tapping the left plate with weapons in the bag lists the
   weapons (and the Bare row when a weapon is held); none draws a number.
2. Tapping a row still equips it, and the keyboard cursor still lands on every row.
3. An armour plate's chooser is unchanged, including its dim 0; a left-plate row
   whose armour does change still draws its green or red number.
4. Screenshots at 3440x1440 of the left-hand chooser and of an armour chooser.
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on

LC1R1, option a: "Show nothing on a row unless the armour changes."

## Out of scope

- Showing weapon damage differences on the left plate (the other options of LC1R1).
- Any change to row order, tap zones, or the armour chooser.
