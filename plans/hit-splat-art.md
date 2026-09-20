# F2 — hit-splat art

Status: **shipped on `feature/hit-splat-art`**, unmerged. Caelan makes the merge call.

Written from a cloud sandbox with **no browser and no dev server**. Nothing in this document was
seen on screen. Everything claimed below was verified by reading the code or by a test that runs;
what could not be verified that way is listed under *What I could not check*, and nothing was
drawn.

---

## 1. What the roadmap said, and what is actually true

The F2 row in `plans/roadmap-2026-09.md` was written before the splat existed in its current form
and is wrong in four ways. Corrected there in this branch; recorded here because the wrong version
has been quoted into three other plans.

| The row claimed | What the code says |
| --- | --- |
| "Style 8 glyphs (heart, drop, cross, star)" | There is **no heart** in `MARK_SPRITES`. The eight columns are `star, stars, anger, drop, drops, cross, swirl, exclamation` (`game/sprites.js`, packed by `tools/gen_emote_sheet.py --style 8 --marks`). A heart exists only in `EMOTE_SPRITES` — the *Style 1 balloon* strip, a different sheet, drawn over NPC heads. |
| "cover heal, poison, miss and crit" | Heal and crit have **no glyph and should not have one** (§3). `miss` is not a thing the game can produce at all (§4). Only poison was real. |
| "no Kenney pack has a flame … so those get drawn" | A flame is already covered: `anger` carries fire, and fire additionally has its own flicker-and-burn-up motion. The snowflake gap is real (§3, cold). |
| "Which glyph per damage type, and on the splat or beside it?" | Already answered in code: **beside it**, upper-right, outside the badge so it never overlaps the centred digits (`renderer._drawHitSplat`). |

**The splat system was never the work.** `renderer._drawHitSplat` already draws the typed fill
colour, the damage number, the gold crit border, a per-type motion curve, a heal halo, and — when
one is picked — a `MARK_SPRITES` glyph, all on the same particle and the same motion `m`, so the
mark lives and dies with the number it is attached to. Reduce Motion damping applies to it for free.
All of that is pre-existing and was confirmed by reading it.

F2 was only ever **the pick**: `_pickHitMark`. It covered `killed → swirl`, `physical → star/stars`,
`poison|sludge → drops`, `fire → anger`, everything else `null`. That much of the second-hand
description was accurate.

---

## 2. Which damage types can actually reach a splat

This is the whole basis for the decisions below, so it was established first rather than assumed.
Every `damageType` in the codebase, traced to whether it can reach `_spawnHitSplat`:

| Type | Reachable? | Source |
| --- | --- | --- |
| `physical` | yes | default for every unarmed/untyped blow; `items.js` rock; ally hits; player damage |
| `fire` | yes | `items.js` fire_bottle, `spells.js` fireball, `tricks.js` ember_rat, the ring `ignite` trigger, the burning DoT |
| `poison` | yes | `items.js` mystery_meat / tunnel_mushroom, and the poison DoT |
| `sludge` | yes | `items.js` sludge_sack, and the sludge DoT |
| `cold` | yes | `spells.js` coneOfCold (damage 14) |
| `energy` | **yes** | `weapons.js` ray_gun (damage 22), `tricks.js` ray_blast (damage 18) |
| `heal` | yes | `items.js` heal paths, `main.js` ally heal, and any positive DoT tick |
| `fear` | **no** | `spells.js` boo is `damage: 0`, and `combatAttack` returns `null` on `finalDmg === 0` *before* spawning. `castBoo` never calls `_aoeStrike` either — it applies fear directly. |
| `miss` | **no** | nothing anywhere spawns it (§4) |

`energy` was the find. The brief did not mention it and neither did the roadmap. It is reachable,
it was unmarked, **and** it has no `SPLAT_COLOR` entry, so a 22-damage sci-fi zap was rendering as
the physical fallback red with no glyph — pixel-identical to a punch.

`fear` being unreachable is worth recording because it looks reachable: it is a real `damageType`
string on a real spell, and only the 0-damage guard stops it.

---

## 3. The decisions

### `energy` → `exclamation`. **Changed.**

The only mark in the sheet that reads as a sudden discharge rather than a physical blow (`star`,
`stars`), heat (`anger`), liquid (`drop`, `drops`), a KO (`swirl`) or a negation (`cross`). It also
gives the sheet's dormant `exclamation` column its first call site. No heavy/light split: a zap is a
zap, and there is no plural form of `!` in the strip.

### `poison` / `sludge` → `drop` when light, `drops` when heavy. **Changed.**

Previously both wore `drops` at every size. Their *common* case is a damage-over-time tick —
`buffs.js applyDot` ticks 3 to 5 a turn — and their *loud* case is a Sludge Sack bursting on
someone. One rule already existed for exactly this distinction (`physical` splits star/stars at
`HEAVY_HIT_DAMAGE = 15`), so this applies the same rule to the same problem rather than inventing a
second one. It gives `drop` its first call site too.

The risk is honest: a 3-damage poison tick is the most frequent splat in the game and this makes it
quieter. That is the intent, but it is the one change here most worth a second opinion once someone
can see it.

### `cold` → still **no mark**. Deliberate.

Reachable via `coneOfCold`, and nothing in the eight columns reads as ice. The nearest candidate is
`drop`, and `drop` is now poison's light tick — mapping cold to it would make a Cone of Cold and a
poison tick wear the same glyph, which is worse than wearing none. Cold keeps its cyan `#5ec3e8`
fill, which is already unique in the palette.

**Recommendation, not built:** cold wants a snowflake or ice-crystal at 16×16. Kenney's Emote Pack
Style 8 has no such icon, so this is new art — out of scope under the no-browser constraint. Adding
it is cheap once drawn: append the name to `MARKS_ORDER` in `tools/gen_emote_sheet.py`, re-run it,
add the column to `MARK_SPRITES`, add one `case` to `pickHitMark`. Note that the generator reads
`C:\Code\assets\kenney\…`, a Windows path, so it cannot run in this sandbox at all.

### `heal` → still **no mark**. Deliberate, and I would not add one even if a heart existed.

Heal is already the most legible splat in the game *without* a glyph: a green fill nothing else
uses, a pulsing radial holy glow no other type gets, and a slow gentle float against everyone
else's snap. Marks in this sheet read as impacts; a star or a drop over a heal actively reads as
damage, which is the exact confusion `combat-legibility.test.js` was written to stop.

A heart does exist in the Kenney pack (it is column 8 of the Style 1 *balloon* strip) so the art is
obtainable if Caelan disagrees — regenerate the marks strip with `heart` appended. **Recommended
against**, for the reason above.

### `crit` → still **no mark of its own**. Deliberate.

A crit is an **intensity, not a type**, and there is exactly one mark slot on the badge. A crit mark
would have to *evict* the type's mark, so a critical fireball would lose its `anger` and read as a
generic big hit — strictly less information than it carries today.

It also does not need one. A crit already escalates on four axes: a 1.2× badge, the gold border, a
bigger pop with longer travel and a higher rise, and — since crits skew heavy — the plural `stars`
rather than `star`. It is already the loudest thing on screen. `pickHitMark` deliberately does not
receive the crit flag, so this is enforced by its signature, not by discipline; a test pins that.

### `miss` → **deleted**. See §4.

---

## 4. The miss that never was

`SPLAT_COLOR` carried `miss: '#3a6ea5'` and `_hitSplatMotion` carried a `case 'miss'` — "whiff
sideways on the wind". Proven dead before touching it:

- A word-boundary search for `miss` across `game/` and `tests/` returns exactly two live references,
  both of them the definitions themselves, plus one comment in `sprites.js` citing them. **No call
  site.**
- No `_spawnHitSplat` call anywhere passes `'miss'`.
- It could not be reached even by accident: `combat.js`'s own header reads *"No miss. No RNG here.
  Caller passes a single flat damage number."*
- The design forbids it. `README.md`: *"no dice, no misses."* `plans/gold-standard-design.md` Law 2:
  *"no rolls, no misses is permanent."*

So it was a feature the design rules out, sitting in the two hottest switches the splat has,
inviting the next reader to wire it up. Deleted in its **own commit** (`c277b89`) so it can be
reverted alone if a miss is ever wanted.

`cross` remains the one mark with no call site, and now says why in `sprites.js`: it reads as a
negation, and the only beat that would want it — a blow landing for nothing — never reaches a splat,
because `combatAttack` returns on an immune target and logs instead. Wiring it means deciding to
spawn a 0-damage splat, which is a design call, not a mapping one.

---

## 5. Also changed: the rule is now testable

`game/main.js` exports nothing, so every test that wanted at `_pickHitMark` could only read the file
as text and pattern-match the source. `HEAVY_HIT_DAMAGE` and the rule moved to a new pure module,
**`game/hit-splat.js`**; `_pickHitMark` stays as the method the splat path calls and delegates, so
no call site changed. Same pattern as `fight-area.js` / `viewport.js` / `layout.js`.

`HEAVY_HIT_DAMAGE` is still the single constant shared with `combatAttack`'s screenshake trigger, now
imported rather than local, so the two still cannot drift apart.

`tests/hit-splat-marks.test.js` (96 tests) pins: every mark the pick can name is a real
`MARK_SPRITES` column; kill outranks type; both heavy/light splits; energy's reachability *and* its
mark; each unmarked type together with the fact that keeps it unmarked; that the crit flag never
reaches the pick; and that the miss path stays gone.

---

## 6. Scope split — what F2 is NOT

**Entrances by hit type** — Caelan's *"slashing versus crushing"* note (09-14), which the roadmap row
bundles into F2 — is **not** the splat. It rides `game/fight-entrance.js` and the `_fightStart`
stamp in `main.js _trackFight`, a different system on a different timer: an entrance plays once when
a fight opens, a splat plays on every blow. Nothing in this branch touches it. It should be its own
row.

---

## 7. What I could not check

Stated plainly, because this ran with no eyes on it.

- **Nothing was seen rendered.** No browser, no dev server, no screenshot. Every visual claim is
  reasoning from the drawing code, not observation.
- **Whether `exclamation` actually reads as "energy zap"** at 14×14 on a red-fallback badge. It is
  the best of eight by elimination; it may simply read as "!".
- **Whether `drop` and `drops` are visually distinguishable** at that size. If they are not, the
  poison/sludge split is invisible churn and should be reverted — it is confined to two lines of
  `hit-splat.js` plus two tests.
- **Whether the mark is legible over a 3-damage badge at all.** The badge radius scales with the
  digit count, so the smallest splat is the smallest badge, and the mark sits at `r * 0.75` from
  its centre. On a one-digit hit that may crowd the rim.
- **The `energy` colour gap was left open on purpose.** `energy` still falls back to physical red in
  `SPLAT_COLOR`. A hex is a judgement about contrast — white digits with a dark shadow sit on top of
  it — and that is the kind of call that needs an eye, so it was recorded rather than guessed. The
  live palette is red / purple / green / orange / cyan / green-heal, which leaves yellow-white and
  magenta as the open lanes. **This is the single highest-value follow-up in this document:** an
  energy hit is currently indistinguishable from a punch by colour, and the mark added here is the
  only thing now telling them apart.
- **`cold` has no motion case either** — it falls through to `physical`'s hard snappy pop, so cold
  currently moves like a punch and only its fill says otherwise. Adding a drifting/shivering curve
  is animation, which is squarely in "cannot check it" territory. Recorded, not built.

## 8. Verified green

- `npm test` — **1608 tests, 285 suites, 0 failures** (baseline at branch point: 1512 / 278).
- `npm run -s balance:check` — *balance golden matches — no drift*.
- The one-word-name grep returns zero lines.
- `dev` and `main` untouched; this branch is off `dev` at `b53228e`.
