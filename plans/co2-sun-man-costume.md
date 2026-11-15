# CO2 — Absorbing Sun Man gives you his costume

## Goal
Winning phase 2 (Monstrous Sun Man falls) puts Sun Man's costume in your bag, once. After the
credits the town stays open, and the costume works like any costume: use it from the bag to wear
it, use it again to take it off (CO1).

## How
- `game/costumes.js`: a `sun_man_costume` entry in `COSTUMES` (kit and skill record are placeholders
  built from existing pieces).
- `game/items.js`: a `sun_man_costume` bag item (`useType: 'costume'`), placeholder name and copy.
- `game/finale-setpiece.js`: `beastFell` hands the item over the first time phase 2 is won, the same
  moment the one-shot `finale_phase2_won` event fires. A second fall (or a reload) gives nothing.
- `tests/sunman-costume.test.js`: granted once, wearable after the win, restored on take-off.

## Acceptance
- Winning phase 2 gives the costume, once.
- Wearing it after the credits works like any costume.
- 3440x1440 screenshot of Night Kid in the costume in town.
- `npm test`, `balance:check`, naming grep and `autoplay:check` pass.

## Rulings it rests on
- Sun Man is a costume you wear; the town stays open after the credits (Caelan, per the card note).
- FIN3 (phase 2) and CO1 (costumes) are merged slices.

## Placeholders
Name, description, kit, skill ranks and the bag colour are obvious stand-ins, listed for his eye.

## Out of scope
A bespoke body sprite, the credits themselves, a log line of copy, any new tuning.
