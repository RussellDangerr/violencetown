# A DoT death is a death

**Status:** fix on `fix/dot-death-swing`, 2026-10-01. Found by the turn-model QA pass (2026-09-30).

## The bug

An enemy's own damage-over-time ticks at the start of its turn (`enemies.js` `resolveEnemyTurns` →
`enemy.tickBuffs`). When that tick kills it, two things go wrong, both pre-existing (on `dev`, and on
the live v0.26.0):

1. **It still takes its turn.** The loop checks `isAlive()` before the tick, never after — so the
   corpse swings at you, or buys back HP with its purse (leaving a body at 40 HP flagged dead).
2. **Its death is never handled.** `buffs.js` only sets `alive = false`; nothing calls
   `_handleEnemyDeath`, which a melee, spell or throw kill always does. So a DoT kill gives no K.O.,
   no "Defeated" line, no looted gold, no kit drop, no `enemy_killed` event for quests — and **the
   Were-Rat drops neither the catalytic converter nor its fur**. A poison, sludge or burning finish on
   the Were-Rat softlocks quest 1.

Reproduced in headless Chrome (goon at 3 HP with a 5-damage poison; the Were-Rat likewise).

## The fix

Right after an enemy's buffs tick, if the tick killed it: run the same death handling every other
kill gets (`game._handleEnemyDeath`), and skip the rest of its turn. Nothing else changes.

Outcome change, intended: DoT kills now loot gold and drop kit like any other kill, and count for
quests. If the autoplay golden drifts, the drift must be exactly that before it is recorded.

## Done (2026-10-01)

`resolveEnemyTurns` handles the death and skips the turn (`tests/dot-death.test.js`, with a control
that the same poisoned goon swings when the tick does not kill it; two mutations each fail it).
In the running game: a poison-killed goon now reads "Defeated", loots its 40 GP, fires
`enemy_killed`, and takes no turn; a poison-killed Were-Rat drops the converter and its fur.

The death handler also pays out Pike's canyon-critter deal and counts sewer-escape rat kills, so DoT
kills now count for both. That is the autoplay drift: the fighter's escape had never reached 5
counted rat kills (its DoT kills went uncounted), so wave 2 never spawned and the stage took 12
turns. With the fix wave 2 spawns ("More rats boil out of the walls!") and it takes 30 — confirmed
in both runs' logs before recording the new golden. The sneak is unchanged.
