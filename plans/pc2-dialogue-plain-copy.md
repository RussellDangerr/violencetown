# pc2-dialogue-plain-copy

## Goal
Every `[TEXT]` in `game/dialogue.js` and the canyon taxi driver's name in `game/canyon-map.json`
becomes a flat functional line: who the character is, what they do for you, what picking a choice
does, what happened. No jokes, no character voice, no story prose. A nameless character goes by
its role ("Taxi driver"). Lines already written (Pike, Platero, Bartho, Macc, the cook, the
Financier's banter, Knuckles) are untouched.

## Acceptance
- No `[TEXT]` in dialogue.js, and none in the canyon-map taxi driver's name.
- Dialogue ids and choice ids unchanged.
- Each plain line is true to the code it describes.
- The old tests that pin the dialogue `[TEXT]` lines are re-pinned to the exact new lines, never
  looser, in their own commit. In carnival-cast.test.js only the assistant manager dialogue pins
  change; its bark pins stay for PC2b.
- crat.test.js's "every Crat line is a placeholder" check becomes "no Crat line is a placeholder".
- npm test, balance:check, naming grep, autoplay:check pass.

## Rests on
PCR1 (a): plain deadpan lines; `[TEXT]` never reaches a player. PC2R1 (b): this card is dialogue
only; slots.js barks and examines moved to PC2b.

## Out of scope
- slots.js (PC2b).
- The canyon wreck text: it lives in canyon-map.json and in the radical piece
  `game/radicals/canyon/wreck.json`, which a test requires to match, and the radical is outside
  this card's touches.
- Bracketed names that are not `[TEXT]` (`[Factory Manager]`, `[Strongman]`, `[Nerd]`), the
  `[TEXT]` in main.js log lines, other map transitions.
