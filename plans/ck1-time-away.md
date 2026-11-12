# CK1 — the game works out how long you were away

## Goal
Give the game one number it can read: how many whole hours passed between the save's `savedAt`
stamp and now. Nothing reads it yet; this is the clock that later "news while you were away"
work will use. No player-visible change.

## How
- `game/away.js` (new): `MAX_AWAY_HOURS` (placeholder, 168 = 7 days), `hoursAway(savedAt, now)`
  (floor of elapsed hours; a clock set backwards, or a missing/garbled stamp, gives 0; capped at
  the max), and `readAway(game, savedAt, now)` which stores the result on `game.hoursAway`.
- `game/main.js`: read it once on load (from the save being loaded) and once per return to the
  tab (from the save written when the tab was hidden), before any later save overwrites the stamp.
- No new save field, so the autoplay fingerprint does not move. No main-RNG draw. No timers counted.

## Acceptance
1. On load and on return to the tab, real time since `savedAt` becomes whole hours.
2. Clamped: backwards clock gives 0; top is the 7-day placeholder.
3. Read once per return, never by counting timers.
4. A test goes through the real save, write and read path with the clock moved forward.
5. Play is unchanged; the autoplay's virtual clock gives 0 hours away.
6. npm test, balance:check, naming grep, autoplay:check pass with no drift.

## Rulings
Caelan approved the card with the 7-day cap as a placeholder number. One step per hour comes
from the research.

## Out of scope
Anything that uses the number (news, absence effects, UI).
