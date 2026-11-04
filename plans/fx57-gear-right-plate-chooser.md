# FX57: the GEAR tab's right-hand weapon plate opens a chooser of your weapons

## Goal

On the GEAR tab, clicking or tapping the plate labelled WEAPON [RIGHT] does
nothing today. The code skips it on purpose (`if (s.key === 'weapon') continue;`
in the tap handler, and a `s.key !== 'weapon'` filter in the keyboard cursor's
list of plates). The left-hand plate already opens a chooser of the weapons in
the bag (FX14). After this slice the right-hand plate does too, with the same
chooser, drawn in the same place.

## How

- `game/main.js`: the tap handler no longer skips the weapon plate; the keyboard
  cursor's plate list includes it (so Enter opens the chooser and the first row is
  focused, as for every other plate).
- The chooser's rows for the right plate are the bag's weapons. A row equips with
  the same call the ITEMS tab's Equip button makes (`resolveUse` into the
  `weapon` slot), so a swapped-out weapon returns to the bag and a two-hander
  fills both hands exactly as it does from ITEMS.
- No Bare row on the right plate: the right hand is never emptied from here. Both
  main.js (tap rows, cursor rows, option activation) and the renderer (drawn rows)
  leave it out, from the same rule, so drawn rows and tapped rows cannot drift.
- `game/renderer.js`: the chooser title and rows already come from the plate's
  own label and the shared row list; the right plate draws no armour number on
  its rows, as the left plate does (LC1), because weapons carry no armour.

## Acceptance

1. Tapping WEAPON [RIGHT] on GEAR opens a chooser of the bag's weapons; tapping
   a row wields it in the right hand and returns the old one to the bag.
2. The keyboard cursor reaches the right plate; Enter opens the chooser and
   Enter again equips.
3. No Bare row ever appears on the right plate's chooser.
4. A new test (tests/gear-right-plate.test.js) opens GEAR and equips through the
   plate using real key presses and a real pointer hit-test through main.js.
5. A 3440x1440 frame of the open chooser.
6. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on

None.

## Out of scope

- Choosing where the chooser sits (GC1) and a bare right hand (LH1): whichever
  lands second adapts.
- Whether the swap costs a turn: it does not, like every other GEAR chooser pick.
- Any copy change.
