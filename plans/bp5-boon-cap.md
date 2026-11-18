# bp5-boon-cap: a visible cap on boons

## Goal
A game allows at most 12 boon poitions drunk, counted across every kind (max MP, armour,
strength). Drinking a 13th is refused with a plain line, the poition stays in the bag and no turn
passes. The Quests tab shows the count against the cap, "n / 12".

## Rulings it rests on
- BPR3 (b): "+10 MP (or HP), or +1 armour or strength". Already on dev from BP4b: `BOON_KINDS` in
  `game/items.js` holds mana 10, defence 1, strength 1. Not redone here; a test confirms the amounts.
- BPR4 (a): "12, and the Quests tab shows n / 12".

## Build
- `game/items.js`: `BOON_CAP`, `boonCount`, the refusal line; `resolveUse` also refuses at the cap.
- `game/main.js`: `_openBoonChooser` (the one door both the item list and the Remoticon use) refuses.
- `game/renderer.js`: the Quests tab line, replacing BP1's placeholder.
- `plans/spine.md`: a dated, non-Locked row recording the cap.
- `tests/boon-cap.test.js`.

## Checks
Drink to 12 across mixed kinds and stats match; the 13th is refused with the line and the poition
kept; the Quests line reads n / 12; the spine row exists and is not Locked.

## Out of scope
Final wording of the lines; thrown boons (BP2); any change to amounts.
