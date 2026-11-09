# GS1: GAME START asks before it replaces a saved run

## Goal
Clicking GAME START with a save on disk used to begin a fresh run, and the first
autosave then overwrote the old save. A mis-click wiped a run. Now it asks first.

## Ruling
GS1R1, pick (a): ask with the line RESTART already uses. No new words; the same
browser confirm and the same guard shape as RESTART in the menu sheet.

## Acceptance
- With a save, clicking GAME START shows the confirm before anything changes.
- Cancel stays on the title; the save is untouched and CONTINUE still loads it.
- OK starts a fresh game exactly as before.
- With no save, GAME START starts at once, no confirm.
- Space with a save still CONTINUEs with no confirm.
- The comment at `_bindSplash` is corrected to say what now happens.
- Test `tests/game-start-confirm.test.js` drives the real `_bindSplash` with a
  stubbed confirm answering no and yes and checks the stored save after each.

## Out of scope
Snapshots of the old run (option c), own wording (option b), the TV opening.
