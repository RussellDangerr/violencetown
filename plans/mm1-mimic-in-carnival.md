# MM1 — a chest in the far corner of the Carnival is a Mimic

## Goal
One hand-placed enemy at (54,16) in the Carnival. Asleep, it is drawn as a chest, sees nothing
and shows no name, target panel, verb, bars or threat; walking past it starts nothing. Bumping it
wakes it for good: it is drawn as itself from then on and hunts the player, which starts the fight.

## Acceptance
- At (54,16) a chest with no name, panel or threat overlay; walking past starts nothing.
- A bump wakes it; it draws as itself afterwards (test, and a frame).
- A save made before the bump keeps it asleep; one made after keeps it awake.
- Every other chest still opens as before.
- tools/balance-golden.txt gains its one Carnival row and the Carnival faucet gains its gold, nothing
  else moves; recorded in its own commit that accepts MM1R1. Any other row moving means stop and ask.
- The autoplay golden does not move.
- npm test, balance:check, naming grep, autoplay:check pass. Evidence: 3440x1440 frames before and after the bump.

## How
- `carnival_mimic` registry entry (slots.js), a hand-placed spawn in carnival-map.json.
- Enemy gets `disguised` and `wakeSight`: while disguised `sightRange` is 0 (so it is no watcher,
  no fighter, no threat), the real reach is kept in `wakeSight`, both saved. `wakeDisguise` ends it.
- main.js: the bump on a disguised enemy wakes it before the shove/target logic; `_targetAt` ignores it.
- renderer.js: a disguised enemy draws as the existing closed-chest cell and nothing else.
- sprites.js: `Mimic` awake art is an existing Tiny Dungeon cell.

## Rulings and picks
MM1R1 (picked a by Caelan): the balance golden gains exactly one Carnival row for the Mimic and +7 on the Carnival faucet, recorded in a commit citing the ruling. PCR3 (picked a): all player-visible copy is plain and true to the code, no brackets; the name Mimic stays. Stand-ins (flagged for Caelan): the Carnival Clown's numbers and kit, the name `Mimic`,
its plain bark and examine line, the awake art cell. A sleeping mimic never barks.

## Out of scope
Real name, barks and art; mimics elsewhere; waking by anything other than a bump.
