# EQ1: wearing a second copy keeps both

Goal: wearing or wielding a piece when an identical one is already on keeps both. The one
that was on goes back in the bag.

Cause: resolveEquip skipped bagging a swapped-out piece whose id matched the new one. That
guard dates from when the caller did not take the item out of the bag first. Every caller
now does (hotbar use, bag use, GEAR chooser, left plate), so the guard just deleted a copy.

Checks:
- foil hat worn + 2 in the bag, equip one through the GEAR tab with real keys: 1 worn, 2 in bag.
- same for a pipe-like weapon in the right hand, and in the left via the left plate.
- a two-hander over the same two-hander keeps both copies.
- no new copies: the chooser lists bag items only, so a worn piece is never re-picked.
- existing equip tests unchanged.

Rulings: none (defect fix). Out of scope: any wording; the log keeps its "back in your bag" line.
