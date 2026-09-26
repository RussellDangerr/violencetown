# Feature: The Animation Pass — facing, life, and manga impact

**Phase:** Polish — the sprites start moving, and a hit starts reading as a hit.
**Priority:** Medium-high (Caelan, 2026-09-06, after the visual pass: *"opportunities for directional
sprites as well as any animations whatsoever, such as idle animations, bobbing, combat, flinches,
impact frames"* and *"I'm thinking in manga with animatopes and comic book sweat marks and asterisks
and stars"*).
**Status:** Design (approved 2026-09-06).
**Companions:** `plans/visual-pass.md` (the pass this builds on) · `plans/movement-feel.md` (the
original bob/waddle spec — note it called for squash/stretch, which was tried and **backed out**).

> **Decisions (Caelan, 2026-09-06):** all four workstreams below, in this order.

---

## What already exists — read this before proposing anything

An inventory on 2026-09-06 found considerably more machinery than expected. Do not rebuild any of it.

- **`withWalk()` + `walkAnim()`** (`renderer.js:73-97`) already animate **both the player and every
  enemy**: a 2px bob, a 5° lean alternating on step parity, and a horizontal flip. Mid-step they run
  on real elapsed time; at rest on `game._idleTick`.
- **Combat feedback is already rich**: hit-flash tint scaled by damage, stagger/knockback,
  screenshake, and **typed hit-splats with per-damage-type motion curves** (`_hitSplatMotion`,
  `renderer.js:1371-1498`) — physical pops, sludge drips, poison shudders up, fire flickers.
- **`easeOutCubic`** exists but is file-private to `renderer.js:3935`. There is no shared tween
  utility and no per-entity animation-state bag; every animated property is an ad-hoc field.

### The constraint that shapes everything

**The game does not render continuously.** At rest it repaints ~4×/second from a single 250ms
`setInterval` (`main.js:578-584`). A 60fps rAF loop spins up only while a step is animating or
`_hasActiveEffects()` is true (`main.js:5186-5245`), and terminates the moment that clears.

4fps is a fine cadence for two-frame pixel idle — it is the classic look. The problem is that
`_idleTick` is **one global counter for the entire cast**, so everyone breathes in lockstep. Nothing
below adds an always-on render loop; §3 fixes the lockstep instead.

### Dead or dormant, and why

| Thing | State |
|---|---|
| `static: false` branch, `renderer.js:1070-1072` | A real 2-frame path. Every `ENEMY_SPRITES` entry sets `static: true`, so it has never once executed. |
| rpgUrban frames | **11 of 12 cells per character unreferenced.** Only col 24 is used; cols 23/25/26 and rows +1/+2 ship in the PNG and are untouched. |
| `miss` splat colour + motion | No call site, ever. Correct — `combat.js:5-7` rules that you always hit. Leave it. |
| `reduceMotion` on the bob | Honoured for shake, flash, splats, wheel and overlay. **Not** for `walkAnim`. That is a bug, fixed in §3. |

---

## §1 — Manga impact marks

Bare symbols popping on impact, alongside the damage numbers that already work.

**New art.** The shipped `emotes_style1.png` is the **speech-balloon** set — every symbol sits in a
white bubble, which is right for dialogue and wrong for a hit. Kenney's Emote Pack ships eight pixel
styles; **Style 5 is bare symbols, no balloon**. Generate a second strip, `emotes_marks.png`, from
Style 5 by extending `tools/gen_emote_sheet.py` with a style argument and a second ORDER list. Keep
the Style 1 strip exactly as it is — the balloons stay on dialogue.

Marks to include: `star` · `stars` · `anger` · `drop` · `drops` · `cross` · `swirl` · `exclamation`.

**Wiring.** `_spawnHitSplat` (`main.js:5083`) gains an optional mark. The marker rides the existing
`_damageNumbers` array and the existing effects loop — **no scheduling change**. Mapping:

| Event | Mark |
|---|---|
| physical hit, light | `star` |
| physical hit, heavy (same threshold the screenshake uses, ≥15) | `stars` |
| poison / sludge | `drops` |
| fire | `anger` |
| a kill (KO) | `swirl` |

Motion: pop out, rise, fade — reuse the `_hitSplatMotion` vocabulary rather than inventing a curve.
`reduceMotion` already damps that function; the mark must respect it too.

**Do not** attach a mark to `heal` — a healing star reads as damage.

## §2 — Awareness pips become sprites

`_drawThreatOverlay` draws its pips as bitmap ASCII (`·` `?` `!` `!!`). The emote sheet already
loaded carries better glyphs.

Map `suspicious → question`, `searching → exclamation`, `chasing → alert`. Leave `idle` and
`returning` drawing nothing at all — an idle watcher should be silent, which is the whole point of
the visual pass.

**Note `exclamations` is NOT in the shipped strip** — the 18 columns are listed at `sprites.js`'s
`EMOTE_SPRITES`. `alert` is, and reads as escalation. Use it rather than regenerating Style 1.

**The collision that must be handled:** enemies **already** draw an emote balloon from `_emote`
(`renderer.js:1213-1229`). A pip drawn independently will stack two balloons on one head. So:
**suppress the ambient `_emote` balloon while a watcher is above `idle`.** Awareness outranks
chatter — someone who has noticed you should not be humming a music note.

## §3 — Desync the idle bob, and honour reduceMotion

Two small fixes to `walkAnim`, disproportionate to their size.

**Desync.** Add a per-entity phase offset so the cast stops breathing in unison. Reuse the FNV-1a
hash already inside `spriteVariant` (`sprites.js:329-338`) rather than writing a second one —
**extract it as an exported `idHash(entity)`** and have both call it. Offset is
`idHash(entity) % 4`, added to `_idleTick` before the modulo.

**Honour `reduceMotion`.** `walkAnim` currently ignores it while every other effect respects it.
Match the house pattern: damp the bob to ~0.4 amplitude and drop the lean to zero. Do not suppress
it entirely — the player still needs to read as moving.

**Do not reintroduce squash/stretch.** `renderer.js:64-65` records that non-uniform scale "breaks the
pixel ratio and reads as 'off the canvas'", and it was deliberately backed out of the original
movement-feel spec. Leave that closed.

## §4 — Directional sprites and walk frames

The largest piece, and the one with real structural risk.

**The art is already in the repo.** rpgUrban characters are laid out **4 facings × 3 frames**:
columns 23/24/25/26, rows +0/+1/+2 from the character's base row. Only (24, base) is referenced
today. **Verify which column is which direction against a labelled contact sheet before wiring** —
do not assume the order.

**Unify facing first.** There are currently three parallel representations:

| Source | Used by |
|---|---|
| `_lastDx` / `_lastDy` (vector) | the AI cone, and the overlay chevron |
| `_faceLeft` (boolean) | the enemy horizontal flip |
| `game.facing` (string) | the player flip, and bump targeting |

Add **one** `dirOf(entity)` helper returning `'up'\|'down'\|'left'\|'right'`, derived from the vector
where present and falling back to the existing fields. Every new frame lookup goes through it. Do
not delete the old fields in this pass — too much depends on them; converge, then retire separately.

**Keep frame selection out of `spriteVariant`.** `tests/sprite-variants.test.js` locks that function
to be **pure and time-invariant** — same id, same cell, always. That is correct and must stay: it is
a cosmetic-identity hash, not a frame clock. Add a **separate** `spriteFrame(info, entity, anim)`
applied *after* `spriteVariant`, which resolves facing and walk frame. Variant picks who you are;
frame picks how you are standing.

**Walk frame source:** mid-step, the slide progress already available to `walkAnim`; at rest, the
desynced idle tick from §3. Two-frame minimum; the third frame is a bonus, not a requirement.

**Test impact, which is the real risk.** `tests/sprite-coverage.test.js:75-99` forbids two
co-located types from sharing a `sheet:col,row`. Adding cols 23/25/26 multiplies every entry's
occupied cells and could collide with picks in the same map. Update that test to compare **base
cells only** — a facing frame is not a distinct identity — and say so in a comment. If it reports a
genuine collision between *base* cells, STOP and report; do not weaken it.

---

## Order and models

Every item touches `renderer.js`, so these are **strictly sequential** — no parallelism.

| # | Work | Model | Why |
|---|---|---|---|
| 1 | §3 desync + reduceMotion | Sonnet | ~15 lines, no art, no new systems |
| 2 | §2 awareness pips | Sonnet | Small, but must handle the double-balloon collision |
| 3 | §1 manga marks | Sonnet | New strip + generator arg + splat extension |
| 4 | §4 directional frames | Sonnet | Largest; facing unification and a test change |

§4 last deliberately: it is the only one that can destabilise the sprite tests, and the other three
are shippable on their own if it goes badly.

## Verification

`npm test` — 0 failures; measure the baseline first rather than quoting a number.

Per `CLAUDE.md`, done means the game **runs**. For each item, in the browser:

- **§3** — stand still with several townsfolk visible: they must bob **out of phase** with each
  other. Toggle `reduceMotion` and confirm the bob damps rather than stopping.
- **§2** — get a watcher suspicious, then searching, then chasing: the marker changes and **no
  second balloon** appears alongside it.
- **§1** — land a light hit, a heavy hit, and a kill: `star`, `stars`, `swirl`. Confirm the mark
  fades and the effects loop still terminates (it must not spin forever).
- **§4** — walk an NPC in all four directions and confirm the sprite faces its travel; confirm a
  guard visibly faces the cone the overlay draws.
