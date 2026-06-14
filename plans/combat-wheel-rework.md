# Feature: Combat Wheel Rework — Circular XMB + Targeting Reticle

**Phase:** Phase 2 — Life in the City (combat feel)
**Priority:** Critical (the wheel is the primary combat interface; the live one is "messy and hard to use")
**Status:** Design — Gate 2 (co-designed in conversation 2026-06-14; pending spec review → writing-plans)

> **Origin:** Playtest of the live three-ring wheel (`action-wheel.js`) — Caelan: *"The wheel has become quite messy and hard to use… the directions and moving the wheel with the arrow keys is a bit rough."* Diagnosed: it's a **spatial** UI (a circle, compass directions) **driven like a list** — Up/Down jump between concentric rings, Left/Right *spin* a ring, and the aim direction is something you *spin to*, disconnected from the key you press.

> **Relationship to canon:**
> - **Supersedes** [action-wheel-overhaul.md](action-wheel-overhaul.md)'s **input model** (grip-between-rings + spin-the-ring) and its **Direction ring** (a spun N/E/S/W compass). Keeps that doc's principles intact: smart defaults + auto-aim, double-tap-repeat express lane, "compose any action × item × target," snappy budgets, "the world never disappears," and **combat is never started by bumping**.
> - **Reconciles with** [combat-ui-layers.md](combat-ui-layers.md): its PlayStation-XMB reference is the lineage for this design; Inspect / mid-combat commerce stay **deferred** (a future drill-in, not part of this rework).
> - **Updates** the "walking into an enemy = silent no-op" line from action-wheel-overhaul: walking into a character now **shoves** them (shipped on `feature/movement-feel`). Combat still opens only via the act button — bump = movement, never combat.

---

## One-line player-experience goal

> **Combat is composing, with one grammar and honest aim** — pick a verb, pick an item, *place* it — and **every verb works on every character**, so "throw a fire potion at the strongest thing in the zone the moment you meet it" is always a real, obvious option.

---

## Gate 1: Research

### Genre references
- **PlayStation XMB** (Caelan's "Grammy-winning" reference) — a crossbar where one axis moves between groups and the other within a group; cursor ease-out lag + a tick per move = perceived snappiness. We make it **circular** and reduce it to one consistent grammar.
- **Persona 5 / Ben 10 Omnitrix / RDR2 weapon wheel** — radial command selection, muscle-memory by position, the *look* Caelan wants to keep.
- **Baldur's Gate 3** — the north star for *agency*: you can lob a fire potion at the strongest NPC the instant you meet them. The wonder is that the option is *real* — no "essential NPC" flag quietly making 99% of choices fake. The wheel exists to surface that freedom.
- **Old-van floating compass** — Caelan's metaphor for aim feedback: spinning the aim turns the character like a magnetic float, with a trajectory preview, so the spin *is* the direction, visibly.

### Player-experience goal
*"One grammar I learn in five seconds and trust everywhere; aim that means the direction/target I actually want; and the BG3 freedom to do any verb to anyone."*

### Technical feasibility
The combat resolvers (`combatAttack`, `resolveThrow`, `applyGive`, `addBuff('guard')`) are untouched — this is an **input + presentation** rework that composes the same `(action, item, aim)` and routes to them. Affected modules: `game/action-wheel.js` (state model), `game/main.js` (RADIAL_MENU input + open/fire), `game/renderer.js` (carousel + reticle draw), `game/layout.js` (geometry). The current `_animateWheelRing` / shortest-path easing helpers generalize to a carousel.

### Scope — Minimum Viable Feature
1. **One menu grammar** for the verb + item rings: `↑ forward · ↓ back · ←/→ cycle` (infinite carousel, fades at the edges).
2. **A targeting reticle** for aim (real 2-D placement), replacing the spun compass.
3. **Auto-aim + smart defaults** so the common case is `open → confirm`.
4. **Universal agency:** every verb is selectable against every character — no target gating.
5. **Keyboard + touch.**
6. Preserve **double-tap-repeat** (express lane, no wheel drawn).

### Out of scope (this pass) — see Dependencies
- The **3×3 AoE damage resolution** for potions/bombs/sludge/gold (the reticle *previews* a 3×3 footprint; the actual area-damage system is its own feature).
- **Multi-tile characters** (1×3, 2×2, 2×3) — the reticle is built multi-tile-aware, but the entity/collision/render system for big characters is a separate, large feature.
- **Throw range = 5 tiles** as a balance number — the reticle reads `item.range`; wiring/tuning that value is content/balance work, not this UI.
- **Inspect / mid-combat commerce** (combat-ui-layers.md Layers 2–3) — future drill-in.
- New combat verbs; controller support.

### Risks
| Risk | Mitigation |
|---|---|
| **Two grammars confuse** (carousel for menu, reticle for aim). | They map to two distinct, universally-understood modes — *pick the action* vs *aim a cursor* (every tactics/BG3 game does this). Auto-aim means most actions never enter free-reticle mode at all. |
| **Reticle feels slow** (moving up to 5 tiles). | Reticle **auto-starts on the nearest valid target**; the common loop stays `open → confirm`. You only move it to *place* an AoE/redirect. |
| **Losing the wheel's "cool."** | Keep the circular carousel look (rings, edge fade, center composition); the aim adds a trajectory + footprint preview that's *more* dramatic than the old spun ring. |
| **Scope creep into a combat rebuild** (AoE/multi-tile). | Hard line: this ships the *control + preview UI*; AoE/multi-tile resolution are named dependencies built separately. |

---

## Gate 2: Design

### The grammar (verb + item rings)

A **circular XMB**: one rule, identical on every menu ring.

```
   ←/→   cycle this ring   (infinite carousel — options fade in/out at the edges)
    ↑     forward — lock this choice and drop into the next ring
    ↓     back — pop up one ring   (from the top ring, it closes the menu)
  Space   = the act button: same as ↑ (forward / fire). Open also uses it.
```

`↓ = always back` is the keystone — folding cancel / up-a-layer into one button is what lets `↑ / ←→` stay perfectly consistent. There is no separate "grip between rings"; you are always *in* one ring, and `↑`/`↓` move you forward/back through the sequence.

### Rings & per-verb sequence

Ring 1 is always **Verb**. Whether rings 2/3 appear is contextual to the verb:

| Verb | Ring 2 — Item | Ring 3 — Aim (reticle) | Fire resolves to |
|---|---|---|---|
| **Attack** | — | reticle, **range 1** (adjacent, incl. diagonal); auto = nearest hostile | `combatAttack` on the target tile |
| **Throw** | items | reticle, **range = `item.range`** (e.g. 5); **3×3 footprint** for AoE items; auto = nearest hostile in range | `resolveThrow` |
| **Give** | items | reticle, **range 1** (adjacent character); auto = adjacent NPC | `applyGive` |
| **Skill** | per-skill *(future)* | per-skill *(future)* | placeholder until skills land |
| **Defend** | — | — (self) | `addBuff('guard')` — fires on `↑`/Space at ring 1 |
| **Run** | — | reticle, **range 1**, walkable tiles only; auto = away from threat | move one tile that way |

Unused rings simply don't appear in the sequence — there are no dimmed "chore" rings to navigate past.

### Aim = a targeting reticle (the "real placement" decision)

Aim is **not** a carousel — it's a reticle, because a throw is 2-D *placement*, not a 1-D pick (you position a 3×3 to clip the brute *and* the rat behind it).

- **Controls (reticle mode):** `↑↓←→` move the reticle one tile within range. **Space** fires. **Esc / back** cancels to the previous ring. (This is the one place `↓` doesn't mean "back" — it moves the reticle; back is Esc / the on-screen back affordance.)
- **Auto-aim:** the reticle opens already on the **nearest valid target** (nearest hostile for Attack/Throw; adjacent NPC for Give; safest retreat tile for Run). So the everyday action is `open → Space → Space` with zero reticle movement.
- **Preview, always on:** a dotted **trajectory** from the courier to the reticle, the **3×3 blast footprint** when the held item is AoE, and a highlight on **every character the action would hit** (footprint is multi-tile-target-aware so it lights up all tiles of a big enemy it overlaps).
- **Character turn:** the courier flips/leans to face the reticle (single front-facing sprite → L/R flip only; the **trajectory line is the precise indicator**, the flip just sells the "compass float").
- **Range feedback:** tiles beyond range are dimmed; the reticle can't leave the valid set.

### Universal agency (a hard rule, not a feature)

Every verb is always selectable against every character. The wheel **never** greys out Give/Throw/Attack because a target is "important." There is **no essential-NPC flag.** This is honest because the cast is one unified entity type (vendors, NPCs, enemies are the same thing) — so you can shove, attack, give-to, or lob a potion at *anyone*, including a shopkeeper or the toughest thing in the zone, from the moment you meet them. Standardized verbiage rides along: **Throw** means the same thing at a rat or the boss, so the player learns one vocabulary of agency and trusts it everywhere.

### Smart defaults & express lane (kept from canon)
- On open: last verb, last item-per-verb, and auto-aimed reticle.
- **Double-tap the act button = repeat last action** instantly, no wheel drawn (falls back to opening fresh if the last action is now invalid — item gone, target dead).

### Visual
- Circular carousel rings around a static **center composition** (`THROW × Hot Dog × ◎`), options curving along the ring and fading at the carousel edges (the "infinite carousel" illusion).
- The held ring is bright; the center always states the exact composition in words.
- Aim mode hides the rings and shows the world with the reticle + trajectory + footprint + target highlights.
- Animation budgets unchanged from canon: open 80ms, carousel step ≤120ms ease-out, back/peel 50ms; input on **keydown**, never buffered behind an animation. Audio: whoosh on open, tick per cycle, confirm on fire, reverse-whoosh on back.

### Touch (PWA)
- **Rings:** tap a slice to select+advance; swipe ←/→ to cycle; a thumb **BACK** affordance = `↓`/back.
- **Reticle:** tap a tile to move the reticle there (within range); tap again / a **FIRE** button to confirm; BACK cancels. Footprint/trajectory render the same.

### Data / state
Replace the grip+spin state (`grip`, `actionIndex`, `itemSlot`, `aim`, per-ring rotations) with a small **layer machine**:
- `layer` ∈ {VERB, ITEM, AIM} — where you are in the sequence.
- `verbIndex`, `itemIndex` — carousel positions (last-used persistence, session-only).
- `reticle` `{x, y}` and/or `targetRef` — the aim placement; seeded by auto-aim.
- `lastFired {verb, item, aimTile}` — for double-tap-repeat.
`compose()` builds `(verb, item, aimTile)` and routes to the existing resolvers — **no combat-math changes.**

### Integration map (by name, to survive line drift)
- **`game/action-wheel.js`** — replace the three-ring grip/spin model with the layer machine + carousel cycling + `compose()`. Keep the verb list + per-verb ring config (now "which layers the verb uses").
- **`game/main.js`** — RADIAL_MENU input becomes: rings use `↑ forward / ↓ back / ←→ cycle / Space fire`; AIM enters reticle mode (`↑↓←→` move, Space fire, Esc back). Add the auto-aim seeder (generalize `_nearestTargetDir` → `_autoAimTile(verb, item)`). Keep open + double-tap-repeat. Remove the spun-compass aim path.
- **`game/renderer.js`** — draw the circular carousel (edge fade, center composition, bright held ring) and the **reticle + trajectory + 3×3 footprint + target highlights**; retire the spun-compass ring draw.
- **`game/layout.js`** — carousel ring geometry + touch hit-zones; reticle has no fixed geometry (it's world-space tiles).
- **Untouched:** `combatAttack`, `resolveThrow`, `applyGive`, buffs, particles, screenshake, audio hooks.

### Save / load impact
None — wheel state is session-only muscle memory, as today. No schema change.

### Edge cases (≥5)
1. **No valid target on open** — reticle falls back to the player's facing tile; firing Attack into an empty tile is a **silent no-op** (no turn spent).
2. **Throw/Give with nothing valid** — the Item ring is empty → the verb shows a "[nothing to throw]" beat and can't advance to aim.
3. **AoE placed partly out of bounds / off-axis** — footprint clips to valid tiles; the off-axis case is *the point* (you can place it anywhere in range, not just on 8 rays).
4. **Multi-tile target** — the footprint/target highlight lights every tile of a big enemy it overlaps (reticle is multi-tile-aware even before multi-tile entities ship — it just operates on tile sets).
5. **Back-out / cancel** — `↓` (rings) and Esc/BACK (reticle) step back one layer each; from the top ring it closes to walking, no confirm dialog.
6. **Open mid-animation / enemy turn / RESOLVING** — gated exactly like current input; no opening mid-resolution.
7. **Reduce-motion** — carousel + reticle move snap instantly (no eased spin), per the existing accessibility setting.

### "Done when" scenario
> A rat is one tile east. **Space** — the wheel blooms on Attack, reticle auto-locked on the rat. **Space** — hit. **Double-tap Space** — hit again, no wheel. Now: a 2×3 brute three tiles northeast with a rat tucked behind it. **Space** → `←/→` to **Throw** → `↑` → `←/→` to **Fire Potion** → `↑` (into aim) → the reticle is on the nearest rat, so I nudge it `↑↑→` onto the brute; the **3×3 footprint** lights up the brute's tiles *and* the rat behind, the trajectory arcs there — **Space**, both burn. **Esc** back to walking. At no point did I spin a compass, hunt for a ring, or get told I "can't target that one."

---

## Dependencies (built separately, after this UI ships)
- **3×3 AoE damage resolution** (potions/bombs/sludge/gold) — the reticle previews the footprint; this resolves the area hit.
- **Multi-tile characters** (1×3, 2×2, 2×3) — reticle is built tile-set-aware to accept them.
- **Throw `range` data** (e.g. 5) — read from items; ensure items expose it.
- **Inspect / mid-combat commerce** (combat-ui-layers.md) — a future drill-in reachable from the wheel.

## Open questions (confirm at spec review)
1. **Verb set.** Keep the current six (Attack / Skill / Throw / Give / Defend / Run)? combat-ui-layers.md proposed **Inspect** as a verb and **Give inside Inspect**. Recommendation: keep the six now; Inspect arrives later as a drill-in. **Confirm.**
2. **Skill** has no content yet (MP is inert). Keep it on the ring as a visible-but-empty verb, or hide it until skills land? Recommendation: hide until it does something.
3. **The act/open key** stays **Space** (open + confirm + fire), with "wait a turn" remaining on `T`. Confirm.
4. **Use/consume** (eat a burger to heal) stays a hotbar action (1–9), not a wheel verb. Confirm.

## Gate 3 / Gate 4
Development quality checklist + polish pass produced by the implementation plan (writing-plans). Mandatory playtest against the "Done when" scenario; no-regression on the combat resolvers and on the just-shipped movement/shove input.
