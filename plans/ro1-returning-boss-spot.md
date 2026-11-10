# RO1: a beaten boss's spot can fill with a different boss

## Goal
Today, 7 zone changes after you beat a boss, the same boss walks back in with no kit and no
drops. Under ruling RO1R1 pick (a): the boss you beat stays dead for good. After the same wait
(the respawn clock, 7 zone changes) a *different* boss takes its spot, and that boss carries its
own loot, which drops once.

This slice builds the mechanism and one obviously fake entry in the Sewer: a tinted Were-Rat named
`[NAME]` with the Were-Rat's numbers. Real second bosses become pool entries later, one card each.

## Rulings it rests on
- RO1R1, pick (a). An exception to SL-6 ("one pick per game, irreplaceable") and to "what you kill
  stays dead until the list brings that same enemy back", for bosses only. The required items stay
  safe: a returning boss has no required item, so the Converter and the three come only from the
  first boss (SL-4 is untouched).
- `plans/spine.md` records the ruling against row SL-6, dated 2026-11-09. Nothing else there changes.

## How
- A second registry, `RETURNING_SPOTS` in `game/slots.js`, kept apart from `SLOTS` so the existing
  slot picks and their tests are untouched. A spot names the map, the boss spawn it replaces, and its
  own pool. One entry for now (`sewer.returning`).
- A spawn on the map carrying `returning: "<spot>"` is left out until its spot is filled. Its
  entry comes from a pick made at new game on its own RNG stream (never `game.rng`), saved with the game.
- `stepRespawns` still hands back who is due. A due id that has a returning spot is not brought
  back: the spot is marked filled instead (`claimSpots` in `game/drops.js`), and the original stays dead.
- A filled spot is saved, so a reload keeps it. An older save with the Were-Rat already beaten
  loads and behaves the same way: its kill is on the respawn list and ages normally.
- The returner is killed and comes back like any other enemy afterwards. Its kit drops the first
  time (it is then marked looted), and it has no required item and no Were-Rat fur (the fur is keyed
  on the Were-Rat's tag).
- The look: the tinyDungeon Were-Rat cell, tinted at load in `game/sprites.js`.

## Acceptance
- Beat the Were-Rat, walk 7 zone changes: the stand-in stands in his spot, he does not come back.
- The stand-in fights; its own loot drops once.
- The Converter never drops a second time.
- Same seed, same returning boss; a reload keeps it.
- An older save with the Were-Rat already beaten loads and behaves the same way.
- Quest 1's autoplay does not move.
- `npm test`, `balance:check`, naming grep, `autoplay:check`.
- Balance golden: if it moves by exactly what the stand-in implies, it is reported, not rewritten.

## Out of scope
- Real second bosses, their names, art, numbers, dialogue and copy (all `[NAME]` / `[TEXT]`).
- Returning spots in other zones.
- Any change to a Locked spine row beyond recording the ruling.
