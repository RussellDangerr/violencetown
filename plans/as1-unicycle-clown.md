# AS1 — the assistant manager: a small clown riding a unicycle

## Goal

One more person in the Carnival: a short clown on a unicycle who rolls about near (32,3),
never fights, and talks when you talk to him. He is the "someone you talk to" in ruling LN1R1
(picked a): the ringmaster is a boss you may draw instead of Bigfoot, the lion and the clown
are mini-bosses you always meet, and the assistant manager is a person, not a fight.

What he is for is left open. He talks and does nothing else.

## What gets built

- A registry entry in `game/slots.js`, placed by hand like the lion (`{ id, entry, x, y }`).
  He shares the Carnival Clown's type, so there is no new sprite row. A townsperson's numbers,
  the same as the Crat's: no damage, a dialogue, and a short wander near his spot.
- Two draw fields on the enemy (`drawScale`, `unicycle`), set only by his entry. They are
  saved only when set, so every other enemy saves exactly as before, and they survive a save
  and reload.
- `_drawEnemySprite` draws a creature with a `drawScale` smaller, standing at the base of the
  tile, and a `unicycle` as a canvas primitive under him (a wheel whose spokes turn as he
  rolls, and a seat post). Creatures without those fields draw as before.
- A dialogue entry in `game/dialogue.js`: a greeting and one choice, every line `[TEXT]`.
- One spawn in `game/carnival-map.json` at (32,3).

## Acceptance

- He starts at (32,3), wanders, never attacks, and talking opens `[TEXT]` lines.
- He draws visibly smaller than the Carnival Clown with a unicycle under him, and stays so
  through a save and reload.
- Every other enemy draws as before, shown by a test on the draw fields.
- `tools/balance-golden.txt` gains his one Carnival row and nothing else moves. Written in its
  own commit citing this card (by the loop; a builder never runs `balance:write`).
- The autoplay golden does not move.
- Evidence: a 3440x1440 frame with him beside the Carnival Clown, and a GIF of him rolling.

## Rulings it rests on

- LN1R1, option a (Caelan): the assistant manager is someone you talk to.

## Stand-ins (all for Caelan to replace)

Every line is `[TEXT]`; the name is `[Assistant Manager]`; the numbers are the Crat's; the
drawn size and the unicycle are placeholders until the art pass.

## Out of scope

- What he is for (a quest, a shop, a favour).
- Real art for him or the unicycle.
- Any new sprite row, and any change to the Carnival Clown.
- The Carnival fighter-count test needs one number changed (18 to 19, since his spawn is on
  the map); that is done in its own commit that says the behaviour changed.
