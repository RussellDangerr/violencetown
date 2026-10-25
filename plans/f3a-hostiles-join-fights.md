# F3a — hostiles who see a fight join it

Part of `plans/fight-fog.md` §1 (who gets pulled into a fight). This slice is the hostile half
only; allies coming to help and neutrals getting out of the way are separate slices.

## Goal

Today a hostile joins a fight only by spotting the player itself. After this, a hostile that is
not already hunting joins the fight on the turn it directly sees either the player or anyone
already fighting the player.

"Fighting the player" is `fighters()` in `game/fight-area.js`, unchanged. Seeing reuses the one
sight rule, `perceives()` in `game/perception.js`, and only its DIRECT verdict counts: the
forward cone, with line of sight and the night cut. A half-noticed flank does not count.

Gangs form by disposition. A hostile joins on a fighter only if the two are friendly with each
other, through one helper, `isFriendlyWith(a, b)` in `game/ai.js`. For now that is plain
allegiance equality, so every hostile is friendly with every other. A faction or species tag can
replace the body later without touching the callers.

## How it works

- `joiners(map, npcs, fs, player)` in `game/fight-area.js` is pure. It returns every NPC that is
  hostile, alive, not ambient, not an ally, has eyes, is not hunting, and directly sees the
  player's tile or the tile of a fighter it is friendly with.
- `main.js` calls it once per world beat, right after the enemies act, and only while a fight is
  on. Each joiner is set to `chasing` with its last-seen mark on the player and its suspicion and
  lost-sight counters cleared, the same fields a sighting sets in `npc.js`.
- One pass per beat, against the fighters at the start of the pass. Somebody who joins this beat
  can pull in the next hostile on the following beat; a whole room does not join at once.
- It is a turn-boundary step, never called from the render path.

## Acceptance

1. A hostile that is not hunting, and directly sees the player or a current fighter, starts
   chasing that turn.
2. A hostile that sees nothing stays as it is. Allies and neutrals are untouched.
3. The join shows a `[TEXT]` placeholder log line.
4. Screenshot or GIF at 3440x1440 of a second sewer hostile joining (kept outside the repo).
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

Tests live in `tests/fight-join.test.js`.

## What it rests on

- Caelan's rule for fights: who joins is decided by what they can see; only those of the same
  disposition gang up on you; allies come to help; most neutrals get out of the way.
- The loop's choice: noticing reuses the existing sight rule, direct view only.
- Copy is never written here, so the join line is the placeholder `[TEXT]`.
- If the autoplay golden moves, the slice stops and asks.

## Out of scope

- Allies coming to your aid, and neutrals running from a fight (the other two slices).
- Faction or species tags; `isFriendlyWith` stays allegiance equality.
- Any change to `npc.js`'s own spotting, leash or suspicion ladder.
- The join line's real wording.
