# The quest log counts the quests you've finished

## Goal

The QUESTS tab of the journal already lists finished quests under a COMPLETED heading. Put a
plain count beside that heading, finished out of total, e.g. `1 / 3`. Numbers only: no new words.

The total is the number of quests the game defines (`QUESTS` in `game/quests.js`), so it grows
on its own as quests are added. The finished number comes from the quest engine's completed list.

## Acceptance

- The QUESTS tab shows `<finished> / <total>` beside COMPLETED.
- The count survives a save and reload. It is derived from the completed list, which is already
  saved, so no new saved field is added; a test round-trips it through serialize/restore.
- A test pins the count to the completed list and to the number of quests.
- A 3440x1440 screenshot of the QUESTS tab after the first quest (scratchpad, not committed).
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rests on

- The quest-cape idea was split into slices; this one is useful whichever way the quest-goal
  ruling goes, and it does not depend on that ruling.
- The pick that quests gate the zones is a separate change and is not built here.

## Out of scope

- Any zone gating by quests.
- A reward for finishing every quest.
- Showing the count when nothing is finished yet: the COMPLETED heading only appears once a
  quest is done, and that stays as it is.
