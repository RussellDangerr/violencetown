# FX3 + FX3b — a kill's loot goes straight into your bag, and bursts out to you

Two cards on one branch, because the auto-loot should never reach a player without the burst
that shows it.

## Goal

**FX3.** Today a kill leaves its kit, its required item (the Sewer boss's converter) and its
special drops (the Were-Rat's fur, Pike's rope) on the floor, and you walk over them to pick
them up. Gold already moves straight to you. After this slice everything a kill gives goes
straight into the bag the moment the enemy dies, and nothing is left on the ground. The log
still names each item, with the line a walk-over pickup already uses (`[Picked up …]`), after
the lines the kill already logs. Quests react the same way they did to a pickup.

**FX3b.** The loot is already in the bag, so the burst is pure show: each item pops out of the
body, arcs outward, hangs for a beat, then flies into the player and is gone. It uses the
item's own icon (the one it would have shown on the floor). It never blocks input, never holds
a turn, and leaves no trace in the save.

## Acceptance

FX3:
- Killing anything puts its gold, kit, required item and special drops into the bag; nothing
  is left on the ground and no ground drop is recorded for the zone.
- The log names what you got.
- A full bag grows another page (FX3R2, already on `dev`).
- Quest 1's autoplay drifts, because the bot no longer walks over loot. That drift is what
  FX3R1 asked for; it is reported, not written.
- `tests/auto-loot.test.js` runs the real death handler: kit, required item and boss items land
  in the bag; the ground stays empty; a respawned boss still gives its items only once; the
  converter's pickup still moves the quest on.

FX3b:
- Every auto-looted item bursts from the body and flies to you with its own icon.
- It never blocks input or slows a turn: the burst is a list the renderer reads, and nothing
  waits on it.
- `tests/loot-burst.test.js` pins the burst's frames for a known kill.
- A GIF at 3440x1440 of a boss kill's loot burst (scratchpad only, never committed).

Both: `npm test`, `balance:check`, the naming grep and `autoplay:check` (its drift reported).

## Rulings it rests on

- **FX3R1** (his answer): players have auto-loot on all the time, with no weight limit; the
  loot should "explode out". A later reel of what you got is a separate card (FX3c).
- **FX3R2, pick (a):** the bag never fills; it grows another page whenever it runs out (BG1).

## How it is built

- `game/main.js`: the death handler gathers what the kill gives into one list instead of
  pushing each item onto the floor. `_takeKillLoot` puts each one in the bag, logs it, fires
  `item_pickup`, saves, and starts the burst. Anything that cannot be bagged (an item that does
  not resolve) still falls to the floor as before. The list is handed over after the sewer
  escape counter, so quest events come in the same order a walk-over pickup gave them.
- `game/loot-burst.js`: the burst as pure functions of time. Where each item is, in pixels,
  given the body's and the player's screen points; whether a burst is over.
- `game/renderer.js`: draws live bursts in the world layer, under the damage numbers.

## Choices this slice makes (flagged for review)

- The burst's timings and shape are the builder's numbers: items leave 60 ms apart, take
  240 ms to pop out to 1.1 tiles from the body with a 0.6-tile hop, hang 140 ms, then take
  260 ms to fly in. They spread evenly around the body, the first one straight up.
- Gold has no item icon, so it does not fly; its log line is unchanged.
- Reduce Motion keeps the burst but flattens the hop.
- Auto-looted gear goes into the bag, as a walk-over pickup did; it is not worn automatically.

## Out of scope

- The reel of what you got (FX3c).
- Any new copy, names or tuning; loot amounts are unchanged.
- Chests, stashes and items placed on maps: they are still taken by hand.
- The superseded spread-on-tiles branch (`feature/fx3-boss-loot-spread`), left alone.
