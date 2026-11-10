# hl1 — Help and the first fight explain the numbered attack arc

## Goal
A player is never told that in a fight the number keys fire the arc's slots. Help's Combat
section does not mention the arc, and its Inventory line says 1-9 select a bag slot with no
"outside a fight". Fix both, and add one hint the first time the arc shows.

## Ruling it rests on
HL1R1, pick b: Help, plus a one-time hint in the first fight. All copy is placeholder text
for the owner to write.

## Acceptance
- Help has a line about the arc in Combat; the 1-9 line says it is bag slots outside a fight.
  Placeholder text.
- One hint shows the first time the arc is on in a fight, once, then never again. Placeholder.
- It is a row in `game/hints.js` HINTS, using the existing pacing and seen-hints record
  (`_maybeShowHint` in main.js, untouched). Its check is `arcOn(game)` from fight-arc.js,
  which reads only the game, so main.js needs no edit.
- A test runs the check in a fight and outside one, and that it is shown once.
- npm test, balance:check, naming grep and autoplay:check pass.

## Out of scope
Any real wording; changing the pacing; main.js; the arc itself.
