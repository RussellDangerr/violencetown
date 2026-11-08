# tw1 — the aim strip shows what a lift would take and whether they would notice

## Goal

While you aim a Thieve lift (Coin, Kit or Gear) with the reticle on a person you could rob,
the bottom aim strip gets a second line: the branch, the take, then the verdict.

- **Coin:** the GP amount the real lift would take.
- **Kit / Gear:** the name of the item the real lift would pick.
- **Verdict:** clean (they never know) or noticed (they turn on you). The words are `[TEXT]`
  placeholders in one place, `LIFT_WORDS` in `game/theft.js`; the two states are told apart by
  tint until the words are written.

The earlier design (plans/stealth-perception-and-thieve.md, "shown on the wheel before you
commit") promised this; the wedges themselves are not changed here.

## Rulings it rests on

- **TW1R1**, "where should the wheel show whether a lift would be noticed?" Caelan picked (a):
  on the aim strip at the bottom, once the reticle is on the person.

## How

- `game/theft.js` gains `liftPreview(game, resolver, aimTile)`, a pure read. It uses the same
  pieces as the resolver in `main.js`: `_thieveTarget`, `perceives`, `_theftPassives()`,
  `coinTake`/`stealLimit`, the weights, `noticeBuffer`, `isClean`, and the victim's
  `weightTaken` in `game._robbed`. It never creates a `_robbed` record and never changes the
  victim.
- `kitTake` and `gearTake` mutate, so the choice of which item goes is split out into
  `pickKit` / `pickGear`; both takes call them, and the preview calls them without removing.
- `game/renderer.js` draws the result as a second band above the aim hint, only while
  aiming a thieve leaf and only when `liftPreview` returns something. Not on the unaimed wheel.
- The resolver in `main.js` is left alone on purpose (existing tests lift its methods out by
  signature). The arithmetic therefore exists twice; a test that fires the real lift and
  compares to the preview is the guard that they agree.

## Acceptance

1. Through real keys beside a hidden townsperson with gold: Trick, Thieve, Coin, aim. The strip
   shows Coin, the GP amount and a clean verdict; beside someone whose gold exceeds the buffer
   it shows a noticed verdict.
2. For Coin, Kit and Gear, from behind and from the flank, the real lift matches the strip:
   clean means no hostility and no disposition change, noticed means they turn hostile, and the
   take shown is what lands.
3. Aiming moves nothing: gold, loadout, equipped and `weightTaken` are unchanged after aiming
   and backing out.
4. A second lift from the same person shows the raised weight, so the verdict can flip.
5. Nothing is drawn on an empty tile, on someone who cannot be lifted from, or for any other verb.
6. Screenshot at 3440x1440 of a clean and a noticed strip, placeholder words visible.
7. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Out of scope

The words themselves, showing the verdict on the wedges, any change to the numbers, and any
change to the resolver in `main.js`.
