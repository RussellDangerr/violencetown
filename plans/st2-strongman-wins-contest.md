# ST2 - the Carnival's first route: the strongman helps you win the contest

**Parent:** `plans/spine.md` (Act 2, the 2026-10-30 entry), `plans/ab3-act2-quests.md`,
`plans/st1-carnival-booth-route.md`.

## Goal

A strongman stands in the Carnival. Gifts turn him to your side exactly as they turn any other
bribeable fighter (give-action.js `applyFlip`: ally, hunts the player's hostiles, leash-follows
the player). Once he is an ally he fights beside you at the contest, which is the same fight as
the booth route's boss. Winning it gives the Stuffed Animal once and ends the Carnival's quest.

## Shape

- `game/slots.js`: one new entry, `strongman`. The Carnival Clown's look, numbers, kit and gift
  values are copied as stand-ins. Name and bark are `[TEXT]`-style placeholders. No `boss`, no slot.
- `game/carnival-map.json`: one hand-placed spawn `strongman` at (43,14), open ground apart from
  the doors, the spawn, the loops walk and the boss.
- `game/quests.js`: when the boss falls and a living ally strongman is in the zone, one `[TEXT]`
  line says so. The quest step is unchanged: the same `collect` step, ended by the booth or the
  claim spot (`act2Claim`), so the item is granted once whichever route was used.
- No change to the booth route: without him it works as ST1 left it.
- `tests/act2-enemy-counts.test.js`: the Carnival's pinned fighter count goes 19 to 20.
- `tools/balance-golden.txt`: the new strongman row and the Carnival's faucet move. The loop
  records this, citing ST2R1; the builder never writes it.

## Acceptance

1. Giving the strongman enough turns him to your side and he fights with you at the contest.
2. Winning with him gives the Stuffed Animal once and finishes the Carnival's quest.
3. Having used one route, the other gives no second copy.
4. Without him, the booth route still works.
5. His numbers and look are flagged for Caelan; every line reads `[TEXT]`.
6. The test plays it with real keys (walking, E); the gift and the ally's blows go through the
   real `applyGive` and `_allyTakeTurn`.
7. Evidence: a 3440x1440 frame of him fighting beside you.
8. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass; the balance golden is
   recorded citing ST2R1.

## Rulings

ST2R1 a: the contest is against the boss and he fights beside you. No Locked spine row moves.
ST1: the booth route this must not double-give with.

## Out of scope

Real look, numbers, name or lines for the strongman; keeping an ally across a save and reload;
SG1's own recruiting (whichever of the two builds second reuses this placing); the other two
zones; any no-fight route (that is option b).
