# WK1 — weapon classes own their wheel moves

## Goal
Today every weapon gets Cleave and Spin on the Melee wheel, and every class's
`kit` is empty. A class now lists the wheel moves it brings, and the Melee ring
shows only Hit plus the moves in the kit of the weapon in your hand.

## Rulings it rests on
- WKR1 pick (a): the sword owns Cleave; the two-handers (great sword, battle
  axe, war hammer) own Spin; the hammer gets a stun. Other classes get their
  moves in later slices, so for now they show Hit alone.
- WKR2 pick (a): moves outside your kit vanish from the wheel (no greyed slice).
- The stun reuses the shove's lost turn (`_spunTurns`), so it adds no number.
  It lands a normal weapon hit and the survivor loses its next turn; no push.

## Acceptance
- Each class's kit follows the ruling; the starting wooden sword keeps Cleave.
- Moves outside the kit are absent from the Melee ring.
- A stunned enemy loses a turn.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.
- Screenshot at 3440x1440 of the wheel with a sword and with a hammer.

## Out of scope
Kits for every other class, new damage numbers, player-facing copy for Stun
(the label is a placeholder), perks, and skill-rank unlocks.
