# QC2 — finishing every quest gives you a cape

## Goal
When the last unfinished quest in `QUESTS` (game/quests.js) is completed, a back-slot cape,
the [Lava Cape], lands in the bag. Once per save. Worn, it adds a flat melee damage bonus.

## Rulings this rests on
- QCR2 (b): the best cape in the game, with a melee damage bonus.
- QC2R2 (a): +6 to melee hits while worn (the Strength Poition's number). Melee only, not spells.
  Its other stats are at least the red cape's.
- QC2R1 (a): the cape's id joins the pinned armour list in tests/weapon-tiers.test.js (one line).
- He named it the Lava Cape; it shows as [Lava Cape] like every item name.

## How
- items.js: `lava_cape`, back slot, `meleeBonus: 6`, armour above the red cape's (placeholder 2).
- quests.js: after a quest completes, if every id in `QUESTS` is complete and the save has not
  yet been given the cape, grant it (flag `lava_cape_given` in the quest state flags).
- main.js `combatAttack`: the flats bucket adds the worn items' `meleeBonus`, inline, only when
  the swing carries a weapon (weapon swings, moves, taps; not spells, smashes or thrown items).
  Inline so tests that lift the method keep working.
- sprites.js / ui-sprites.js: an icon entry (a tinted copy of a placeholder cell) and its
  letter colour.

## Acceptance
- Completing the last quest gives the cape once; completing earlier ones does not.
- It equips in the back slot; a weapon hit deals +6, a spell does not.
- npm test, balance:check, naming grep, autoplay:check pass; screenshot of it equipped.

## Out of scope
- The flowing-lava look (a later art pick). Quests gating zones (QCR1 c, separate work).
- Act 2 zone quests (not in `QUESTS`). Any copy beyond placeholders.
