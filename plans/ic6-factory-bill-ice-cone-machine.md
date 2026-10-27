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

- **The manager** stands in the Factory, placed in `game/factory-map.json`. He reuses the
  crowd's look (`Violencian`), so no new art. His name is the placeholder `[Factory Manager]`
  and every line he says is `[TEXT]`.
- **The bill** is a dialogue choice whose `cost` is `FACTORY_BILL_GP` (100), exported from
  `game/dialogue.js`. The existing dialogue code refuses the choice when you hold less, and
  otherwise moves exactly that much gold to him. The choice is repeatable but offered only
  while the bill is unpaid, and paying sets the quest flag `factoryBillPaid`. The quest flags
  are saved, so a reload keeps the paid bill. (A `once` choice would not survive a reload.)
- **The part** is a new item, `[Ice Cone Machine Part]`, with the placeholder description
  `[TEXT]`. It is not for sale, so its value is the 0 every unsellable item uses.
- **The machine** is an examinable on the diner counter, `[TEXT]` when examined. Holding the
  part, you use it on the machine; the part is spent and the cone goes in your bag.

## Status: blocked on three files the card does not list

Built so far (inside the card's files): the manager, his dialogue, and paying the bill.

Not built, because each needs a file outside the card's list:

1. **The part item.** `tests/visual-breakage.test.js` pins the exact list of items that draw as
   the plain bag, so a new item without a picture fails it. Either that list grows by the part,
   or `game/sprites.js` gets a picture for it (an art pick).
2. **The machine handing you the cone.** `tests/ice-cone.test.js` asserts that no game code
   names the cone outside the item and sprite tables. Any code that gives you the cone names it,
   so that test has to change, in its own commit saying the behaviour changed.
3. **Using the part on the machine.** The game's "use this on that" path is a row in
   `game/item-uses.js`. The alternative inside the card's files is handing the part to the Cook
   in conversation.

## Out of scope

- Every line of copy, the manager's and the part's real names, the part's picture.
- Any other route to the cone, eating it, or ants.
- Where the manager stands in a fight (he scatters like other bystanders).
