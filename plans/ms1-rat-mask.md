# MS1 — The Rat Mask: put it on and you're a rat

## Goal
The first mask. It is a head-slot item with a body: while it is worn the player is drawn as the
rat (the existing Tiny Dungeon rat cell) and may step onto grate tiles. Taking it off, or putting
another hat on, returns Night Kid and shuts the grates again. Armour can now grant verbs, not only
the weapon: an armour piece may carry a `body` entry (`sprite`, `verbs`), read by two small helpers
in `game/items.js`.

## Acceptance
- Wearing the Rat Mask draws the player as the rat and lets them walk grates; removing it reverts both.
- Its armour and swapping follow the rulings below (a hat, replaces the old hat, swaps like any equip).
- Wearing it survives a save and load.
- A 3440x1440 screenshot of Night Kid and of the masked rat.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on
- MR1 a: masks are the body system; the rolled-species rules retire.
- MR2 b: the Rat Form ring trick stays; the mask is the lasting body. Both open grates.
- MR3 a: a mask is a hat: its own tier's armour, and it takes the head slot (`top`), replacing the Foil Hat.
- MR4 a: swapping masks mid-fight is an ordinary equip, so it follows the same rule as any other gear.

## Placeholders (not player-facing decisions)
- Name `[Rat Mask]` and its description are bracketed placeholders; armour 2 is left equal to the Foil Hat.
- The bag icon is the rat cell washed in a fake tint.
- No source places the mask in the world yet; it exists in the registry and is worn through the ordinary equip path.

## Out of scope
Where the mask is found or bought, more masks, the account collection, other species' verbs,
and any change to the Rat Form ring.
