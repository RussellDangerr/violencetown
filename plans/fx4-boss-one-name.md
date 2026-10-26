# FX4: every surface calls a boss by its one name

**Date:** 2026-10-26

## Goal

An Act 2 boss has a name in its registry entry (`game/slots.js`), and the line over its head
already uses it. Other surfaces print its type instead, so the same boss shows up as "Alien
Invasion" over its head, "[Boss]" in the log and "BOSS" on the target panel and the KO tag.
After this slice every surface that names a boss uses `labelOf()` from `slots.js`. That function
prefers the entry's `name`, so the boss reads the same everywhere.

The surfaces:

- the death line in the log (`[Defeated …]`), which reads the fighter's `entity.name`;
- the turn lines in the log: `… turns on you!` (main.js), plus the perception lines that read
  `entity.name` (`… turns to face you!`, `… spotted you!` and their siblings in npc.js);
- the target panel in a fight (the right-hand panel);
- the `[KO]` tag under a body;
- the label over the head of the character you face;
- and, for consistency, the fight banner's nearest-foe name and the "strike …?" confirm.

## How

- `game/enemies.js` exports one helper, `shownName(enemy)`. It returns `labelOf(enemy)` for a
  boss and the enemy's `type` for anyone else. A boss's `entity.name` is built from it, so every
  log line that reads `entity.name` follows without touching each one.
- The other surfaces call `shownName` in place of `type`. Where a surface preferred `name` for
  ordinary characters, it keeps doing that.
- `game/fight-panels.js` is outside this slice's reach, so the renderer overrides the target
  panel's `name` with `shownName` when it draws it.

## Acceptance

- The death log, the turn lines, the target panel, the KO tag and the overhead label all show the
  same name for an Act 2 boss (the Alien Invasion is the check).
- Ordinary enemies read exactly as before: a test pins a plain enemy's surfaces to its type, and
  a named non-boss (the Alien's allies) keeps its old text.
- At least one test drives the kill through the same path a player does (the game's attack
  call), not just the formatter.
- A screenshot at 3440x1440 of a boss's target panel and of its death line, from real key input.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings and picks

None. No new names: the entries' existing names are used, and `labelOf()` already exists.

## Side effect to check

The Were-Rat is a boss with no `name`; `labelOf()` gives it the existing label "Were-Rat" (the
same one its drop line uses), so its death line, KO tag and panel now read "Were-Rat" in place
of "Wererat". That follows from the card's rule; it is flagged for Caelan in the report.

## Out of scope

- Writing real names for any boss.
- Other characters' text, the examine lines, trade and dialogue headers.
- Changing `fight-panels.js` or `slots.js`.
