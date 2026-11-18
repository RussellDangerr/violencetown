# PC9: names show without square brackets

## Goal
Item, weapon, ring, costume, enemy and boss names are stored and shown as plain words, with no
square brackets around them. "[Rock]" becomes "Rock", "[Snowman]" becomes "Snowman".

## Acceptance
1. Enemy names are no longer wrapped (enemies.js entity name and the shown-name refresh). Weapon
   tier names and class names are no longer wrapped (weapons.js).
2. Names in the data of items, weapons, rings, costumes and slots (bosses and enemy types) carry
   no brackets. Every name keeps its words exactly.
3. The stripping that only undid the wrapping in the two fight panels (renderer.js) goes.
4. Old tests that pin bracketed names are re-pinned to the exact new names, in their own commit.
5. plain-copy-guard's allow-list counts fall to match.
6. npm test, balance:check, the naming grep and autoplay:check pass.
7. Evidence: 3440x1440 frames of a fight target panel, the bag, and an examine line.

## Rulings it rests on
- PCR3 (LOOP.md section 6): plain copy, keep every name word for word, no square brackets in
  player text.
- PC9R1: touches widened to the 31 test files that pin the old names.
- Hand pair names ('[PAIR: ...]') and any [TEXT]/[NAME] marker are left alone (later copy work).
- Whole-line log brackets such as "[Dropped Rock x2]" stay (PC3b/PC3c handle log lines).

## Out of scope
Dialogue and buff names, map JSON names, log-line wrapping, placeholder markers, overhead
speech bracket stripping (it also serves bark text, which still holds [TEXT] markers).
