# PC3c: log lines outside main.js say plainly what happened

Branch: feature/pc3c-other-log-plain, cut from dev.

## Goal

Every line a player reads that comes from these files is plain, flat, bracket-free and true to
what the code does: npc.js, give-action.js, defeat-scenarios.js, compactor.js, sewer-setpiece.js,
hit-splat.js, hypno-vision.js, buffs.js, item-uses.js, hints.js, theft.js, trade.js,
interactions.js, quests.js. This is the same job PC1 to PC5 did for other files, done for the
lines that live outside main.js, dialogue.js, slots.js, renderer.js and the maps.

## Rule it rests on

Ruling PCR3 (picked 11-17): AI-written creative lines (jokes, character voice, atmosphere, story
prose) become deadpan and factual. Every name stays, with his quoted lines and the design facts
in plans/. No square brackets on player text. Each line must match what the code does.

## What changes

- Placeholders: the mug line, the item-uses labels and payoffs, the hints, the lift-preview words,
  the sale-lock refusal, the Mola Cola notes and the bears-leave line, the dodge word.
- Bracket-wrapped log lines lose the brackets: NPC awareness and kit lines, give reactions,
  compactor lines, Hypno Vision lines, buff tick lines, the new-quest line.
- Flavoured lines become facts: the five defeat scenarios, the sewer gauntlet lines, the give
  reactions, the hit-splat kind words, the hints.
- Quest ids, stage ids and the `[TEXT]_claim_*` / `[TEXT]_booth_*` ids stay as they are: they are
  internal ids, not player text.

## Acceptance

1. No player-visible string in the listed files has square brackets or a `[TEXT]` marker.
2. Each changed line says what the code does (the checker verifies each one).
3. Tests that pinned the old lines are re-pinned to the exact new lines, never loosened. The
   count in tests/plain-copy-guard.test.js is lowered to match.
4. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.
5. Evidence: 3440x1440 frames of two changed lines.
6. A new test, tests/pc3c-other-log-plain.test.js, pins the new lines and the absence of brackets.

## Out of scope

main.js, dialogue.js, slots.js, renderer.js and the maps. Quest stage text and ids. The look of
any splat (renderer.js). Any new copy that is not a plain fact.

## Blocker found on first grep

About 23 existing test files pin the old lines or the bracket count. They are outside the touches
list, so this branch holds the spec only until the touches are widened.
