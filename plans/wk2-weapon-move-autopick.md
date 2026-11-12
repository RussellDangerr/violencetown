# WK2 — your weapon's move is auto-picked

## Goal
Tapping an enemy uses the move the weapon in your hand brings: the sword
cleaves, the hammer stuns, a two-hander spins. There is no separate plain hit
beside it. A weapon whose class brings no move still hits exactly as today.

## Rulings it rests on
- WK1 (merged): a weapon class owns its wheel moves (its `kit`).
- WKR3: the default hit and the plain hit are the same thing. Swords always
  cleave, hammers always stun. The player does not pick it.

## How
The tap's Hit verb asks the weapon's kit for its move and fires it through the
wheel's own fire path (the same one the ACTION wheel uses), aimed at the tapped
enemy. If the move would catch someone who is not hostile (a Cleave flank, a
Spin neighbour), the tap falls back to the single plain hit instead of striking
a friend without the wheel's confirm.

## Acceptance
- A sword tap cleaves; a hammer tap stuns; neither has a plain hit beside it.
- A weapon with no move still hits as today.
- The test drives the real tap path (`_fireResolver` hit case into `_fireWheel`).
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass; the
  autoplay golden is reported, never written, by this slice.
- GIF at 3440x1440 with two weapons.

## Out of scope
Choosing your own default (WK3), enemies using your default attack, any new
name, copy or number. The wheel's Hit entry stays on the ring as WK1 left it.
