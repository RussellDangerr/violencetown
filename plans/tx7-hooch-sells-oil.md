# TX7 — Hooch sells oil next to the alcohol

## Goal
Hooch's trade screen lists oil beside the alcohol, so the oil that TX6 lets you spread at the
bridge can be bought. Closes HO1 (its other halves are TX6).

## What changes
- `game/town-map.json`: Hooch's `stock` becomes `["alcohol", "oil"]`.
- `game/town-map.json`: the `fuel_note` card no longer says oil burns for hours. Its oil
  sentence becomes the placeholder `[TEXT]`; the alcohol sentence stays.
- `tests/oil-for-sale.test.js`: opens Hooch's shop with real keys, buys oil, spreads it at the
  bridge and checks the slide.

## Price (ruling HO1R2 (a), 2026-11-01 pick)
Oil's `baseValue` is already 35 (TX6). At Hooch's starting disposition (20, the neutral band,
buy x1.6) that is 56 GP, about 2.5 times the alcohol (baseValue 14, 22 GP). This replaces the
card's older "twice the alcohol" wording. Only Hooch stocks it, so prices stay the same
everywhere.

## Acceptance
- Hooch's trade list shows oil beside the alcohol, priced from the band table.
- The fuel card has no "burns for hours" promise.
- A real-key purchase of oil, then spreading it at the bridge, sets the flag.
- npm test, balance:check, naming grep and autoplay:check pass.

## Out of scope
Item name and description wording (placeholders), `items.js`, `main.js`, the final card text.
