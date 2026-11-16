# WN1 — the fight panel names what the foe is weak to and resists

## Goal
The right-hand fight panel gets one line naming the foe's weakness, and one for its
resistance, so a player can plan the next swing without guessing.

## Rulings this rests on
- WNR1, pick (b), "once learned": a weakness (or resistance) shows only after you have hit
  that kind of foe with that damage type once, and stays known for that kind.
  - "Kind of foe" = the enemy `type`.
  - A small known list is saved with the game: `{ <enemy type>: [damage types hit with] }`.
  - The save entry is left out while the list is empty, so a save with nothing learned is
    byte-identical to today and the autoplay fingerprint holds.

## Acceptance
1. A foe whose weak/resist list holds a type you have hit it with shows a line for it; a foe
   with nothing learned (or with neither list) shows no line.
2. Learning happens in the real hit path (`combatAttack`), only for types in the foe's
   weak/resist lists. Immune hits and ordinary types learn nothing.
3. The known list survives a real save and load, and is omitted from the save while empty.
4. The line's label is the `[TEXT]` placeholder; Caelan names it.
5. A test drives a real hit through `combatAttack` (lifted from main.js) and round-trips the
   list through real `serialize`/`writeSave`/`readSaveRaw`/`loadInto`.
6. `npm test`, `balance:check`, the naming grep, and `autoplay:check` pass.

## Out of scope
- Any real wording, icons or colours for the line (placeholders only).
- Showing immunities.
- A codex or bestiary page for what is known.
