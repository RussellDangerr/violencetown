# CS2 — the Crat's reward

The follow-up to `plans/cs1-crat-talk-both-sides.md`. Settling the Crat's dispute pays out.

## Goal

Once you rule on the Crat's dispute, Carrion's blocked road opens. That is the payoff the Sewer
has promised since Carrion was first placed: her line has always been that the road is blocked
and to come back later (`plans/cosmology-and-arc.md`, "Carrion").

## What it rests on

- **CS1** (merged): the Crat's side room north of the Sewer, both sides, the bribes, and your
  ruling. The ruling is the quest flag `cratRuling` (`'a'` or `'b'`), kept by the save.
- **What settling earns you** — ruled: *Carrion's blocked road opens*. The ruling itself notes
  the cost: the road needs somewhere to lead.

## Acceptance

1. Settling the dispute gives the reward, and only once.
2. No reward before a ruling is made.
3. Screenshot at 3440x1440 of the reward (kept outside the repo).
4. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

Tests: `tests/crat-reward.test.js`, played through the same dialogue choices CS1's tests use.

## What was found

- Carrion stands at (8,17) in the Sewer's south corridor. Her "block" is only her adjacency
  line. Nothing on the map is shut: the corridor around her is already open, and the map ends
  in wall one row below her. There is no road tile, no door and no exit to open.
- So "the road opens" needs two things this slice does not have:
  1. **Somewhere for it to go.** No ruling says where yet.
  2. **A way for the Sewer to read the saved flag every time it loads**, the way the town
     re-opens the bridge from `carFixed` (`main.js` `_openBridgeIfCarFixed`). That hook lives in
     `main.js`, outside this slice's files. The quest engine only hears `map_entered` on a walk
     through a door, not on CONTINUE, so it cannot stand in for it.

## Where the road goes (CS2R1, picked a)

A short new Sewer side room south of Carrion's corridor, through a wall that opens after the
ruling, with a [TEXT] sign at its end. It stays inside the Sewer, like the Crat's room.

## What this branch does

- Ruling on the dispute sets a saved flag, , once. Never before a ruling.
- , called from  beside the bridge's hook, reads that
  flag on every Sewer load (so CONTINUE keeps it): the wall tile at (9,19), under Carrion's
  corridor, becomes a drain and a door to .
- The new room is plain and small (10x8), with a [TEXT] sign at its far end and a drain back.
  Its layout, the wall spot and the sign spot are placeholders for Caelan to move.
- Tests in : wall shut before a ruling, open after, on every load,
  the room's doors land on floor, the sign is [TEXT].

## Out of scope

- Any change to Carrion's line, talk or position.
- Words: every line and sign stays a  placeholder until Caelan writes it.
- What is in the room beyond the sign.
