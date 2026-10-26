# F3c — bystanders clear out of a fight

Part of `plans/fight-fog.md` §1 (who gets pulled into a fight). F3a
(`plans/f3a-hostiles-join-fights.md`) pulled hostiles in, F3b (`plans/f3b-allies-join-by-sight.md`)
brought allies to your aid. This is the third part: most neutral characters get out of the way.

## Goal

Today a neutral keeps wandering, working or standing about while a fight happens next to it.
After this, a neutral who sees the fight moves away from it until it is outside the fight area,
waits there, and walks home once the fight is over. Vendors and quest givers stay where they are.

## How it works

- **Noticing** is the rule F3a and F3b use: `perceives()` in `game/perception.js`, DIRECT verdict
  only, on the player's tile or the tile of anyone in `fighters()` (`game/fight-area.js`). Once a
  neutral has noticed, it stays scared until the fight ends, even after it turns its back.
- **The fight area** is what `fight-area.js` already calls it: every tile at least one fighter
  perceives. A scared neutral inside it takes one step a turn away from the player and the
  fighters. It prefers a tile no fighter can see, and otherwise the one furthest from the nearest
  of them. Outside the area it stands still until the fight ends, so it does not wander back in.
  The step is `fleeFrom()` in `game/pathing.js`, which the fear debuff's `fleeStep()` now uses too,
  unchanged for a single threat. No random draw is spent.
- **After the fight** the scare is dropped on the neutral's next turn, and it walks home to the
  tile it spawned on, along a real path, one step a turn. Wanderers too, though they normally
  have no post. If the way home is blocked it gives up and carries on from where it stands, so
  nobody is left stuck.
- **It never makes a fighter.** Fleeing is a flag on the neutral (`_fleeing`), never its `state`,
  so `fighters()` (which counts only hunting characters) never counts it, and the fight still ends
  on its own terms. The flag is not saved: a reload simply has nobody scared.
- **Where it runs:** at the top of `tickNpcState` (`game/npc.js`), for neutrals only. Neutrals
  already take their turn on every committed action during a fight (`_worldBeat` in `main.js`),
  so no wiring in `main.js` is needed.

## Who holds their ground

From the ruling, vendors and quest givers hold. In code (`holdsGround()` in `game/npc.js`):

- the characters the ruling names, by spawn id: the Corner Merchant (`dt-merch1`), the Cook
  (`diner-cook`), the Pit Boss (`casino-pit-boss`), Pike (`pike`), Carrion (`carrion`), Platero
  (`dt-platero`) and the Financier (`bank-financier`);
- anyone else marked a vendor (`vendor: true`), since the ruling says vendors hold;
- anyone `heavy` (the Sludge Bloom, which is a puzzle wall and must not move) and bosses.

Everyone else runs.

## Acceptance

1. A neutral who sees the fight, and isn't one that holds, moves away until it is outside the
   fight area.
2. When the fight ends it heads home, and none is left stuck scared.
3. A fleeing neutral never counts as a fighter, and the fight still ends normally.
4. A GIF at 3440x1440 of townsfolk scattering (kept outside the repo).
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

Tests live in `tests/npc-flee.test.js`.

## What it rests on

- Caelan's rule for fights: who joins depends on what they can see; only the same disposition
  gangs up on you; allies come to your aid; most neutral characters run out of the way.
- His pick on who stands their ground: vendors and quest givers hold, everyone else runs, with
  the seven named above.
- F3a and F3b, merged: the notice rule and `fighters()`.
- If the autoplay golden moves, the slice stops and asks.

## Out of scope

- Any log line, emote or copy for a fleeing neutral.
- New distances or tuning numbers: there are none; "away" is measured from the fight area.
- Neutrals joining a fight on either side, and hostiles or allies running.
- A data field on map spawns for holding ground (maps are not this slice's files).
