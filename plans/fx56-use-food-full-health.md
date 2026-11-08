# fx56 — the Remoticon's Use button on a food won't waste it at full health either

## Goal

FX36 (the wheel) and FX55 (the bottom bar, the bag's Eat row) stopped a healing food being
eaten for 0 HP at full health. A third route still wastes it: in the Remoticon, select a food
in the bag and press its Use button (tap or Enter). Now that refuses too: nothing is used, the
food stays in the bag, no turn passes, and the same `[TEXT]` line FX55 logs appears.

## How

- `game/main.js`, `_deviceActivate`, the `action` zone: before the Use action runs, if the row
  is Use, the item belongs to the Eat column (`xmbCategoryOf(def) === 'eat'`), its effect is
  `heal`, and HP is full, log `[TEXT]`, re-render and return. The inspector selection is left as
  it is, so the player is still looking at the food.
- Same two plain conditions FX55 uses; no new copy, no shared helper.
- Drinks (the Bandage and others whose row says Drink) go through the `drink` action and are
  untouched. A food that heals nothing is untouched too. `_doItemUse` is untouched.
- `tests/eat-full-health-routes.test.js` (from FX55) gains a Remoticon section that lifts the
  real `_deviceActivate`, `_deviceKey`, `_tapDevice` out of `main.js` and drives them with real
  keys and a real tap on the Use button.

## Acceptance

1. At full health, the Remoticon's Use on a healing food uses nothing, passes no turn, and logs
   `[TEXT]`.
2. Hurt, it eats that food as today.
3. The test drives the button with real keys and a real tap.
4. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings

FX55 (merged): refuse at full health with a `[TEXT]` placeholder line; leave drinks alone.

## Out of scope

- The refusal's wording (still `[TEXT]`).
- Drinks, poitions, the wheel, the bar, the bag overlay.
