# FA1 — in a fight, an arc of every attack you own appears under you

## Goal
While a fight is on, a half-ring of numbered slots sits under your character, one slot per
attack you own. Press its number (1-8), click it or tap it, and you run the same action the
combat wheel runs today. The wheel is untouched: it is still how you reach everything else, and
outside a fight nothing changes.

## What it does
- **New module `game/fight-arc.js`** (pure, no DOM): which slots exist, where they sit on
  screen, which one a point lands on, and whether the arc should fade for the current aim.
- **The slots come from the wheel's own tree.** The arc looks its nodes up in `ROOT`
  (Hit, Cleave, Spin, Ranged, Fireball, Cone of Cold, Boo!, Defend) so it cannot drift from the
  wheel. Order is fixed: that order, numbered from 1, a spell you do not own simply has no slot.
  Ranged and Throw are the same action on the wheel (they are documented duplicates), so the
  arc has one slot for it. That is what keeps the arc at its cap of eight.
- **Greyed slots stay drawn** and carry a reason key from `wheel-model.js` `greyedReason`. Pressing
  one logs that reason's line (FX58's table), plays the bump, spends no turn and changes no state.
- **Running a slot.** A slot that is not greyed puts the wheel on that node and calls the
  wheel's own `_wheelDrill`, so a self action (Spin, Defend, Boo!) fires at once, and an aimed
  one (Hit, Cleave, Ranged, spells) enters the wheel's aim layer with its reticle seeded, exactly
  as drilling to it on the wheel does. While aiming, pressing the same number again commits (as
  Space does) and pressing another number switches to that slot.
- **Keys.** While the arc shows (a fight is on), Digit1-Digit8 belong to the arc and Digit9 still
  picks inventory slot 9. With no fight the digits select inventory exactly as before.
- **Pointer.** A press on a slot runs it. A press on anything else is unchanged: the FX60
  touch Hit deferral, click-to-move, long-press, the right-click Target List. Where a slot sits
  over a thing you can already click (a creature, a ground item, a container), the thing wins,
  so nothing that worked before stops working.
- **Aim fade.** While aiming at a tile a slot sits over, the whole arc drops to a faint alpha
  and stops catching taps, so the tile under it is plain to see and tappable.
- **Drawn** in the renderer after the fight panels, in screen space, under the aim hint strip.
  Hidden whenever a menu or the wheel's dial is up.

## Acceptance checks
- While a fight is on, a slot is drawn for each attack owned, at most eight, at fixed positions.
- Each slot shows its number key; pressing 1-8, clicking and tapping a slot run the same
  resolver the wheel runs for that node.
- A greyed slot is drawn, logs its FX58 reason when pressed, spends no turn.
- Aiming at a tile the arc covers fades it and lets the tap through to the tile.
- Bump, click, touch Hit deferral and right-click are unchanged; outside a fight the digits
  select inventory and the wheel is unchanged.
- Tests drive the real keydown listener and the real pointer listeners in a fight.
- `npm test`, `balance:check`, the naming grep, `autoplay:check` pass.
- Evidence frames at 3440x1440 and 1920x1080, one while aiming through the arc.

## Rulings it rests on
FAR1, picked (a): a semicircle under your character with every attack numbered 1-8 and greyed
reasons; it fades or tucks aside while you aim at a tile it covers; bump and click still hit.

## Placeholders (every one is the owner's to change)
Slot size, the half-ellipse radii, the slot colours, the faded alpha and how the label is
clipped are stand-ins. Labels are the wheel's own labels, uppercase and clipped to fit.

## Out of scope
- Class moves, the auto-picked default attack and the starred default (WK1-WK3). The slot list
  is built in one function so they can feed it later.
- Tricks granted by gear (Ray Blast, Hire Lire, Rat Form, Ember Rat) stay on the wheel: with
  three spells the eight slots are full.
- Anything on the Space / wheel-open key path (FX59 owns the double-tap).
- Real icons, real copy, a fade animation.
