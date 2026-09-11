# Feature: Zone identity — five zones that look like five places

**Phase:** Polish, against ROADMAP Phase 1's own bar: *"Walk through all five zones on the static map.
Each zone looks and feels distinct."*
**Priority:** High (Caelan, 2026-09-07, after the visual and animation passes merged).
**Status:** Items 0, 2, 3, 4 shipped. Item 1 (interiors) waits on two rulings — see Item 1.
**Companions:** `plans/visual-pass.md` · `plans/animation-pass.md` · ROADMAP.md

> **Decisions (Caelan, 2026-09-07):**
> - Work items 1→4 in order.
> - **Outline pass in `tools/`** for art whose style does not match — generate it, do not accept it
>   raw and do not reject the sheet.
> - Develop on `dev`. **Do not push `main`** — nothing goes to the live site yet.

---

## The measurement that opened this

Every `tiles` array parsed, not eyeballed (audit, 2026-09-07):

| Zone | Distinct tile ids | Note |
|---|---|---|
| **Town** | **16** | the only zone clearing the bar |
| Sewer | 6 | **47% of the map is id 0, which maps to `null`** — a flat `#1c1510` rect |
| Circus | 4 | 100% `tinyTown` |
| Graveyard | 4 | one reused cross covers all 96 grave cells |
| Factory | 4 | 100% `tinyDungeon` |
| bank / casino / diner / borgir | **3** | byte-identical floorplans |
| canyon / wilderness | **2** | |

**Two zones are drawn from the same pixels.** Sewer `SLUDGE` (2) and Factory `GOO_VISUAL` (42) are
both `tinyDungeon (8,2)`. Sewer `BOSS_FLOOR` (6) and Factory `FACTORY_FLOOR` (40) are both
`tinyDungeon (9,4)` — and that is Factory's dominant tile at **512 of 900 cells**.

**The interiors have no vocabulary at all.** Bank, casino and diner are byte-for-byte identical,
built from Town's *exterior* sidewalk/facade/door. No interior floor, wall, counter, table, chair,
slot-machine or vault tile is defined anywhere in `data.js`. The flavour beats (`bank_vault`,
`casino_slots`, `diner_counter`) are text-only `examinables` — **the renderer draws nothing for an
examinable**, so you read "the vault" while standing on a sidewalk tile.

**Props are the mechanism nobody is using.** `_drawPropSprite` supports multi-tile, depth-sorted
sprites the player walks behind. `PROP_SPRITES` has **one entry**. One map uses it. Three trees.

---

## The style rule this pass establishes

Three separate surveys rejected art on **style, not content** — the recurring failure of this whole
project's art work:

- `roguelikeChar` — finished characters, but **bust-framed and cell-filling** against Tiny's
  full-body-with-margin. Would render ~40% oversized.
- `roguelikeSheet` — the art we want, but a **light bevel where the house style uses a dark
  outline**. Reads flat beside existing props.

**The ruling: generate, don't reject.** A ~20-line outline pass in `tools/` brings a sheet into house
style, and this repo already synthesises art that way (`gen_font`, `gen_ui_panel`,
`gen_emote_sheet`). Prototyped and confirmed on gravestones 2026-09-07.

**And measure, don't eyeball.** A style was called "bare" by compositing on a dark background, where
a dark opaque card is invisible. Alpha was 47/256 — an opaque card. Measure alpha; overlay a grid
before judging framing.

**Gutter trap.** `roguelikeDungeon` and `roguelikeSheet` are **1px-gutter** sheets (stride 17), not
packed like everything currently registered. `padding: 1`. Getting it wrong makes deep rows drift up
and render as two half-cells stacked — `sprites.js` documents that exact bug from a prior encounter.

---

## Item 1 — Interiors get a vocabulary

The five worst screens in the game.

**Sourcing (survey, 2026-09-07):**

| Need | Source | Cost |
|---|---|---|
| interior floor | outlined `roguelikeSheet` — plain tan (5-6, 2), bordered rug (13-19, 12-15) | the outline tool |
| interior wall | **nothing bundled fits.** Every candidate is exterior brick or dungeon stone | open |
| counter | `Roguelike Interior Pack` row 9, cols 0-2 — **the only source with one** | vendor a 2nd pack |
| slot machine | **nothing exists anywhere surveyed.** Closest is a boxy cabinet, `tinyDungeon` (6,4)/(7,4) | proxy or defer |
| vault door | **nothing exists.** Same cabinet proxy; no wheel-handle vault in any pack | proxy or defer |

Counter, vault and slots want to be **props**, not tiles — a counter needs walk-behind occlusion, a
vault reads as a 2×2 set-piece.

**Caelan's call still needed:** whether to vendor `Roguelike Interior Pack` (CC0, same pattern as
RPG Urban) for the counter, and whether slots/vault ship as a cabinet proxy or stay text-only until
real art exists. **Do not proxy silently** — a boxy cabinet standing in for a bank vault is the same
class of compromise as a hooded figure standing in for a rat.

## Item 2 — Sewer and Factory stop sharing pixels

**Register `roguelikeDungeon_transparent.png`** (bundled, unregistered, 29×18 at stride 17,
`padding: 1`).

- **Sewer** — `(8,0)` plain grey brick or `(9,1)` alcove brick as the WALL, **replacing the `null`
  fallback that is 47% of the map**. `(6,11)` bordered teal pool as a wet-floor accent.
- **Factory** — needs no new sheet. Chain-link wall from `roguelikeCity` `(9,17)`-`(16,17)`;
  conveyor from `tinyDungeon` `(7,6)`/`(6,6)`/`(8,6)`, a rail-and-crosstie motif **three cells from
  the current wood-slat proxy**. Floor can stay `tinyDungeon (9,4)` — the defect was the *sharing*,
  which Sewer moving off it resolves.

**On the 47% void:** `sprites.js:156` calls it intentional framing. The survey's judgement, which
this spec adopts: at half a zone it reads as unfinished rather than atmospheric, and Phase 1's bar
cannot survive it. Give it brick.

**Correct three stale claims** while in the file. `sprites.js:512` "No conveyor art; wood slats proxy
it" is **false** — verified. `tinyDungeon` has the rail motif and a segmented pipe-loop at
`(9-11,5-7)`; `rpgUrban` has L/T pipe fittings `(1,6)`/`(2,6)`/`(3,6-7)`, a pipe wrench `(1,7)`, and
hazard barriers `(5,8)`/`(6,8)` — all unused, already loaded. This is the **third** false
"no art exists" claim found in this file; the other two were awnings and iron railings.

## Item 3 — Graveyard, and props as a system

`roguelikeSheet` holds **12+ distinct gravestone silhouettes** at cols 40-53, rows 8-11 — against
the one reused cell covering all 96 grave cells today. Verified coordinates: rounded arch `(40,8)`,
flat-top `(41,8)`, gothic peak `(42,8)`, notched `(47,8)`, wide arch `(48,8)`, engraved cross
`(44,8)`/`(44,9)`, blank tombstones `(51,9)`/`(51,11)`/`(52,11)`/`(53,11)`, plus-crosses
`(51,10)`/`(52,10)`/`(53,10)`, wood cross `(53,9)`.

All go through the **outline tool** first.

**Make them props, not tiles** — 1×1, `tree`'s shape. The art is not taller than a cell; the win is
per-instance variety plus depth-sort and a solid base. That fixes Item 3 using Item 3's own
mechanism. The cemetery gate `(41,18)`+`(42,18)` is `wTiles: 2`.

**Known absent, do not go looking again:** no coffin, no crypt, no lantern (two wall torches at
`(17,7)`/`(18,7)` are the closest), and **no fencing better than the current wood rail** — the "no
iron railing" claim is now verified twice and stands.

**Circus bonus, same sheet:** 2×2 tents at `(46-47, 10-11)` green and `(48-49, 10-11)` tan, which
directly replace the flagged red-shingle `TENT_STRIPE` compromise.

### ✅ SHIPPED 2026-09-10 — `d1f286c` · `d981bd2` · `3378bb0` · `d044b8e`

(The first attempt, 2026-09-07, died mid-edit and was reverted: 96 grave props in the map, no art
for any of them. `d1f286c` is the guard that makes that state fail loudly —
`tests/prop-coverage.test.js`.)

- **Graves** — 96 props, one per former `GRAVESTONE` cell, all twelve silhouettes used. Each 2×2
  plot is one *family*: dark slabs (8 plots), pale crosses and tablets (13), wooden crosses (3 — a
  pauper's row). Random-per-stone was mocked side by side and read as noise; dirt under each stone
  read as highlighted UI cells. `PROP_SPRITES` derives the twelve entries from `OUTLINED_SPRITES`.
- **Tents are tiles, not props.** A prop is centred on its base tile, so a 2-wide prop straddles
  three columns and cannot sit on the 2-tile grid the carnival's border band and tent blocks use;
  and a prop blocks only its base cell. So: two tile ids, `GREEN_TENT` (34) and `TAN_TENT` (35).
  A tent cell draws the quadrant its parity picks (`tileFrame`) and paints `CIRCUS_GROUND` under
  itself first (`under`), so the tent's transparent corners show sand. 86 tents, checkerboarded;
  `tests/zone-identity.test.js` holds every tent cell to a whole, even-aligned 2×2 of one colour.
- `GRAVESTONE` (51) and `TENT_STRIPE` (31) are **retired**, not allowlisted.
- Walkability unchanged cell for cell in both zones; densified exits identical (checked against the
  prior commit through `GameMap`). Verified in the running game.
- **Not done: the cemetery gate** `(41,18)+(42,18)`. Same geometry problem as the tents — a
  `wTiles: 2` prop cannot centre on the 2-wide path — plus it would sit on a transition cell and
  must not block. Needs a prop anchor option (`anchor: 'left'`) and `solid: false`; small, but its
  own change.

**Found while verifying (fixed, `3378bb0`):** every zone's off-map margin had been drawing Sewer's
new wall brick since Item 2 — `getTile` reports `WALL` off the map. `_drawTiles` paints the void
there again.

**Item 2's residual (fixed, `d044b8e`):** `BOSS_FLOOR` moved off Factory's `(9,4)` to `(4,3)`, a
seamless grey brick. `(9-11,4)` were rejected on measurement — they are wall-run pieces with dark
end caps, and seam when two sit side by side. (Factory's own 512-cell floor *is* `(9,4)`, and does
seam. Worth a look in a later pass.)

**Item 2's bar is now a test** (`tests/zone-identity.test.js`): no two tile ids may draw the same
cell unless the share is written down with a reason, and a stale entry fails. Measuring for it
found exactly two shares, both in places the original audit did not look:
- **Carnival's ground is Town's road — OPEN.** `CIRCUS_GROUND` (30) and `ROAD` (12) are both
  `tinyTown (1,2)`, and ground is 892 of the carnival's 1,276 cells. Needs a call on a ground of
  its own, from a cell no other tile draws (reusing `SAWDUST`'s would just move the share, and the
  test would say so). Town places `CIRCUS_GROUND` at its south exit too, so that patch changes
  with it — arguably a feature: the road starts to look like the carnival as you leave.
- **Graveyard's fence is Town's fence — accepted.** `IRON_FENCE` (53) and `FENCE` (17), both
  `tinyTown (9,3)`. No iron railing exists in any bundled sheet (verified twice).

## Item 4 — Tile placement guard rail ✅ SHIPPED `cb8c8e7`

`tests/tile-coverage.test.js`. Unplaced ids now need a written reason in `KNOWN_UNPLACED`, and the
list fails when it goes stale. Seeded with `GAP` (3), `BOSS_TRIGGER` (7), `GRASS` (13);
`PORTCULLIS` (22) and `BARRICADE` (23) recorded as runtime-placed by `sewer-setpiece.js`.

Mutation-verified: dropping `GRASS` from the allowlist fails 1 of 5.

---

## Order

| # | Work | Model | Gates |
|---|---|---|---|
| 0 | `tools/gen_outlined_sheet.py` + register the output | Sonnet | ✅ `a1ff849` |
| 1 | Item 2 — Sewer/Factory, and the three stale claims | Sonnet | ✅ `13c61ea`; residual `d044b8e` |
| 2 | Item 3 — gravestones as props, circus tents | Opus | ✅ `d981bd2` |
| 3 | Item 1 — interiors | Sonnet | needs 0, plus Caelan on vendoring |

Item 0 first because both 2 and 3 consume its output. Item 2's Factory half needs nothing new and
could go first if the tool stalls.

## Verification

`npm test` — 0 failures; measure the baseline, do not quote one. `tests/tile-coverage.test.js` will
now fail if a new tile id is mapped but never placed, which is the intended pressure.

Per `CLAUDE.md`, done means the game **runs**: restart the dev server, load it, walk every zone
touched, check the console. A zone is done when it no longer shares a cell with another zone.
