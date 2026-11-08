# FX45 - one-time talk choices stay used after a reload

## Goal
A one-time (`once`) talk choice that an NPC has already given stays used after a save and
CONTINUE. Before this, the spent set (`npc._dialogueDone`) lived only in memory while the
mood the choice gave was saved, so after a reload you could compliment the same hat or
use the same stand-down again for another mood boost.

## Change
- `game/enemies.js`: `toSave()` writes the NPC's spent choice ids as `dialogueDone`, only
  when there are any, so an NPC that has spent nothing saves exactly as before. `fromSave()`
  restores them into `_dialogueDone`; a save without the field loads with nothing spent.
- `game/dialogue.js`: the Crat's story-beat choices go back to `once` (hear a side out,
  take a side's money, rule for a side). They were made repeatable only to dodge this
  bug, so every row showed the repeat badge. The genuinely re-askable questions stay
  repeatable. Comments that said spent choices are not saved are corrected. The Yellow
  Card line keeps its quest flag and is left working.
- `game/main.js`: only if the load path needs it (expected not to).

## Acceptance
1. A one-time choice used before a save is gone after CONTINUE.
2. The Crat's one-time choices are one-time again and do not show the repeat badge.
3. Old saves without the field load fine.
4. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass. If the save
   fingerprints move, stop and report.

## Rulings
None.

## Out of scope
- Persisting spent choices across leaving and re-entering a zone (NPCs re-read from map
  data there, and their mood resets the same way).
- Any new copy, names or numbers. Crat lines stay placeholders.
