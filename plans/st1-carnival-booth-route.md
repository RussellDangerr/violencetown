# ST1 - the Carnival's second route: the guarded booth

**Parent:** `plans/spine.md` (Act 2, the 2026-10-30 entry), `plans/ab3-act2-quests.md`.

## Goal

The Carnival's quest already ends at a claim spot once the boss has fallen. This adds a second way
to the same end: an abandoned booth the boss guards. Beat the boss, reach the booth, take the
Stuffed Animal. Whoever fills the `carnival.boss` slot is the guard; no boss is named anywhere.

## Shape

- `game/carnival-map.json`: one new solid prop and examinable, id `[TEXT]_booth_carnival`, text
  `[TEXT]`, near the boss spot. The booth's art (a placeholder shelf prop) and its spot are
  stand-ins for Caelan's repaint. The older `booth` examinable at (28,12) is a shuttered decoy far
  from the boss and is left alone.
- `game/quests.js`: the Carnival quest record gains `boothId`. Examining the booth while the boss
  lives says one `[TEXT]` line and gives nothing. After the boss has fallen it runs the same last
  step as the claim spot (`act2Claim`), so the item is granted once and the quest goes to `done`;
  using either spot afterwards gives nothing. The step is already a saved flag, so a reload keeps
  its place.
- `game/main.js`, `game/dialogue.js`: untouched; the booth is examined by the existing E key.
- `plans/spine.md`: one dated line recording what "earned" covers (ST1R1).

## Acceptance

1. With the boss alive the booth cannot be taken from.
2. Beating the boss and using the booth gives the Stuffed Animal once and finishes the quest.
3. A reload at each step keeps its place.
4. The spine records what "earned" covers, dated.
5. Every line is `[TEXT]`; the booth's look is flagged for Caelan.
6. The test plays the route with real keys.
7. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings

SQ1R1 a: each zone's quest can be finished in different ways, every way ends in that zone's item.
ST1R1 a: you earn it by beating the guard, and then it is yours to take.

## Out of scope

Blocking tiles or a locked door (the guard gates the use, not the walk), real copy, real art, any
change to the claim spot, the other two zones.
