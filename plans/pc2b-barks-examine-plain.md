# PC2b: barks and creature examine text say plainly what they are

Ruling PCR3 (picked 11-17): every AI-written creative line becomes deadpan and factual; names and
Caelan's own lines stay; no square brackets on player text; every line matches what the code does.

## Goal
Every bark and creature examine line in the touched files says what the character is doing or
wants, or what the creature is and whether it fights. No voice, jokes or brackets.

## Acceptance
1. Every adjacencyBark (borgir, canyon, carnival, downtown, factory, graveyard, sewer, and the
   slots.js Strongman) is a plain line.
2. Dormant barks arrays (town, downtown, canyon, sewer maps, slots.js, including the `[TEXT]`
   barks) are plain too.
3. Creature examine text in slots.js has no `[TEXT]`; it says what the creature is and whether it
   fights. The Bear's examine text lives in enemies.js (outside touches) and is left.
4. Tests that pin these lines are re-pinned exactly, in their own commit.
5. npm test, balance:check, the naming grep and autoplay:check pass.
6. Evidence: 3440x1440 frames of two adjacency barks and one creature examine.

In the map files only `barks` and `adjacencyBark` change; PC4 owns prop text, labels, zone names.

## Notes
- game/main.js (~7302) strips one outer pair of brackets from bark text. Once these barks carry no
  brackets that strip can be removed by PC12. This slice leaves main.js alone.
- tests/plain-copy-guard.test.js holds per-file counts of bracketed findings (ALLOWED). Removing
  brackets lowers the counts, and the guard fails until the list is lowered in the same change, so
  that file must be in touches.

## Out of scope
main.js, enemies.js, prop text, labels, zone names, dialogue.
