# fx55 — the bottom bar's food and the bag's Eat row won't waste food at full health

## Goal

FX36 stopped the wheel's Eat from spending food on 0 HP at full health. Two other routes
still do: tapping (or pressing Enter on) a food on the bottom bar, and the Eat row of the
bag's action list (a tap on a hotbar slot). Now both refuse at full health: nothing is used,
the food stays in the bag, no turn passes, and one log line says why.

## How

- `game/main.js`: a check of two plain conditions, written in each route itself (no shared
  helper, so the older tests that lift these methods out of `main.js` keep working):
  - `_useXmbCurrent` (the bar's tap and Enter both land here), non-throw branch: refuses when
    the bar's column is Eat, the item's effect is `heal`, and HP is full;
  - `_pickOverlay` case `use`: refuses when the row is labelled Eat (the overlay labels a row
    Eat only for a healing food) and HP is full.
- A refusal logs `[TEXT]`, leaves the food in the bag, passes no turn, and (bag) closes the
  list back to the selected slot.
- `_doItemUse` stays untouched, so the wheel, throws, drinks, poitions, bandages and the pipe
  behave exactly as before.
- `tests/eat-full-health-routes.test.js`: lifts the real methods out of `main.js` and drives
  the real Enter key branch, a real tap on the bar, and the real bag overlay pick.

## Acceptance

1. At full health, tapping the bar's food or pressing Enter on it uses nothing and logs the
   `[TEXT]` line.
2. At full health, the bag's Eat row uses nothing and logs the same line.
3. Hurt, both still eat the food you chose, as today.
4. A food that does not heal is left alone: only heal items are refused at full health.
5. The tests drive both routes with real keys.
6. Evidence: a 3440x1440 frame of the bar refusing.
7. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings

None. The wording of the refusal is a `[TEXT]` placeholder until Caelan writes it.

## Out of scope

- The wheel (FX36 owns it).
- Drink-column items (bandage, poitions): not food, so not refused here.
- The GEAR panel's Use button on a food in the bag, a third route to the same waste; it is
  a separate card.
- The refusal's wording.
