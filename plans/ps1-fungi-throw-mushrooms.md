# ps1: the Red Fungi throw Tunnel Mushrooms

## Goal
Two sewer fights teach poison. A Red Fungus that sees you from 2 or more tiles
(up to the mushroom's range) throws a Tunnel Mushroom instead of closing in. You are
Poisoned with the mushroom's existing numbers (5 a turn, 2 turns); the Poisoned chip and a
poison splat show on you. The throw is the fungus's whole turn, and the mushroom leaves its kit.

## Acceptance
- A Red Fungus seeing you from 2+ tiles throws a Tunnel Mushroom; you are Poisoned for its turns.
- The Violet Fungi, the Ghost Fungus and the Fungus King never throw one; they keep it as food.
- Existing Fire Blood / Sludge Brain throws are unchanged.
- Quest 1 autoplay drift, if any, goes to Caelan as "accept the new golden?" before it is recorded.
- npm test, balance:check, naming grep, autoplay:check pass.

## Rests on
- PSR2, pick (c): only the two Red Fungi throw.
- PSR1 (archived): only named fungi throw; existing mushroom numbers kept.

## How
- `game/npc.js`: a per-enemy-kind list (`THROWS_CARRIED`) says which kinds throw which carried
  food. The mushroom is not flagged `enemyThrows`, so nobody else's changes and the existing
  test that pins the two enemy-thrown poisons still holds.
- `game/main.js` `_enemyThrow`: a poison branch applies the Poisoned buff and a splat.

## Out of scope
Copy (the log line and the splat text are `[TEXT]` placeholders), tuning, other fungi,
new art, rewriting the golden.
