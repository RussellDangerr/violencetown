# FX13 — townsfolk carry a small purse

## Goal

The town's ambient townsfolk carry almost no gold, so Thieve (which now works on them through
the wheel) has nothing worth lifting. Give each of them a small purse of a few GP, different from
person to person.

## Ruling it rests on

Caelan's pick on "how much gold should a townsperson carry?": **a small purse each, a few GP,
varying by person**. Its cost: a tuning range, and the town's economy grows by a few dozen GP.

Two follow-up picks, made by the loop under Caelan's standing delegation:

- **Quest 1's autoplay golden:** accept the new save fingerprints. The saved state now holds the
  purses; no stage score moves.
- **The balance bench:** counts the purses. It draws them the same way the game does, so the town
  faucet and the townsfolk rows show the gold actually spawned.

## What counts as a townsperson

An ambient, non-fighting (damage 0), non-vendor NPC with no gold written into its spawn. Vendors
keep their till; fighters keep their kit; any spawn that states its own `gold` keeps it.

## How the purse is drawn

- A range that reads as "a few GP" (2 to 6 inclusive). The exact range is a tuning number and
  goes to Caelan for a look.
- Drawn from its own seeded stream keyed on the person's id (Mulberry32 from `game/rng.js`), never
  `Math.random` and never `game.rng`, so no fight or theft roll moves.
- Keyed on the person, not the game's seed: the same townsperson carries the same purse in every
  game. The game keeps no seed after it starts, so a per-game purse would need it kept and saved.
- The same person carries the same purse every time their zone loads, so leaving and coming back
  cannot re-roll it. A mugged person still comes back broke, and a robbed one still comes back
  short by what was lifted.

## Acceptance checks

- Every townsperson spawns with a purse inside the range; vendors, fighters and authored wallets
  are unchanged.
- The same person gets the same purse on every load; different people do not all get the same.
- Drawing a purse leaves `game.rng` untouched.
- The balance bench's town economy rows move, and only those rows.
- `npm test`, the naming grep and `autoplay:check` pass; `balance:check` passes once the new
  golden is accepted.

## Out of scope

- Downtown's civilians (not ambient), the Stranger, vendors and fighters.
- Any change to how Thieve works or what it shows.
- Any new copy, names or art.
