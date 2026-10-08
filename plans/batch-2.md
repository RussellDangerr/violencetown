# Batch 2 — what reads as broken, then one art style

**Status:** spec (2026-10-08). Branch `fix/visual-breakage`, cut from `dev` at `585ac52` (v0.28.0).

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

## Stage 2 — one art style (own branch, after Caelan answers)

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

## Not in this batch

Crits with the weakness chart, the Pacemaker Ring, turn model step 2 (waits on his cascade verdict),
and the rest of the trim ledger's "finish" list each get their own branch and spec when picked.
