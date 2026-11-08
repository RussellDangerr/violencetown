# RB1 — losing to the sewer's rats leaves your things in a stash you can win back

## Goal

The sewer has a defeat where the rats rob you: everything at risk in your bag goes into a chest,
you wake at the sewer mouth, and you can walk over and take it all back. Today it can never fire.
It only matches the Were-Rat, and a Were-Rat defeat never reaches the scenario table: the Were-Rat
is a boss, so losing to it always gives the boss retry.

Make it fire when the sewer's ordinary rats beat you: the rats that pour out of the walls in the
escape gauntlet.

## What changes

One line in `game/defeat-scenarios.js`: the robbery's `when` also matches a defeater tagged
`sewer_rat` (the gauntlet's rats, made in `game/sewer-setpiece.js`). It still requires the sewer
zone. Its weight (3), stash spot (17,10, the Were-Rat's floor), wake spot (the sewer mouth) and log
line stay exactly as they are, and so does the stash chest, which is already built in `main.js`.

The Were-Rat match stays in the predicate. It is unreachable in play (the boss retry runs first), and
it keeps the existing cost-log tests, which drive the robbery through a bossless Were-Rat, valid.

## Acceptance

- Beaten by a gauntlet rat in the sewer, the robbery can fire. Your at-risk things go into a stash
  chest at or near (17,10), and the cost line after the scenario line names each of them.
- Opening the stash gives everything back, and the stash is reachable on foot from where you wake.
  During the gauntlet the sewer mouth is barricaded and a portcullis drops mid-hall; the portcullis
  closes one cell of a three-wide hall, so the way east stays open.
- The Were-Rat still gives the boss retry. Defeats by anything else in the sewer pick from the same
  scenarios as today; the Canyon's rats are not in the sewer and are unchanged.
- A test loses to a gauntlet rat through a real world turn (the real enemy turn and the real damage,
  death and defeat code from `main.js`), then walks to the stash and opens it with real keys.
- Evidence: 3440x1440 frames of the wake-up log and of the stash chest.
- If quest 1's autoplay moves, stop and ask before accepting a new golden.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## The ruling it rests on

Caelan's pick on "the rats-rolled-you defeat can never happen: keep it for ordinary rats, or cut
it?": keep it. It fires when ordinary sewer rats beat you, and your things wait in their stash to
win back. The cost he accepted: a rat defeat costs less than other defeats, since you can recover
it.

## Out of scope

- Any change to the weight, stash spot, wake spot or log line.
- Gold in the stash (gold taken by a robbery is still a separate, documented follow-up).
- The side room north of the sewer, which is also zoned "SEWER": a rat that chases you in there and
  wins would put the stash at that room's spawn. Flagged, not changed.
