# ln1: a lion prowls the Carnival as a mini-boss

## Goal
The Carnival gets a hostile lion at (20,16), far from the north door where you enter. It hunts
you when it sees you and can be fought to the end. It is a mini-boss you always meet, per ruling
LN1R1 (a): the ringmaster is the boss you may draw instead of Bigfoot, the lion and the clown are
mini-bosses you always meet, the assistant manager is someone you talk to.

This is a second lion. Lire, the lion your Lion Whip hires, stays exactly as he is.

## What changes
- `game/slots.js`: one new registry entry, `carnival_lion`, placed by hand the way the Carnival's
  rats are (`{ id, entry, x, y }`), not through a slot. Its numbers and kit are copied from the
  Sewer's Fungus King: 100 hp, armour 6, damage 12, 20 GP, the same loadout. It carries no `boss`
  flag, no `tag` and no slot, so it gives no required item, and it counts as any map-placed enemy
  on re-entry. Name `[Lion]`, barks `[TEXT]`, a sight range so it hunts on sight. All stand-ins.
- `game/carnival-map.json`: one spawn, `carnival-lion`, at (20,16).
- `tools/gen_recolor.py` and `game/assets-placeholder/kenney/beastVariants_packed.png`: a second
  tint of the grey beast (BEAST_VARIANTS column 1), so the lion is not mistaken for tawny Lire.
  Kenney CC0 only.
- `game/sprites.js`: the lion's type draws that column.
- `tests/lire-sprite.test.js`: its two pins widen from "one tawny variant, only Lire draws from
  it" to "tawny plus the lion's tint; Lire and the Carnival lion draw from it". Its own commit.
- `tests/carnival-cast.test.js` (new): pins the lion's entry, its place, that it is separate
  from Lire, that it gives no required item, that it fights and drops, and that a killed one
  comes back on the respawn list like any map-placed enemy.

## Acceptance
- The Carnival has a hostile lion at (20,16) that hunts when it sees you and can be fought.
- It draws in its own tint; Lire still draws as before when hired in the same fight.
- It gives no required item; on re-entry it behaves as any map-placed enemy does.
- `tools/balance-golden.txt` gains exactly one Carnival row and +20 on the Carnival faucet and
  nothing else moves. The loop writes it, citing this card; this branch does not.
- The autoplay golden does not move.
- A 3440x1440 frame of the lion mid-fight beside Lire.
- npm test, balance:check (differs only by that row until written), the naming grep and
  autoplay:check pass.

## Rests on
- LN1R1, picked (a), as above.

## Out of scope
- Final name, barks, tint, numbers and position: all stand-ins for the owner's say.
- The ringmaster, the clown and the assistant manager.
- Any cage, taming or hurt-animal line.
- Writing the balance and autoplay goldens.
