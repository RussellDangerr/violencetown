# FX27 — going down in a boss fight gives the boss retry, whoever lands the last blow

## Goal

Losing to a boss runs the boss retry: the bag is untouched, the boss refills, you wake at full
health. Today `_resolveDefeat` (game/main.js) asks only who landed the last blow, via `isBoss(by)`.
Die to one of the Alien's allies while he stands in the fight and it is an ordinary defeat, and
half the bag is gone.

After this slice the question is "is a boss in your fight when you go down?". The fight is the one
`game/fight-area.js` already defines (`fighters`: alive, hunting you, not ambient, with eyes), so
there is no new notion of "in the fight".

## The shape

- `game/defeat-scenarios.js`: a pure helper, `bossInFight(fighters, by)`. It returns the boss that
  ends a fight: the killer if the killer is a boss, else the first boss among the fighters, else
  null.
- `game/main.js` `_resolveDefeat`: it asks the helper with `fighters(this.enemies)` and runs
  `_runBossRetry` on what it returns. Ordinary defeats are untouched.
- `tests/boss-retry-ally.test.js`: the checks below.

## Acceptance

- Downed by a boss's ally during the boss fight: the boss retry runs, the bag is untouched.
- Downed by an ordinary enemy with no boss in the fight: the ordinary defeat, as today.
- The test stages the fight (the Factory's real map, the Alien and an ally of his, a nearly-dead
  player) and lets a real world turn deliver the blow: main.js's own `_advanceWorldOnce`,
  `applyDamageToPlayer`, `_die`, `_resolveDefeat` and `_runBossRetry`, around the real
  `resolveEnemyTurns`.
- A boss elsewhere on the map that is not hunting you, or a dead boss, does not turn an ordinary
  defeat into a retry.
- The autoplay's trace label follows the same rule as the game.
- Quest 1's autoplay golden moves as the ruling described (fighter 117 to 102 turns, sneak 138 to
  167); the loop writes it in its own commit citing FX27R1. `npm test`, `balance:check` and the
  naming grep pass.

## Rulings it rests on

FX27R1, pick (a), Caelan's own words: "Yes: any death while a boss is hunting you gives the
retry." Because the retry now fires in fights it used to miss, quest 1's autoplay plays
differently, so its golden moves. That drift is the ruling's intended effect.

## Out of scope

- The Borgir employer question (its own card).
- Writing the golden (the loop does, citing the ruling).
- Resetting the boss's allies on retry; the boss refills and everyone de-aggros, as today.
- Any copy or tuning change. The retry's log line is untouched.
