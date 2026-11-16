# CK2 - the city tells you something happened

## Goal
After an hour or more away, the first zone change gives one piece of news as a line in the log.
Under an hour, nothing. News only: no chores, no state changes. Builds on CK1 (`game/away.js`
works out `hoursAway`).

## Acceptance
- At least an hour away: the first zone change logs one news line, `[TEXT]` placeholder words.
- Under an hour: no news.
- Same save stamp and same hours: same news. It comes from its own hash-keyed stream, never from
  `game.rng` (which is neither read nor advanced).
- Being away costs nothing: items, gold, health and quest state are untouched.
- The test reaches the news through a real zone change (the game's own transition step).
- Evidence: a 3440x1440 frame of the news from real keys.
- npm test, balance:check, naming grep, autoplay:check pass with no drift.

## Rulings
- CK1R1, pick a: a line in the log as you enter a zone.

## Out of scope
- Real news copy (placeholders only), zones really changing while away, any UI beyond the log.
- A new save field: the stamp CK1 already reads is the key.
