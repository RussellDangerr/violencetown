# em1: losing to your Borgir boss is an ordinary defeat

## Goal
The boss retry (refill the boss, wake at full health, lose nothing) is for the story's
bosses. Losing to the Borgir boss, or to Pike, runs an ordinary defeat: a scenario from the
table, with the cost line saying what it took.

## Ruling EMR1, pick a (Caelan)
The retry asks whether the enemy fills a spine boss slot (game/slots.js `kind: 'boss'`),
not whether it carries the `boss` flag or a `*_boss` tag. The flag keeps its other jobs:
the boss's single name in logs, boss spending, rivals leaving bosses alone.

## What counts as a story boss
- Fills a boss slot: the Sewer's boss (Were-Rat), the Carnival, Factory and Graveyard
  bosses, and the frozen boss.
- The finale's two fixed fights, which sit in no slot: the Financier and Monstrous Sun Man.
  Both are the ending's bosses, so they keep the retry. (A call the pick does not spell
  out; flagged for review.)
- Not: the Borgir boss (flag, no slot), Pike (`pike_boss` tag, a character slot's neighbour).

## How
- `slots.js`: `fillsBossSlot(enemy)`.
- `defeat-scenarios.js`: `isStoryBoss(enemy)` and `storyBossInFight(fs, by)`. `isBoss` and
  `bossInFight` are untouched.
- `main.js`: the two imports the defeat code reads under the names `isBoss` / `bossInFight`
  now point at the story versions, so the defeat methods are unchanged text.

## Acceptance
1. Beaten by the Borgir boss: an ordinary defeat, cost line says what it took.
2. Beaten by Pike: an ordinary defeat.
3. Beaten by the Were-Rat or an Act 2 boss: the retry, as today.
4. Names and boss behaviour in a fight unchanged.
5. The test that a bare boss flag means a retry changes in its own commit, citing EMR1.
6. The new test lets a real world turn deliver the blow.
7. Evidence: 3440x1440 frame of the log after losing to the Borgir boss.
8. npm test, balance:check, naming grep, autoplay:check pass.

## Out of scope
- `game/autoplay/run.js` trace label (it still calls the flag a boss; observer only).
- Any golden rewrite.
