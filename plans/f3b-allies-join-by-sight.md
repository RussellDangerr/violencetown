# F3b — allies come to your aid when they can see the fight

Part of `plans/fight-fog.md` §1 (who gets pulled into a fight). F3a
(`plans/f3a-hostiles-join-fights.md`) did the hostile half; this is the ally half. Neutrals getting
out of the way is a separate slice.

## Goal

Today a bribed ally (or a summon) hunts any hostile within 8 tiles of it, walls or no walls, and
otherwise follows you. After this, an ally heads into a fight only once it has seen the fight: it
directly sees you, or directly sees someone fighting you. Until then it follows you, exactly as
now.

- "Fighting you" is `fighters()` in `game/fight-area.js`, unchanged.
- "Sees" is the same notice rule F3a uses: `perceives()` in `game/perception.js`, DIRECT verdict
  only (the forward cone, with line of sight and the night cut). A half-noticed flank does not
  count.
- Sight decides who notices, disposition decides what they do. An ally does not need to be
  friendly with a fighter to notice it; it notices it and comes for it.

## How it works

- `allyAids(ally, fs, player, sees)` in `game/ai.js` is pure, and keeps `ai.js` a leaf: the sight
  test comes in as `sees(x, y)`. With no fight on it is false. Once an ally has joined it stays
  in. Otherwise it is true when the ally sees the player's tile or a fighter's tile.
- `_allyTakeTurn` in `main.js` asks it at the start of every ally turn and stores the answer on
  the ally as `_aiding`. That is how the ally stays in once it has joined. The flag drops on its
  own the first turn no fight is on.
- An aiding ally picks its target from the fighters only, nearest first, inside the same 8-tile
  reach as today. With no target, or when not aiding, it follows you as now (closes in past 3
  tiles). Both numbers are left exactly as they are.
- Joining is a turn step, never called from the render path. There is no new log line or copy.

## Acceptance

1. An ally who directly sees the player or a fighter heads into the fight that turn.
2. An ally behind a wall with no view keeps following instead.
3. An ally that joined stays in until the fight ends.
4. Screenshot or GIF at 3440x1440 of a bribed ally joining (kept outside the repo).
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

Tests live in `tests/ally-sight.test.js`. They cover the pure rule, and `_allyTakeTurn` run
against a stand-in game.

## What it rests on

- Caelan's rule for fights: who joins depends on what they can see. Only those of the same
  disposition gang up on you, allies come to your aid, and most neutrals get out of the way.
- F3a, merged: its notice rule (direct view of the player or a current fighter) and its
  `fighters()` set are what this slice reuses.
- If the autoplay golden moves, the slice stops and asks.

## Out of scope

- Neutrals running from a fight (the third slice).
- Allies starting fights. With no fight on, an ally now follows you even if a calm hostile is
  near. Today it would walk up and attack it.
- Faction or species tags. `isFriendlyWith` is unchanged.
- Any change to ally combat, damage, reach or leash numbers.
