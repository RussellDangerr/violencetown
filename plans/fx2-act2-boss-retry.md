# Act 2 bosses give the same retry the Were-Rat does

## Goal

When a boss beats you, the game is meant to run the boss retry (plans/defeat-scenarios.md, "the
boss-retry seam"): the boss refills, you wake at the zone's start at full health with a short
Rattled, and you lose nothing. Today only the Were-Rat gets it. `isBoss` in
`game/defeat-scenarios.js` asks only whether the enemy's `tag` ends in `_boss`, and the Act 2
stand-in bosses (`placeholderBoss()` in `game/slots.js`) carry `boss: true` with no tag. So losing
to the Carnival, Factory or Graveyard boss falls through to the generic "beaten and dumped"
scenario: half your bag is gone for good and the boss keeps the damage you did.

The fix: `isBoss` also answers yes for an enemy whose `boss` flag is set. The tag check stays, so
the Were-Rat (which has both) goes the same way it always has.

## Acceptance

- Losing to any Act 2 boss runs the boss retry: your bag is untouched and the boss is back to full.
- A test pins `isBoss` for a `*_boss` tag and for `boss: true`, and still says no for an ordinary
  enemy and for a `{ cause }` defeat.
- A test drives a defeat end to end through main.js's own `_die` / `_resolveDefeat` /
  `_runBossRetry`, lifted from the source, with a real spawned Act 2 boss.
- A 3440x1440 screenshot of the retry after a staged Act 2 defeat, where the boss's own turn lands
  the last hit.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass, with no autoplay drift
  (the Were-Rat path does not change).

## Rests on

- The card's approval by the loop under the standing delegation (LOOP.md §11): a bug fix with no
  new name, copy, number or art.
- plans/defeat-scenarios.md: a boss beating you runs the retry, not a scenario.
- plans/ab1-act2-placeholder-bosses.md: the Act 2 bosses are flagged `boss: true`.

## Out of scope

- Any change to what the retry does, its log line, or the Rattled length.
- Giving the placeholder bosses a tag.
- Anything about beating a boss (the drop, the world shift).
