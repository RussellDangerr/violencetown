# GL2: the GEAR chooser rows say what each piece's perk does

Goal: in the GEAR chooser, each row shows one dim line naming what the piece does, using the
phrases GL1 already ships in `ARMOUR_PERKS` (inspector.js). The Shoe Bags still read
"sludge-proof"; a row with no perk draws nothing extra.

Acceptance
- `equipOptions` gives every row a `perks` list from GL1's table; `sludgeImmune` stays.
- The renderer draws the row's perks (comma-joined) where "sludge-proof" was drawn, shrunk to fit
  and kept clear of the armour delta on the right.
- HEAD chooser: caps and masks with their phrases. BACK chooser: Lava Cape with its phrase.
- `gearChooserRect` and `gearOptionRects` unchanged.
- npm test, balance:check, naming grep, autoplay:check pass.

Rests on: GL1R1 (b, say what happens) and GL1R2 (a, "+6 melee"); both already in the table.

Out of scope: the gear plate showing perks; any change to the table's wording.
