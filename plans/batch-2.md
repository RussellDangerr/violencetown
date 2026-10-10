# Batch 2 — what reads as broken, then one art style

**Status:** stage 1 (2026-10-08) and stage 2's first three steps (2026-10-09) built and verified,
pushed, not merged. Stage 1 is on `fix/visual-breakage`; stage 2 is on `feature/art-style`, which is cut
from it (via `spike/art-style`) and so carries both: merging `feature/art-style` alone lands the batch.

## Why

Batch 1 (`plans/trim.md`) and the poisons (`plans/poisons.md`) shipped as v0.28.0. Caelan's next
concern is that the game looks amateur. A visual audit on 2026-10-07 had five agents walk all 12 maps
and the interface in headless Chrome (232 screenshots, 91 findings), and a sixth research what makes
mixed pixel art read as one style. Its report and screenshots are outside the repo; this spec carries
what is being built. Finding ids (TOWN-08, UND-02, ...) refer to that report.

The diagnosis, in short: five art packs share the screen, but only Kenney's Tiny packs are a complete
style (a plum `#3F2631` outline on every sprite, one palette). Things draw at four pixel sizes (ground
2×, characters, chests and items 1.5× because they are drawn 24 px into a 32 px tile, the car 1.33×,
UI chrome 1×). Terrains meet with no transition pieces. Some of what shows reads as plainly broken.

## Stage 1 — fix what reads as broken (`fix/visual-breakage`)

Code and data only; no art-direction call needed. Each item names the finding it answers.

| Fix | Finding |
| --- | --- |
| A tan stick is drawn through the middle of every townsperson and several enemies. Find where it comes from (a held item, or a sheet cell bleeding in) and remove or place it properly | TOWN-08, UND-14, OUT-18 |
| Items with no sprite draw as a letter in a box. Use one neutral "unknown item" sprite instead, then real Kenney icons where a good cell exists | UI-01, UND-02, OUT-07, INT-11 |
| The rock and Fire Blood icons carry an opaque square from their sheet. Give them clean cells | UND-03, OUT-08, UI-12 |
| The edge forest still paints over each map's last row, burying the south exits (the trim's 4c fix only changed who draws first) | OUT-01, TOWN-01 |
| Exit arrows on the wide Carnival point sideways: the direction is taken from the map's centre | OUT-09 |
| Text runs past its frame (inspector description, gear and ring labels, offer footer); the log wraps a lone "]" | UI-02, UI-08 |
| The combat wheel grows each level and runs off the screen | UI-03 |
| The first-run hint covers the device's buttons while a menu is open | UI-05 |
| Borgir has two doors stacked on top of each other | INT-06 |
| Downtown's TOWN_WALL tile has no sprite and draws as a flat brown band | INT-10, TOWN-02 |
| Road-orange slivers show between the factory's goo pots | UND-07, TOWN-11 |

Verify: `npm test`, balance, naming, autoplay; and a before/after screenshot of every fix with the
audit's harness, at 1920×1080 and 3440×1440.

### Stage 1, as built (2026-10-08)

| Fix | What it turned out to be, and what changed |
| --- | --- |
| Stick through NPCs | Not an item: the stealth overlay's **facing cue**, a tan line drawn from each watcher's tile centre the way it faces, so anyone facing down was run through. It is now a small chevron just past the tile's edge (`facingCue`, plum-outlined), so facing still reads and nothing crosses a body |
| Lettered item boxes | 11 of the 14 got real cells (tinyDungeon/tinyTown). Three have no fitting cell yet (latex gloves, red cape, shoe bags) and draw as one plain bag (`UNKNOWN_ITEM_SPRITE`) instead of a letter; every draw site asks `itemSprite(id)` |
| Opaque item squares | `tools/gen_tiny_extra.py` derives a small sheet from Tiny cells (CC0): the rock with its ground keyed out, Sludge Brain and the Sludge Sack recoloured to sludge, an orange Fire Blood bottle (the red one stays the bandage), and the goo vat |
| Edge trees over the last row | The filler tree is two tiles tall, so the row just past the south edge reached into the map. That row is left bare (`fillerSkips`); the canopy beyond still starts at the edge |
| Sideways Carnival arrows | The direction was the dominant axis from the map's centre; on the 58x22 Carnival that is sideways. Now toward the nearest edge (`exitDir`); every exit's arrow matches its label's North/South/East/West, pinned by a test |
| Text past its frame | `_fitText` shrinks then cuts a label to its box (inspector name, gear slots, ring sockets, the offer legend); the inspector's description wraps to two lines; the log wraps between words with VT323's real glyph width, so no lone `]` |
| Wheel off the screen | The hub sat low enough for the BACK tile (120 below) but the deepest dial is 162 across; the hub now clears the whole disc. The HUD layout test checks the vertical fit too |
| Hint toast over the device | **Not a bug in play**: the first-run hint hides on the first key or tap, and opening the device takes one. The audit's scripts opened menus with no input. The "clipped inspector" was the same hint; with it gone the inspector fits at 1920x1080 |
| Doubled doors | Town (8,7) is sidewalk now (the door sits in an alcove); Borgir (8,17) is wall, like the other rooms. Exits unchanged. A test forbids stacked doors |
| Downtown's brown band | TOWN_WALL (tile 10) is a hedge of Tiny Town bushes on grass; the tile test no longer excuses it |
| Orange slivers under the goo | The orange was baked into the Tiny cell (its dungeon floor); keyed out in the derived sheet and drawn over factory floor |

Tests 1888 -> 1925 / 347 / 0 (+ `tests/visual-breakage.test.js`, mutation-checked; the HUD dial test now checks
the vertical fit). Balance, naming and the autoplay golden are unchanged: none of this touches gameplay.
All 12 maps render by day and night with a clean console; before/after screenshots at 1920x1080 and
3440x1440.

Noticed, not changed: on an exit tile the exit's gold glow draws over the player, washing them out.

## Stage 2 — one art style (`feature/art-style`)

The research's ranked plan, all cheapest first:

1. **One pixel size**: characters, chests and items draw at the full tile; the car from a 32-px source;
   panel chrome at 2×. Characters look about a third bigger.
2. **One outline**: at load time, add Tiny's plum outline to every non-Tiny sprite (never to repeating
   ground tiles); match the colour in `tools/gen_outlined_sheet.py`.
3. **Ground that reads as drawn**: a shadow band at wall bases, stable variant cells in big fields,
   autotiled edges from Tiny Town's unused edge pieces.
4. **Swap the foreign surfaces**: town brick, the sewer wall, the factory floor and chain-link, the
   Canyon lawn, a real dead grass.
5. **Pixel interface and light**: pixel mood faces, a sprite-shaped hit flash, VT323 on DOM text, a
   pixel wheel, banded or dithered night light.

It waits on his answers to the audit's questions, chiefly: is Tiny the house style, and may characters
grow about a third? The first change gets a prototype he looks at before anything is decided.

### Stage 2, ruled and built (2026-10-09)

Caelan asked to see options before ruling on the house style, so `spike/art-style` prototyped four looks
behind an address-bar switch and a page put the same four scenes side by side at 3440x1440: A today,
B one pixel size, C + one outline, D + wall shadows. **He picked D.** That also rules the house style:
**Kenney's Tiny packs are the style everything else conforms to.**

Built on `feature/art-style`, with the switch removed (D is the game):
- **One pixel size.** Characters, chests and ground items draw at the full tile, so their pixels match
  the ground's (they were drawn 24 px into a 32 px tile). Bag and bar icons are unchanged.
- **One outline.** `SpriteSheet.drawRegionInk` / `drawFrameInk` draw a sprite from any non-Tiny sheet
  with Tiny's plum `#3F2631` outline, built once per cell (1 source pixel, 4-connected). Used for
  characters, chests, ground items, props, the car, and object tiles (a tile drawn over another tile's
  art: benches, bins). Ground tiles never get it; `under: 'fill'` marks a ground tile's own fill, not
  an object. `TINY_STYLE_SHEETS` lists the sheets left alone.
- **Wall shadows.** Two hard bands of shadow on every floor tile below a wall tile, at the art's pixel
  size. Judged on tiles alone, so a lamp or a bench casts none.

Tests 1925 -> 1933 / 350 / 0 (+ `tests/house-style.test.js`, mutation-checked). Balance, naming and
the autoplay golden unchanged. All 12 maps render by day and night with a clean console; a fight's
splats, bars and faces checked at full size at 3440x1440.

Still to do from the plan: the car is a 48-px side view at 1.33x (needs a 32-px top-down source);
step 3's edge tiles and ground variants; step 4's foreign surfaces (town brick, sewer wall, factory
floor and chain-link, the Canyon); step 5's pixel interface and light. The three items with no icon
(latex gloves, red cape, shoe bags) now get picked or made to match Tiny.

## Not in this batch

Crits with the weakness chart, the Pacemaker Ring, turn model step 2 (waits on his cascade verdict),
and the rest of the trim ledger's "finish" list each get their own branch and spec when picked.
