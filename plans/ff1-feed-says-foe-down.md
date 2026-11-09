# FF1: when a foe goes down, the fight panel's feed says so

Goal: the existing "[Defeated <name>]" line is filed under the combat category, so the fight
panel's feed (combatLines over the log history) shows it. No new words.

Acceptance
- Defeating an enemy puts its defeat line in combatLines(game._logHistory).
- The line still appears in the [L] history and the strip as before.
- A test drives the real _handleEnemyDeath and the real _log, then reads combatLines.
- npm test, balance:check, naming grep and autoplay:check pass.

Rests on FF1R1, pick b ("Only the defeat"): hits and hits-on-you stay out of the feed.

Out of scope: lines for hits landed or taken, any new copy, renderer or combat-log.js changes.
