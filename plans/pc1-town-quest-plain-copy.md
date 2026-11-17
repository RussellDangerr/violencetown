# pc1-town-quest-plain-copy

## Goal
Town and the quests say plainly what things are and what to do. Every `[TEXT]` in
`game/town-map.json` and `game/quests.js` is replaced by a flat functional line: what the thing
is, what it does, what the player should do about it. No jokes, no character voice, no story
prose. A nameless character goes by its role ("Taxi driver").

## Acceptance
- No `[TEXT]` left in the two files, apart from ids that other files must match.
- The car examinable says it is your car and that you go to the sewer and kill the Were-Rat so it
  drops the cataclysmic converter.
- The bridge examinable, the taxi driver's name and the tail of Hooch's fuel card are plain.
- Every quest title, objective and hand-over line in quests.js is plain.
- Quest ids, stage ids and examinable ids are unchanged.
- npm test, balance:check, naming grep, autoplay:check pass; a fingerprint-only autoplay move is
  filed as an accept ruling, never re-recorded.

## Rests on
PCR1, picked (a): plain deadpan lines; `[TEXT]` never reaches a player; creative writing stays
with Caelan. LOOP.md section 6.

## Out of scope
Copy in other files (main.js car/bridge log lines, dialogue.js taxi lines, map claim-spot text).
Tests that pin `[TEXT]` outside `touches`.
