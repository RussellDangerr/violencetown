# bp4b-boon-amounts: a boon gives the amounts that were picked

## Goal
A boon poition gives +10 max MP, +1 armour or +1 strength. Until now every kind gave 1.
The three amounts live in one table, `BOON_KINDS` in `game/items.js`. The MP number the
poition carries and the number a thrown boon takes from an enemy both read from it.

## Acceptance
- `BOON_KINDS` says mana 10, defence 1, strength 1, and nothing else in items.js repeats those numbers.
- Drinking the MP kind raises max MP and MP by 10.
- A boon thrown at a hostile lowers its max MP by the same 10.
- The BP1, BP2 and BP4 tests that pinned 1 for MP now assert 10, exactly. None is loosened or removed. Done in its own commit.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass. A fingerprint-only autoplay move is filed as an accept ruling and not re-recorded.

## Rests on
BPR3, option (b), picked by Caelan: "Middle: +10 MP (or HP), or +1 armour or strength."
BP1 to BP4 are merged to dev.

## Out of scope
Any max HP kind, copy, art, prices, and re-recording any golden or baseline.
