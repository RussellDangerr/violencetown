# AL1 — a third autoplay run: the everyday loops

## Goal

The autoplay plays quest 1 twice (the fighter and the sneak). Neither touches the things a
player does every few minutes: picking something up, putting it on through the bag, dropping
something, and selling and buying at a vendor. A third script, `loops`, does exactly those, on
the real page, with the keys a player presses, and checks where it ends up.

Nothing in the game changes. This is tooling: `game/autoplay/`, `tools/autoplay.mjs` and the
autoplay golden.

## What the run does

1. Walks from the town spawn south into the Carnival.
2. Picks up the Lion Whip and the Fire Blood lying near the Carnival entrance (pickups are
   automatic when you walk onto them).
3. Opens the bag (Tab), walks the cursor to the whip, and presses Equip. The wooden sword goes
   back into the bag.
4. In the same bag, walks to the Fire Blood and presses Drop.
5. Walks back through town and west into the Factory.
6. Fights the Greedy Green between the door and Puck. This fight is needed: every vendor in
   reach starts with an empty or near-empty till and the player starts with 0 GP, so without
   loot there is nothing to buy with. The Green's purse is the gold.
7. Faces Puck, presses E, and sells the wooden sword: cursor to its row, Space to stage it,
   Enter to make the offer.
8. Opens the offer again and buys one rock: Right to Puck's side, cursor to the row, Space,
   Enter.
9. Checks the end state: the whip is the worn weapon, the sword and the Fire Blood are gone
   from the bag, a rock is in it, and the gold moved by exactly the sale price and the buy
   price at Puck's mood.

The run records its end state (bag, worn weapon, gold) in the golden next to quest and sneak,
so any later change to these loops shows up as drift.

## Acceptance

- `npm run autoplay -- --script=loops` finishes, and its end state is what the script expects.
- `npm run autoplay:check` runs quest, sneak and loops. The quest and sneak golden entries are
  byte-for-byte what they were.
- Every action is a real key event. The driver reads game state to decide which key to press;
  it never calls into the bag or the shop.
- Evidence: a GIF of the loops run.
- The loops golden entry lands in its own commit, citing ruling AL1R1.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

- **AL1R1 — may the autoplay golden gain a third entry for the loops run?** Pick (a): yes; the
  loops entry is recorded in its own commit citing the ruling. Quest and sneak stay byte for
  byte.

## How it is built

- `run.js`: the `loops` script is a list of steps. A goals step is played by the standard
  fighter (`player.js decide`), the same player as the quest run. A bag step and a shop step
  press keys through one helper each, so when the bag's keys change (bag pages are coming)
  there is one place to adjust.
- `path.js`: a pure `cursorPath` that plans the presses to walk a geometric cursor from one
  rect to another, using the game's own nearest-rect rule. Tested in node.
- `player.js`: a kill goal may name an enemy by id as well as by tag or slot.
- `tools/autoplay.mjs`: `loops` joins `CHECKED`, on its own seed. Its golden entry also keeps
  its end state. The quest and sneak entries keep exactly the fields they have today.

## Out of scope

- Any change to the game itself, including vendor tills, prices or the bag.
- A fight-free loops route (not possible from a new game today; see step 6).
- Tap/pointer input; the run is keys only.
- Gold-chip toggling on the offer screen (tap only today).
