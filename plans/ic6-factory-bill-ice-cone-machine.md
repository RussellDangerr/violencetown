# Pay the Factory's bill, and the diner's ice cone machine works again

## Goal

The diner's ice cone machine is broken: its replacement part was never paid for. A placeholder
`[Factory Manager]` in the Factory holds the part until you pay the bill. Pay it, carry the part
to the diner, and the machine makes you a Tiger's Blood Ice Cone (the item from IC1).

## Acceptance

- The Factory manager offers the part for the bill's price; you can't take it without paying.
- Paying moves exactly that much gold, and the part goes in your bag.
- The part fixes the diner's machine, which hands you a Tiger's Blood Ice Cone.
- A save part-way keeps the paid bill and the part.
- A GIF at 3440x1440 of paying and getting the cone (scratchpad only).
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

- **The bill (ICR5, option c):** 100 GP, a real gate; most players will take the frozen area
  instead.
- **The cone (IC1, merged):** `tigers_blood_ice_cone` exists in `game/items.js`.

## How it works

- **The manager** stands in the Factory at tile 24,8, the open floor north-east of the east
  door (`game/factory-map.json`). He uses the crowd's look (`Violencian`), so no new art. His
  name is the placeholder `[Factory Manager]` and every line he says is `[TEXT]`.
- **The bill** is a dialogue choice whose `cost` is `FACTORY_BILL_GP` (100), exported from
  `game/dialogue.js`. The existing dialogue code refuses the choice when you hold less, and
  otherwise moves exactly that much gold to him. The choice is repeatable but offered only
  while the bill is unpaid, and paying sets the quest flag `factoryBillPaid`. The quest flags
  are saved, so a reload keeps the paid bill. (A `once` choice would not survive a reload.)
- **The part** is a new item, `[Ice Cone Machine Part]`, with the placeholder description
  `[TEXT]`. It is not for sale, so its value is the 0 every unsellable item uses, and it draws
  as the plain bag until it has a picture. Paying hands it over.
- **The part is not a `questItem`.** The item overlay refuses quest items outright ("Best hold
  onto that."), and "use this on that" lives in that overlay, so a quest item could never be
  used on the machine. In exchange it can be lost like any item (dying, giving it away). So the
  manager owes you the part while the bill is paid, the machine is still broken, and the part
  is not in your bag: a `collect` choice hands over another, free. That also covers a bag that
  was full when you paid.
- **The machine** is an examinable on the diner counter at tile 5,2 (`[TEXT]` when examined),
  stood in front of from 5,3. The counter tiles are already solid, so it blocks no path.
  Holding the part, you use it on the machine through one row in `game/item-uses.js`
  (`part-in-ice-cone-machine`): the part is spent, the cone goes in your bag, the quest flag
  `iceConeMachineFixed` is set, and it costs the turn. The part comes out of the bag first,
  so a full bag still has room for the cone; if the cone can't be handed over, the part is
  given back and nothing is spent.

## The second ruling (IC6R1, pick a)

The card's files were too narrow. IC6R1 widened them: the balance golden gains exactly the
manager's row, `tests/visual-breakage.test.js` lists the part among the items that draw as the
bag, `tests/ice-cone.test.js` allows `item-uses.js` to name the cone, and `game/item-uses.js`
carries the machine's row. Each test change is its own commit saying the behaviour changed,
and the golden is its own commit citing the ruling.

## Out of scope

- Every line of copy, the manager's and the part's real names, the part's picture.
- Any other route to the cone, eating it, or ants.
- Where the manager stands in a fight (he scatters like other bystanders).
