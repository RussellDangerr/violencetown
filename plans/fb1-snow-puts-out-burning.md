# fb1 — Stepping on snow or ice puts Burning out

## Goal
When the player is Burning and steps onto a snow or ice tile, Burning ends at once: the buff is
removed (so its chip leaves the buff bar), one log line says so, and the damage over time stops.

## How
- `game/data.js` gets `FIRE_QUENCHING_TILES`, a small list of tile ids that put fire out. Today:
  SNOW and ICE. Water is not in the game yet; when it is, it is one more entry in the list.
- `game/main.js`, in the step code right after the hazard check, ends the `fire` buff when the
  tile just entered is in that list. The log line is a `[TEXT]` placeholder.

## Acceptance
1. Burning, stepping onto snow or ice ends it at once and the chip goes.
2. Not burning, snow and ice do what they do today (no buff, no log line).
3. Other damage over time (sludge, poison) is not touched by snow or ice.
4. The test walks onto the tile with real arrow keys, through the game's own keydown listener
   and its own step.
5. Evidence: 3440x1440 frames before and after the step.
6. `npm test`, `balance:check`, naming grep and `autoplay:check` pass.

## Rests on
Ruling FBR1, pick (b): "Stepping onto snow or ice puts it out". His note: "Ice and water".

## Out of scope
Water tiles, any item that cures Burning, new art, final wording of the log line.
