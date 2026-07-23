# Violencetown — The Two Wheels, the Focus State & the Color Language (design spec)

> **STATUS (2026-07-23):** Mostly BUILT (colour language, `appliesTo`, the Target List, dominant-slice + flapper, combat re-skin). The one gap — §8 **layered examine** — is now designed + planned at `plans/layered-examine.md` + `plans/layered-examine-implementation.md`. See `plans/undeveloped-backlog.md`.

**Date:** 2026-07-03 · **Status:** design — awaiting Caelan's review before an implementation plan.
**Author:** brainstormed with Caelan (2026-07-02→03). This is an **evolution of the existing radial
compass wheel** (the `feature/wheel-sunburst-*` stack), NOT a rebuild — the model, nav, resolvers, and
juice all survive.

---

## 1. The problem (why this exists)

The immediate symptom: **you can't tell how to Examine the car.** Examine is an `E`-key-only verb
(`main.js:954` → `examine.js doExamine`), keyed to facing/adjacency, with **no touch affordance at all**.
On the touch UI there is literally no way to do it.

The deeper problem Caelan diagnosed: the combat **wheel is verb-first** — "I know I want to Fight → Melee →
Hit." That's great when you already know your intent. But out on the overworld you're asking the *opposite*
question — **"what can I even do with this thing?"** — and a verb-first wheel answers it badly: you open the
wheel, scroll a fixed verb list, and try each blindly on a brick wall that has no examine text. That's the
failure mode of old text adventures: **guessing at a hidden verb list**, rewarded with "nothing interesting."

Cramming Examine into the wheel (`Trick → Examine`) only buries it — the player can't be expected to
remember that path.

**The fix:** use modern processing to *pre-connect the dots* — always show the player the list of actions
that are actually valid for **this** target in **this** moment, and preview what each would do. No guessing,
no dead ends.

---

## 2. The core idea — one action model, two lenses

There are **two wheels**, two views onto the **same** action engine (`compose` / `affectedTiles` /
resolvers). This split is the whole unlock.

| | **Player Wheel** | **Target Wheel** |
|---|---|---|
| Show-biz name | **"Wheel of Fortune"** | **"The Price is Right"** |
| Question | verb-first: *"what do I want to do?"* | target-first: *"what can I do to **this**?"* |
| Whose menu | yours — your capabilities | the thing's — its affordances |
| Trigger | open your wheel (combat flow) | **tap a target** (discovery) |
| Lives | bottom-right corner | pops around the tapped target, out in the field |
| Contents | Fight / Trick / Treat | Examine + only the verbs that apply, A→Z |

**Examine (and Talk, Trade, ~~Give~~, Take) are _target_ verbs, not wheel verbs.** They live on the Target
Wheel and never pollute the Player Wheel. That dissolves the "bury Examine under Trick" knot.

> **Superseded 2026-07-03 — GIVE folds into TRADE.** Caelan cut the standalone **Give** verb from both
> wheels; giving an item to an NPC (incl. 0 GP / quest items) now happens **inside the trade window**, and
> the Target-Wheel **Trade** verb widens from vendor-only to **any adjacent NPC**. The `give-action.js`
> disposition math is unchanged — only the verb/node/UI is gone. Full removal + reroute plan:
> `plans/chapter-two-downtown-canyon-and-cohesion.md` **Phase 6a**. Wherever this doc lists **Give** as a
> shipped Target verb (§5 gold row, §6 "peaceful Trade/Give", §12 step 2), read it as folded into Trade.

A few verbs live in **both** by nature — **Hit** and **Throw**: initiate from the Player Wheel and aim,
*or* tap a target and pick it off the Target Wheel. They wear the same color in both places (see §5).

---

## 3. The `appliesTo` primitive (the new core — not the UI)

The one genuinely new engine piece: a per-verb **`appliesTo(target, game)`** predicate. When you tap a
target, the game asks every verb *"do you apply here, in range, right now?"* and surfaces only the yeses,
alphabetically. That single function is the whole "pre-connect the dots":

- It **is** the Target Wheel's contents.
- It lets the **Player Wheel gray out** impossible verbs too.
- It's **range-aware** — reuse `aimRange` / `affectedTiles`: **Hit** grays out if the target isn't adjacent;
  **Throw** shows only inside throw range. No talking to walls, no throwing people.

Build this once and both wheels fall out of it.

---

## 4. Pre-visualization (mostly already built)

`affectedTiles` already computes and washes exactly which tiles an action hits (the reticle AoE, the
"who's caught" outline). Surface it **one step earlier**: hovering/holding a verb — in either wheel —
previews the outcome (the Molotov's blast radius, who's in it) *before* you commit. Not new tech; a new
entry point.

---

## 5. The color language (one color = one meaning, on both wheels)

The backbone. **A verb keeps its color wherever it appears**, so color teaches the whole system.

| Color | Meaning | Where it appears |
|---|---|---|
| **Red** | combat / base | Fight (category) · Melee · **Hit** |
| **Purple** | magic | Fight → Magic (red **+** mana-blue) |
| **Amber** | ranged | Fight → Ranged · **Throw** |
| **Gold** | trick / money / transactions | Trick (category) · Flight · Bribe · Trade · Give · Hire Lire |
| **Green** | treat | food · buffs · heal · rest |
| **Steel / neutral** | information | **Examine** (no category — you never Examine from your *own* wheel) |

**The sync payoff:** a tapped enemy's **Hit** is the same red as Fight → Melee; its **Throw** the same
amber as Fight → Ranged. And Caelan's promotion idea works for free — a Target verb that could graduate to
a Player action already wears its category color, so it reads as *"oh, that's a Trick move."*

**Color-mix rationale (Fight's methods):** on a screen, light mixes *additively* — red **+** blue → purple
✓, red **+** green → yellow ✓. The literal red+green→yellow can't be used because **yellow collides with
Trick-gold** and **green is already Treat's**, so Ranged settles at **amber** (red nudged warm). Melee red,
Magic purple, Ranged amber.

**Glitter is a separate emphasis _layer_**, not a color — a shimmer overlay applied to the *notable* move
for a target (see §7), on top of whatever category color the wedge already has.

### 5.1 Leaf-tier colours + the current-tier accent (playtest refinement, 2026-07-03)

Colour identifies the **category** in the upper tiers, but at the **leaf tier it identifies the _thing_** —
each spell / throwable / item wears its **own** colour + silhouette, NOT the category's. Fireball is ember,
Cone of Cold is ice; a thrown rock is grey, a potion green. The "which section am I in?" cue does **not**
come from making every leaf purple — it comes from the **persistent section context** (the greyed breadcrumb
and the wheel's fallback accent, both purple while you're in Magic). This is the more useful signal at the
leaf: you already know you're casting; what you need is *which* spell.
*(Phase 0 implements this for the two spells and makes the fallback accent follow the current section rather
than the top-level category. The same rule extends to the Ranged/Throw ring — throwables keep their item
colours instead of all going amber — once that ring is item-driven.)*

**The current tier should dominate the circle.** Dropping into Magic doesn't yet read strongly enough as
"you are in MAGIC" — the section is a thin arc while the top-level red still fills most of the wheel. The
current tier should **swell to own the circle**: the §12.4 dominant-slice, extended from the selected
*wedge* to the current *section's* whole identity (colour + fill), so the tier you're on is unmistakable.
Flagged for the dominant-slice phase (§12.4).

---

## 6. Player Wheel — structure & feel (evolution of the compass)

### Structure

- **Top-level categories: Fight / Trick / Treat** (three). **Flight nests under Trick.**
- **Fight** → Melee / Ranged / Magic (existing sub-wheel; recolored per §5).
- **Trick (gold)** — the situational **GP-spending** category: Flight (Run / Hide / Wait / Defend), Bribe,
  Hire Lire, and the trick-skills (Boo!, Ray Blast). Bribe stays here (it's a combat GP move — spend gold to
  flip a bandit) even though it's target-ish; peaceful Trade/Give go to the Target Wheel.
- **Treat (green)** — food, buffs, heal, rest.
- Everything else — the compass nav (spin/drill/back), resolvers, cursor memory, placeholder padding, and
  the shipped juice (open-overshoot, spin-sweep, reduce-motion) — **is unchanged.**

### Selected-slice emphasis — "dominant slice"

The selected category must read as biggest. Chosen mechanism (of three prototyped): **dominant slice** —
the **selected wedge swells to full radius; the two neighbors recede.** The ring stays *angularly*
symmetric (only radius changes), so nothing lurches as you spin. (Rejected: the "wide slice" that eats a
bigger arc — it's the "takes up more of the semicircle" behavior Caelan flinched at, and the geometry jumps
on every cycle.)

### The game-show animation (three of four pieces already ship)

On each cycle: **spin → flapper flaps + clicks → the new slice pops big and settles.**

- **Spin** — one-wedge spin-sweep (already built, ~120ms).
- **Flapper / ticker** — a Price-is-Right flapper at the top pointer: as a category spins past, the wedge
  edge shoves the flapper up (~15°) and it snaps back into the next gap. The existing **`menu-tick`** click
  fires on every cycle already — that click *is* the flapper's tick.
- **Pop** — the newly-selected slice scales up with an overshoot as it lands under the pointer (retarget the
  existing open-overshoot scale at the *selected wedge*, bumped toward ~×1.2); the outgoing slice recedes.

### Placement

- **Bottom-right corner**, anchored so the **selected wedge faces up-left into the play field** (the pointer
  aims at the action, not the screen edge). The corner-tuck *reinforces* the dominant read — the selected
  slice and its neighbors are most on-screen while the Back/CLOSE tile curves toward the corner.
- The **Target Wheel** pops near the tapped target, out in the field, so the two don't fight for the corner.

### Which category is selected "now"

The selected wedge sits under the fixed top pointer; the wheel opens on your **last-used** category (cursor
memory), defaulting to **Fight** on a fresh game.

---

## 7. Target Wheel — the Price-is-Right carnival wheel

- A **big pegged carnival wheel** that pops around whatever you tapped, filtered by `appliesTo` (§3).
- Verbs ordered **alphabetically** (stable muscle memory — the *contents* shift per target, but the ordering
  rule holds; Examine is always first).
- **Colors come from the language (§5)** — so the Price-is-Right "random clashing colors" become *meaningful*
  (red Hit next to a gold Trade next to a steel Examine reads as a genuine, legible clash).
- **Gold trim** between every wedge (the show's yellow, substituted with gold), **rim pegs**, and a **red
  flapper** pointer. Style is a **split of the two takes** — carnival color vibrancy with disciplined
  cream/gold text so labels stay legible at wheel size.
- **Glitter** marks the **notable** move for that target (the plot-relevant Talk, a finishing Hit, a rare
  interaction) as a shimmer *layer* on top of its category color — **not** a fixed "Examine is always
  glittered" slot.

---

## 8. Layered examine text (kill "nothing interesting")

Examine must never dead-end. Resolution order:

1. **Instance** examinable — hand-authored per placement (the car, a sign). Today's `game.examinables`.
2. **Type-level** examine — **every item / enemy / tile _class_ carries a string.** A brick wall reads
   *"A brick wall. Solid. Uninterested in you."*
3. **Generic** fallback — last resort, still flavored.

This is Caelan's RuneScape **item-table-with-classes** idea, **generalized past items to enemies and tiles.**
It implies, and this spec adopts as a **foundation deliverable**:

- an item **`class`** taxonomy (items already carry partial `category` / `useType` / `equipSlot`);
- an **examine string on every item / enemy / tile type def**;
- a **developer/internal item-table view** — a viewer that lists every item with its class + examine +
  stats, so Caelan can see the roster take shape as he builds armor/weapons/etc.

---

## 9. Combat entry / exit — the two visual-state changes

Combat is **fluid, not a hard state change** (aligns with the already-unified clock: the world keeps
advancing in combat). "You're always a little in combat because you're always ready for violence."

1. **Aggro range = the existing lit combat arena.** The spotlight already *is* the lightmap, sized to the
   engaged enemies (`renderer._arenaLevel`). This is a **re-skin, not new tech**:
   - **tone it down** — the light levels are currently too much;
   - **blocky-retro** — an old-school pixel "fake circle" (boxes stepped around the edge), spread a bit wider;
   - draw the **line-of-sight / aggro lines** that feed the aggro system.
   - **Shift some of the "something's happening" signal off light → onto audio (a combat stinger/music) + a
     thin vignette** — cheaper, clearer, and it directly fixes "too much light."
2. **Fleeing enemies spend a few turns running out of combat** — reuse **`fleeStep`** (the Fear system's
   retreat pathing) generalized to combat-exit.

---

## 10. Keyboard / desktop parity (don't invert the bug)

The failure being fixed is "E-key-only, no touch." **Do not** ship "tap-only, no keyboard." Desktop needs a
**look / tab-target** path: cycle the on-screen targets with a key, open the Target Wheel on the current
one. Tap and keyboard reach the same Target Wheel.

---

## 11. Reused vs. new

**Reused (most of it):** the compass model + spin/drill/back nav + resolvers + shipped juice · `affectedTiles`
(pre-viz) · the lit arena (`_arenaLevel`, aggro) · `fleeStep` (flee) · `menu-tick` (the flapper click) · the
`examinables` system · items' partial category fields.

**New:** the `appliesTo` per-verb predicate · the Target Wheel render + tap-to-focus + its keyboard path ·
applying the color language across both wheels · the dominant-slice geometry + the flapper flap · type-level
examine layering + the item-`class` taxonomy + the dev item-table view · the aggro re-skin + audio/vignette.

---

## 12. Suggested build sequence (each its own `feature/*` branch off dev; decompose into plans)

This design is large; the implementation plan should **decompose** it. A low-risk → high-payoff order.
**Progress (2026-07-03): steps 0–2 are BUILT + verified in-browser + MERGED to `dev` (`24c4a46`)** — the
whole wheel arc landed as one `--no-ff` merge (`feature/wheel-target-wheel`). Steps 3–5 remain.

0. ✅ **DONE (merged).** **Color language + Flight-under-Trick** — colours became data on the verb-tree nodes;
   Flight nested under gold Trick; leaf spells wear their own colour (Fireball ember / Cone of Cold ice);
   `HUE` follows the current section. (`feature/wheel-colors-p0`; plan `…-phase0-*-implementation.md`.)
1. ✅ **DONE (merged).** **The `appliesTo` verb model** — `verbApplies(node, game)` grays out (and gates
   firing of) verbs with no valid target in range; routed through `tileEnabled` + `_wheelDrill`.
   (`feature/wheel-colors-p1`.)
2. ✅ **DONE (merged).** **The Target Wheel** — `STATE.TARGET_WHEEL`; `targetVerbs()` builds the alphabetical,
   colour-coded verb ring for a tapped target (Examine/Talk/Trade/Bribe/Give/Hit/Throw/Take); `_screenToTile`
   camera-inverse; `_drawTargetWheel` (Price-is-Right); picks route to the existing resolvers; F = focus the
   faced target. (`feature/wheel-target-wheel`.) *v1 centres the wheel + inline examine text — position-at-tile
   + hover pre-viz are folded into step 3/4 polish.*
3. ⏳ **Layered examine text + the item-`class` taxonomy + the dev item-table view** — the description-rich
   foundation. (Mostly data; enriches the Target Wheel's Examine path.)
4. ⏳ **Dominant-slice + the flapper** — the Player-Wheel game-show feel + the **bottom-right corner move**
   (+ the §5.1 "current tier dominates the circle" note).
5. ⏳ **Combat entry/exit re-skin** — tone down + blocky aggro circle + LoS lines + audio/vignette + flee-out.

> **Merge note:** steps 0–2 sit on the *new* `dev`. The **Armory** arc (unmerged, off the old `8d962fb`)
> touched `wheel-model.js` and **will conflict** with the wheel restructure when merged — reconcile by
> slotting its Boo!/Ray-Blast/Hire-Lire nodes into the new Trick/Magic tree.

---

## 13. Open decisions (default calls made — confirm in review)

1. **Talk / Take colors** — *default:* their own neutral utility tones (Talk teal, Take a muted green-steel),
   categoryless like Examine. *Alt:* give them real categories later.
2. **Glitter rule** — *default:* marks the **notable** move for a target, not "always-available." *Alt:*
   glitter the always-there anchor (Examine).
3. **Ranged = amber** — *default (recommended).* *Alt:* the literal red+green→yellow, which would force
   moving Trick off gold.
4. **Corner orientation** — *default:* selected wedge faces up-left into the play field.
5. **Scope** — *default:* one design, decomposed into the §12 sequence (each phase its own branch + plan),
   Caelan merges each.
6. **Leaf colours** — *default (Phase 0, done for spells):* leaves wear their own colour, section cued by
   context (§5.1). *Confirm* the same for throwables once the Ranged/Throw ring is item-driven.
7. **The hotbar's future** — Caelan suspects the 9-slot hotbar is on its way out as item interaction moves
   onto the wheels (Target Wheel = "Take / Use this"; Player Wheel Treat = consume). *Open:* keep it, slim
   it, or retire it once the Target Wheel lands — revisit at the Target Wheel phase, not now.

---

## 14. Success criteria

- You can **tap anything** and see what you can do with it — no hidden verbs, no guessing, never "nothing
  interesting."
- Examine is discoverable, **touch-first with keyboard parity**.
- The two wheels read as **one system** via the shared color language (a color means the same thing
  everywhere).
- The Player Wheel *feels* like a game-show wheel — dominant slice + flapper tick + pop — tucked bottom-right.
- Combat entry reads clearly **without** the current over-bright light.
