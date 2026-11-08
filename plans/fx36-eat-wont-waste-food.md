# fx36 — Eat won't waste food at full health, and the wheel says what it'll eat

## Goal

Treat > Eat used to eat a Hot Dog for 0 HP at full health, and the slice never said which
food it would use (at 30 HP of 100 it picked the 10-HP Hot Dog over a bigger one). Now:

- At full health the Eat slice is greyed, with a reason line, and nothing is used.
- When hurt, the live slice names the food and how much it heals.
- The food chosen is the one that best fills the missing HP: the smallest heal that covers
  the gap, or the biggest one when none covers it.

## How

- `game/main.js`: `eatChoice()` returns the best-fit food in the bag (or null at full health
  or with no food). `barSlot('eat')` answers with its slot, so the wheel's existing
  `verbApplies` check greys the slice and the existing fire path eats exactly that food.
  `wheel-model.js` is not touched (FX36R1, pick a: renderer only).
- `game/renderer.js`: the Eat slice draws the food's name and heal number on a second line
  when live, and a `[TEXT]` reason line when greyed at full health.
- `tests/eat-choice.test.js`: unit tests for the choice, plus a test that opens the real
  wheel with real keys, and runs the real `_drawWheel` on a recording canvas.

## Acceptance

1. At full health, Eat is greyed with a reason, and firing it uses nothing.
2. Hurt, the slice names the food and its heal, and the choice fits the missing HP.
3. The test drives the wheel with real keys.
4. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings

- FX36R1, pick (a): add `game/renderer.js` only; `game/wheel-model.js` stays as it is.

## Out of scope

- The reason line's wording: a `[TEXT]` placeholder until Caelan writes it.
- Tapping a food cell on the bottom bar still eats that exact food (a deliberate choice).
- `game/affordances.js` (a design table nothing reads).
