# Feature: Action Wheel Overhaul — the Three-Ring Composer

**Phase:** Phase 2 — Life in the City (combat feel)
**Priority:** Critical (redefines how ALL combat/action input works)
**Status:** Design — Gate 2 (research + design complete; pending review → writing-plans)

> **Origin:** Brainstorm session 2026-06-09. Evolves the radial "Omnitrix" wheel already in `game/main.js`.
> **Relationship to canon:** Supersedes the layered-modal vision in [combat-ui-layers.md](combat-ui-layers.md) for the *input model*, but keeps its principles — "snappy" navigation, "Escape always steps you one closer to walking," the PlayStation-XMB feel, and the world never disappearing behind the menu. Inspect / mid-combat commerce from that doc are **deferred**, not cancelled (they become a later drill-in, not part of this overhaul).

---

## One-line player-experience goal

> **Combat is *composing*** — any action × any item × any direction, built on a single wheel that opens anywhere, fast by default and deep when you want it.

---

## Gate 1: Research

**Genre references**
- *Ben 10* Omnitrix dial / *Persona* command wheel / *RDR2* weapon wheel — radial action selection; muscle-memory by fixed position.
- PlayStation XMB (Caelan's "Grammy-winning" reference, from combat-ui-layers.md) — crossbar navigation: one axis moves between groups, the other within a group.
- *Pixel Dungeon* — the bump-to-attack convention we are **deliberately retiring** (see below).

**The decision that drove this: drop bump-to-attack.**
Bump-to-attack ("walk into enemy = melee") is a movement-only-roguelike convention. It actively fights this game because: (1) it hardwires the most boring option and bypasses the combinatorial wheel; (2) it causes fights the player didn't choose (the v0.9 audit found held-key auto-walk can bump into enemies); (3) once *direction* is a ring, "hit the adjacent guy" is just one configuration of the wheel — not special enough to hijack the movement keys. Its only real benefit was **speed**, which we preserve by making the wheel itself fast — not by overloading walking.

**Scope (Minimum Viable Feature)**
- A wheel of **three concentric rings** — Action (inner) · Item (middle) · Direction (outer compass) — opened by a dedicated button **anywhere** (not by bumping).
- **Smart defaults + auto-aim** so the everyday case is *Open → confirm*.
- **Double-tap-Open = repeat last action** (express lane, no wheel drawn).
- **Contextual rings**: each action lights only the rings it uses; unused rings dim.
- Full **keyboard and touch** navigation.

**Explicitly OUT of scope (this pass)**
- Enemy Inspect panel, mid-combat buying/alchemy (combat-ui-layers.md — future drill-in).
- Picking a *specific* enemy when several share a direction (aim chooses a **direction**, resolvers pick the first valid target along it).
- New verbs beyond the current set; multi-target AOE rework; controller support.

**Top risks + mitigations**
1. *Three rings feels busy.* → Contextual dimming + auto-defaults + visual hierarchy (only the held ring is bright). You touch a ring only to deviate from the default.
2. *Snappiness regression.* → Keep the existing budgets: open 80 ms, ring spin ≤120 ms ease-out, Esc peel 50 ms; input on **keydown**, never buffered behind an animation.
3. *Losing bump's fast melee.* → *Open → confirm* for the pre-aimed case + double-tap-repeat for spamming. Should feel as fast or faster than bump, with zero accidental engagements.

---

## Gate 2: Design

### Interaction model

- **No bump-to-attack.** Walking into an enemy/NPC just stops you (silent, no turn consumed) — same as bumping a wall today.
- **OPEN** summons the wheel anywhere, pre-loaded (see Smart Defaults).
  - *Desktop:* **Space** = the universal "act" button — it opens the wheel, and inside the wheel it **confirms/fires**. So *Space, Space* = quick attack on the pre-aimed target. (DECISION TO CONFIRM — see Open Questions: Space currently also waits/uses; we reshuffle "wait".)
  - *Touch:* a prominent thumb-reachable **ACTION** button opens the wheel; tapping slices drives it.
- **Double-tap OPEN = repeat last action** instantly, no wheel drawn — provided it's still valid (target alive, item in hand); otherwise it falls back to just opening the wheel. *(If OPEN and FIRE share one key — Space, recommended — this is just a fast double-tap: pause after the first press and the wheel blooms; tap again quickly and it fires the seeded default without ever drawing the wheel. Timing alone separates "open, then act deliberately" from "express repeat.")*
- **Escape** peels back one layer each press: held-ring → inner default → close → walking. Never a confirm dialog.

### The three rings

| Ring | Position | Contents | Notes |
|---|---|---|---|
| **Action** | inner | the verbs: Attack · Skill · Throw · Give · Defend · Run | Chosen every time → closest to the hub. Persists ("starts where you left it"). |
| **Item** | middle | inventory items valid for the current action | Contextual — only lit for Throw/Give (and future item-skills). |
| **Direction** | outer | a **compass**: N · E · S · W (4 cardinals, matching the tile grid — no diagonals) | The slice's angle *is* the world direction (right = east). Auto-aimed. |

The **static center** shows the live composition (`THROW × ROCK × →E`) — the combinatorial anchor that stays put while the rings turn around it. This is the "do anything with anything" surface Caelan flagged, now with a third axis.

### Which rings each action uses (contextual rings)

| Action | Item ring | Direction ring | Fire resolves to |
|---|---|---|---|
| **Attack** | — | **aim** (adjacent tile in the cardinal) | `combatAttack` on the target in that direction |
| **Throw** | **item** | **aim** (line, travels `range` tiles) | `resolveThrow` |
| **Give** | **item** | **aim** (adjacent NPC in the cardinal) | `applyGive` |
| **Skill** | (per-skill, future) | (per-skill) | placeholder until skills land |
| **Defend** | — | — (self) | `addBuff('guard')` |
| **Run** | — | **aim** (which way to flee) | move one tile that direction |

Rings an action doesn't use **dim out** (dashed, ~15% alpha) so three rings never means three chores.

### Navigation

- **Keyboard:** `↑ / ↓` move your *grip* between rings (Action ↔ Item ↔ Aim — skipping dimmed rings). `← / →` spin the held ring one slice (eased, shortest-path, as today). **Space** fires. **Esc** steps back. The held ring is drawn bright cyan; others gold/dim.
- **Touch:** tap any slice directly — no grip concept. The compass ring **doubles as a d-pad** (tap the east arc to aim east). Tap the center to fire the current composition; tap outside the wheel to cancel.

### Smart defaults (what makes it fast)

On Open, the wheel is seeded with:
- **Last action** (existing `radialInnerIndex` persistence).
- **Last item** per action (existing `radialSubIndex` persistence).
- **Auto-aim**: Direction pre-points at the **nearest valid target** for the current action (nearest hostile for Attack/Throw; nearest giftable NPC for Give); if none, it points at the player's current facing.

So the common loop is **Open → Space**. You spin a ring only to deviate — e.g. nudge Aim east to lob a rock *past* the rat in front at the one behind it.

### Data / state

- Replace the current two-level radial state (inner wheel + sub-wheel) with a **three-ring** model:
  - `wheelActiveRing` ∈ {0 action, 1 item, 2 aim} — which ring the keyboard grip holds.
  - `wheelAction` (index into the verb list), `wheelItem` (inventory slot, per-action persistence), `wheelAim` (one of N/E/S/W) — all with last-used persistence.
  - `_wheelTarget` is removed as the *driver* of direction; direction now comes from the Aim ring (auto-seeded, player-overridable).
- **Fire** composes `(action, item, aim)` and routes to the existing resolvers — no combat-math changes.

### Integration map (modules touched — referenced by name to survive line drift)

- **`game/main.js`**
  - *Remove* the bump-to-attack path: the `_openRadialMenu(enemy)` call inside `_doMove` (and the auto-direction-from-bumped-enemy logic in `_fireSubAction`/`_radialAttack`). Walking into an enemy becomes a silent no-op.
  - *Add* the OPEN handler (keydown for the chosen key + the touch ACTION button) and the **double-tap-repeat** timer/guard.
  - *Rework* radial input from inner/sub two-level to three-ring: `↑↓` changes `wheelActiveRing` (skipping dimmed rings), `←→` spins the held ring, Space fires. Replace `_radialRotate`/`_radialConfirm`/`_fireSubAction` accordingly; keep the eased-rotation helpers (`_animateInnerRotation`, `_shortestAngularPath`) — they generalize to any ring.
  - *Fold in* the throw-direction picker: the standalone `STATE.ITEM_THROW_DIR` / `_doThrow(dir)` flow is **absorbed** by the Aim ring. (Hotbar-initiated throws either route through the wheel or keep a thin direction prompt — see Open Questions.)
  - *Add* auto-aim helper (`_nearestTargetDir(action)`).
  - *Update* `_tapRadialMenu` for three rings + the compass d-pad hit zones.
- **`game/renderer.js`** — draw three concentric rings + compass labels + contextual dimming + the bright "held ring" highlight + the static center composition. Generalize the existing radial draw; retire the two-ring-specific path.
- **`game/layout.js`** — ring radii and per-ring hit-zone geometry for three rings + the four compass arcs (single source shared by main.js hit-tests and renderer draws, per the existing pattern).
- **`game/items.js` / `game/data.js`** — already expose `useType` (throwable/giveable) and item ranges the rings filter on; no schema change expected.
- **Keep untouched:** combat resolvers (`combatAttack`, `resolveThrow`, `applyGive`), buffs, particles, screenshake, and the new audio hooks (add a tick on ring-spin, whoosh on open, reverse-whoosh on Esc).

### UI / UX spec

- **Animation budgets:** open 80 ms · ring spin ≤120 ms ease-out cubic · contextual dim/undim 100 ms · Esc peel 50 ms. Input on keydown; a key pressed mid-animation completes it instantly and processes.
- **Audio (hooks now exist post-1.0-merge):** `menu-open` whoosh on Open; a soft tick per ring spin; `menu-confirm` on fire; `menu-cancel` reverse-whoosh on Esc. Audio is ~half of perceived snappiness.
- **Readability:** only the held ring is full-brightness; the static center always shows the exact composition in plain words; dimmed rings are unmistakably inert.

### Save / load impact

- Wheel indices are **session-only muscle memory** (as today) — not persisted in the save blob. No save-schema change. (Note for review: persisting "last loadout" across sessions is a possible nicety, deferred.)

### Edge cases (≥5)

1. **No valid target on Open** — Aim falls back to facing; firing Attack into empty space is a **silent no-op** (no turn consumed), not a wasted turn.
2. **Throw/Give with nothing valid** — the Item ring is empty → that verb is shown **disabled** (dim) with a "[nothing to throw]" beat; can't be fired.
3. **Double-tap-repeat when last action is now invalid** (item used up, target dead) — falls back to opening the wheel fresh instead of firing into nothing.
4. **Several enemies down one cardinal** — Aim is a *direction*; the resolver hits the **first** valid target along it (melee = the adjacent one; throw = first in the line within range).
5. **Open while adjacent to a friendly NPC** — wheel still opens (it's proactive); Attack is filtered off friendlies by the existing `_adjacentHostiles` gate; Give targets them.
6. **Open during the enemy turn / a move animation / RESOLVING** — gated exactly like current input (no opening mid-resolution).
7. **Diagonal intent** — unsupported by the 4-direction tile grid; the compass exposes only N/E/S/W.

### "Done when" scenario

> A rat is one tile east. Press **Space** — the wheel blooms, already on Attack, already aimed east. Press **Space** — the rat takes a hit. **Double-tap Space** — it's hit again, no wheel. A second rat lurks two tiles east behind the first; press Space, `↑` to grab the Item ring, `←/→` to Rock, `↑` to the Aim ring (it's already east) — Space lobs the rock down the line at the back rat. Press Space, spin Action to **Defend** — Item and Aim rings fade, you brace. **Esc, Esc** — back to walking. At no point did walking into anything start a fight, and the fast cases never felt slower than a bump.

---

## Gate 3 / Gate 4

Development quality checklist and polish pass to be produced by the implementation plan (writing-plans). Mandatory 10-minute playtest against the "Done when" scenario; no-regression check on the existing combat resolvers and save round-trip.

---

## Open Questions (confirm at spec review)

1. **OPEN key on desktop.** Recommendation: **Space** becomes the universal "act" button (opens the wheel; confirms inside it). The current Space roles reshuffle — "wait a turn" becomes *Open → confirm with the default/Pass* (or a dedicated key like `.`); the item-use overlay is absorbed by the wheel. Alternative: a brand-new key (e.g. `F`) leaves Space alone but adds a key to learn. **Which?**
2. **"Use / consume" an item** (eat a burger to heal) currently lives in the hotbar overlay (Use/Throw/Smash/Give). With the wheel as the action surface, does **Use** become a 7th verb on the Action ring, fold into the Item ring's behavior, or stay a hotbar action outside the wheel? Recommendation: keep quick **Use** on the hotbar (1–9 → Use) for out-of-combat healing, and let the wheel own Throw/Give/Attack — but flagging it.
3. **Verb set.** Keep the current six (Attack/Skill/Throw/Give/Run/Defend)? combat-ui-layers.md proposed **Inspect** instead of Skill/Give-on-wheel. Recommendation: keep the current six now; Inspect arrives later as a drill-in, not a ring verb.
4. **Hotbar-initiated throw** — once Aim is a ring, do we keep any hotbar "select item → throw" path, or is all throwing through the wheel? Recommendation: all throwing through the wheel (one mental model); hotbar 1–9 stays for *selecting/Use* only.
