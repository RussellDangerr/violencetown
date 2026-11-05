# cw1: The Clown, one named mini-boss apart from the ordinary Carnival Clown

## Goal
The Carnival gets one named clown: a mini-boss you always meet, per ruling LN1R1 (a): the
ringmaster is the boss you may draw instead of Bigfoot, the lion and the clown are mini-bosses
you always meet, the assistant manager is someone you talk to.

He is separate from the five ordinary Carnival Clowns, which stay exactly as they are
(armour 0, one per spawn, they take a bribe, they wander).

## What changes
- `game/slots.js`: one new registry entry, `the_clown`, placed by hand the way the lion and the
  rats are (`{ id, entry, x, y }`). Stand-in numbers and kit: the Fungus King's (100 hp, armour 6,
  damage 12, 20 GP) with one of the two sludge sacks swapped for Fire Blood, so he has Fire Blood
  to throw. He is `bribeable: false`. No `boss` flag, no `tag`, no slot: he gives no required
  item and counts as any map-placed enemy on re-entry. Name `[The Clown]`, barks `[TEXT]`.
- `game/carnival-map.json`: one spawn, `the-clown`, at (38,8), on a tile of its own. The ordinary
  `clown1` at (28,10) is not touched.
- `game/sprites.js`: his type draws a Tiny Dungeon cell nothing else uses, (3,8), a stand-in.
- `tests/carnival-cast.test.js`: new sections pinning all of the above.

## Acceptance
- One `[The Clown]` at (38,8) in his own cell; `clown1` stays at (28,10) unchanged.
- He refuses a bribe (gold buys nothing and a hand-given item is ignored); an ordinary clown
  still takes one. Checked through the same offer and give calls the trade/talk screen uses.
- In a fight he throws his Fire Blood, shown by a test that reads the fight's log.
- `tools/balance-golden.txt` gains his one Carnival row and the Carnival faucet rises by his
  20 GP, nothing else moves. The loop writes that golden in its own commit citing this card; this
  branch does not.
- The autoplay golden does not move (a hand-placed spawn).
- A 3440x1440 frame with both clowns on screen.
- npm test, balance:check (differs only by that row and faucet until written), the naming grep
  and autoplay:check pass.

## Rests on
- LN1R1, picked (a), as above.

## Out of scope
- Final name, barks, art, numbers, position and kit: all stand-ins for the owner's say.
- The ringmaster and the assistant manager.
- Writing the balance and autoplay goldens.
