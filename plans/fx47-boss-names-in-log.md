# FX47: every log line calls a boss by its one name

## Goal
FX4 fixed the target panel, the KO tag and the death line, but a handful of other log lines still
print the boss's type ("Wererat") because they read `name ?? type`. Route them through the boss's
one name so no line a player can see prints a boss's type.

## Acceptance
- No log line a player can see prints a boss's type instead of its name.
- A test sweeps the lines for the Were-Rat and an Act 2 boss.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## How
One helper, `logName` in `game/npc.js`: a boss gives `shownName` (its one name), anyone else gives
what the line printed before (their own name, else their type). `main.js` methods are run in
isolation by some tests, so there the same rule is written inline. Lines moved: digs out an item,
spends / pays / buys back HP (npc.js); who, shove, weight change, catch, slinks back (main.js);
the DoT tick line (buffs.js).

Non-bosses are deliberately unchanged ("no new words"): only which name a boss goes by.

## Rulings
None; approved by the loop under the standing delegation.

## Out of scope
- `npc.js` "A ${npc.type} drops / pockets" worker lines: they are about townsfolk types, and
  `shownName` gives them the same text.
- Non-boss naming (e.g. Red Fungus carrying its name on `entity.name`).
- Any new wording or golden.
