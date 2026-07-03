# Feature: Movement Feel — DQM/Pokémon Overworld Walking
**Phase:** Game Feel (incremental polish; cross-refs `plans/architecture-and-game-feel.md` §4)
**Priority:** High (movement is the most-repeated interaction in the game; "jarry and cheap" → "great")
**Status:** Gate 3 — the core is **BUILT + on `dev`** (`24c4a46`): continuous chaining (`_onStepSettled` self-chain off the slide-completion callback), turn-in-place (`_beginMoveOrTurn`), `_queuedMoveDir` buffer, `_MOVE_MS`=150 / `_TURN_MS`=70. **Remaining = the 2026-07-03 addendum below:** held-key *resume* across state/scene transitions (a real bug Caelan is hitting), plus an optional halt-frequency softening.

> **Origin:** Design session 2026-06-13. Caelan: *"The movement is jarry and cheap. Make it more like Dragon Quest Monsters or Pokémon."* This plan implements the three movement findings already diagnosed in `architecture-and-game-feel.md` §4 (Findings 1–3, Decision D: "walk-cycle restoration is the next-biggest movement lever") plus two extensions Caelan chose: turn-in-place and animated enemy steps.

> **Explicit constraint from Caelan:** *"Keep the exact art and make the procedural animation workable for now."* Verified empirically: the Tiny Dungeon sheet (`tinyDungeon_packed.png`, 192×176, 12×11 grid of 16px cells) has **one unique front-facing pose per character cell — no walk frames, no directional poses.** So procedural animation is the *correct* way to honor "keep the exact art," not a shortcut. The real frame-based walk-cycle path stays as documented in `plans/sprite-sheets-and-idle-animations.md` and is **out of scope** here.

---

## Gate 1: Research

### Genre References
1. **Pokémon (Gen 3–5 overworld)** — Grid-logical, player pinned to screen-center, world slides in lockstep, **constant-velocity (linear) tile slides**, continuous gap-free walking while the d-pad is held, a 2–4 frame walk cycle, **tap-to-turn / hold-to-walk**, and input buffering at tile boundaries. This is the target.
2. **Dragon Quest Monsters / DQ overworld** — Same lockstep grid model; slightly more grounded step cadence; NPCs animate their own tile steps so the world reads as alive, not teleporting.
3. **Shattered Pixel Dungeon** — Our nearest structural sibling (turn-based grid). Confirms the turn model can stay; PD's smoother forks add a tile-slide tween exactly like ours.
4. **Stardew Valley** — Idle breathe + occasional blink on a *random* timer; reference for how the walk anim should hand back to a living idle, not a frozen pose.
5. **Enter the Gungeon** — Expressive, slightly exaggerated character motion. License for Violencetown's slapstick tone: the courier's walk can have characterful bounce/waddle, not just a clinical bob.

### Player Experience Goal
*"Holding a direction feels like a person hustling through the city — continuous, grounded, with weight on each step — and tapping a direction feels like a deliberate glance, not a lurch. The grid is real but invisible."*

### Technical Feasibility
The architecture already supports this (see `architecture-and-game-feel.md` §4: camera smoothing + linear easing are "already done correctly"). Affected modules:
- `game/main.js` — input handling, `_doMove`, `_animateMove`, auto-repeat → continuous chaining, constants. **Most-affected module.**
- `game/renderer.js` — `_drawPlayer` (procedural walk + facing), `_drawEnemies` (slide interpolation), effects-loop predicate.
- `game/enemies.js` — record from→to→start when an enemy moves (one site, ~line 246).
- No new data files. No `data.js` schema changes beyond two tunable constants.

Known constraints: no Node in this environment (the `node --test` suite runs on Caelan's machine, not here); verification is the project's established **empirical in-browser loop** (`python dev-server.py 3001` + hard-reload + drive `window.__game`), per `architecture-and-game-feel.md`'s "tests that take 30 seconds beat plans that take 30 minutes."

### Scope (MVF)
1. **Seamless continuous walking** — kill the `setInterval` auto-repeat race; chain the next step from the animation-completion callback (Finding 1, the deferred better-fix).
2. **Input buffering** — a direction pressed mid-slide is honored on completion instead of dropped (Finding 2; `_queuedMoveDir`).
3. **Step timing** — single tunable `MOVE_MS`; keep linear.
4. **Procedural walk + facing** (Finding 3, the depth section) — bob + squash/stretch + alternating weight-shift + horizontal flip for facing-left, handing off to the existing idle bob.
5. **Turn-in-place** — tap-to-face (free, no turn cost) / hold-to-walk, from standstill.
6. **Animated enemy steps** — enemies slide their tile over `MOVE_MS` instead of teleporting.

### Out of Scope (explicit)
- Real frame-based walk-cycle / 4-direction sprites (→ `sprite-sheets-and-idle-animations.md`).
- Up/down back-and-front facing sprites (Tiny Dungeon has none).
- Run/bike speed toggle.
- Camera dead-zone / look-ahead / edge clamping changes (current pinned-center lockstep stays).
- Combat camera lock / zoom / fog ring (`game-feel.md` §1B–1D).
- NPC patrol footprint trails (`game-feel.md` §5D), full step-dust system (`game-feel.md` §3A — a *minimal* footfall puff is an optional nicety within #4).
- Decoupling walking from the per-step turn advance — **the turn model stays.** Smooth visuals over discrete logic.

### Risks (top 3, with mitigation)
1. **Feel is tuned blind** (Caelan is on a remote session, can't preview). → Every feel parameter is a single named constant with a sane canon-aligned default; I verify *mechanics* in-browser via `window.__game`; Caelan dials *feel* after merge. Document the constants and their ranges in-code.
2. **Continuous-chain could strand `_animating = true`** (input lock-up) or recurse badly. → The completion callback already always clears `_animating`; chaining guards on `state === IDLE` + a held direction + the existing safety-stop. Stress-test rapid/conflicting input in-browser.
3. **Regressing the auto-walk safety-stop** (held-walk must still halt before walls/enemies/containers/transitions/pickups/hazards — the critical path relies on this, see `fix/critical-path`). → Reuse `_autoRepeatShouldStop` verbatim in the new chaining path; explicitly re-test pickup/transition/hazard halts in the Done-When pass.

---

## Gate 2: Design

### System Design

**Today (verified):** `playerX/Y` are integer tiles (`main.js:95`). A successful `_doMove` (`main.js:1487`) calls `_animateMove` (`main.js:1454`), which lerps `_animProgress` 0→1 over `_animDuration = 100ms` (`main.js:115`), re-rendering each rAF frame; the renderer slides the world via `_scrollX/_scrollY` while the player stays pinned at `half*TILE_PX` (288px). On completion the callback snaps `playerX/Y` and calls `_advanceWorld()`. Held-key walking runs a separate `setInterval(_AUTO_REPEAT_MS = 100ms)` (`main.js:1614`) that re-enters `_doMove`. **All input is hard-blocked while `_animating`** (`main.js:681`). `this.facing` is tracked (`main.js:1491`) but ignored by the renderer. Enemies snap instantly (`enemies.js:246`).

**Target architecture — one tunables block + four behavior changes:**

```js
// main.js (constructor / module constants)
this._MOVE_MS = 150;   // per-tile slide duration (linear). Canon datapoint: 100ms felt
                       // brisk-but-OK once the setInterval dead-frame was removed
                       // (architecture-and-game-feel.md Finding 1). 150 = a touch more
                       // grounded; tune freely.
this._TURN_MS = 110;   // tap-vs-hold threshold for turn-in-place from standstill
this._queuedMoveDir = null;  // one-deep input buffer (Finding 2)
this._stepIndex = 0;         // increments per completed step → walk-anim foot parity
```

**(1) Continuous chaining (replaces `setInterval`).** Delete the auto-repeat interval. After a step's animation completes, decide the next step from the completion callback:

```js
_onStepSettled() {            // called at the end of the _animateMove callback
    if (this.state !== STATE.IDLE) return;        // menus/transitions halt walking
    // Honor a buffered press first (Finding 2), else continue the held direction.
    let next = this._queuedMoveDir;
    this._queuedMoveDir = null;
    if (!next && this._heldDirKeys.length) {
        next = DIRS[this._heldDirKeys[this._heldDirKeys.length - 1]];
    }
    if (!next) return;                            // nothing held / buffered → stop
    if (this._autoRepeatShouldStop(next)) return; // SAME safety as today's auto-walk
    this._doMove(next);                           // chains seamlessly, zero gap
}
```

This makes cadence deterministic (`_MOVE_MS` exactly, back-to-back, no dropped tiles) and removes the `setInterval`/rAF drift that caused the "jarry" stutter.

**(2) Input buffer (replaces the hard block).** At `main.js:681`, instead of dropping input during a slide, capture the *movement* intent:

```js
if (this._animating) {
    const d = DIRS[e.code];
    if (d && this.state === STATE.IDLE) { e.preventDefault(); this._queuedMoveDir = d; }
    return;   // non-movement keys still ignored mid-slide (as today)
}
```

**(3) Turn-in-place** reshapes the IDLE direction handler (`main.js:791`):

```js
const dir = DIRS[e.code];
if (dir) {
    e.preventDefault();
    pushHeld(e.code);                             // existing held-stack bookkeeping
    const walking = this._animating || this._autoRepeatActive;
    if (!walking && this.facing !== faceOf(dir)) {
        this.facing = faceOf(dir);                // PIVOT only — no step, no turn cost
        this._render();
        this._pendingWalkDir = dir;               // arm hold→walk
        this._turnTimer = setTimeout(() => {
            if (stillHeld(e.code) && this.state === STATE.IDLE) this._doMove(dir);
        }, this._TURN_MS);
    } else {
        this._doMove(dir);                        // already facing, or mid-walk → walk now
    }
    return;
}
```

Turning is a **free action** (never calls `_advanceWorld`). Mid-walk direction changes skip the pivot-pause (they flow through the buffer / held-stack).

**(4) Procedural walk + facing** — see UI/UX Spec below (the depth section).

**(5) Enemy step slides.** At `enemies.js:246`, record the move; interpolate in the renderer:

```js
// enemies.js — where enemy.x/y are assigned to bestMove
enemy._slideFromX = enemy.x; enemy._slideFromY = enemy.y;
enemy.x = bestMove.x; enemy.y = bestMove.y;
enemy._slideStart = performance.now(); enemy._slideMs = game._MOVE_MS;
```
```js
// renderer.js _drawEnemies — visual position lerps from old tile to new
const t = Math.min(1, (now - (e._slideStart ?? 0)) / (e._slideMs || 1));
const vTileX = e._slideFromX + (e.x - e._slideFromX) * t;   // (and Y)
// screenX = (vTileX - playerX + half) * TILE_PX - _scrollX;  // same transform as today
```
Logic stays discrete (collision/AI read `enemy.x/y`); only the draw position interpolates. Enemy slides begin when `_advanceWorld` runs (player step completion), so they glide concurrently with the player's next step (cohesive) or solo if the player stops.

### Integration Map
| Module | Change | Interface impact |
|---|---|---|
| `main.js` | Remove `setInterval` auto-repeat; add `_onStepSettled`, `_queuedMoveDir`, turn-in-place, `_MOVE_MS`/`_TURN_MS`, `_stepIndex` | `_animateMove` callback now calls `_onStepSettled`; `_animDuration` ← `_MOVE_MS` |
| `renderer.js` | `_drawPlayer` procedural transform + facing flip; `_drawEnemies` slide lerp; `_hasActiveEffects` includes mid-slide enemies | reads `game.facing`, `game._animProgress`, `game._animating`, `game._stepIndex`; reads `enemy._slide*` |
| `enemies.js` | Record `_slideFrom*/_slideStart/_slideMs` on move | adds transient fields to enemy objects |
| `data.js` | (optional) house `MOVE_MS`/`TURN_MS` defaults if other modules need them | none — likely stays in `main.js` |

### Data Schema
No persisted schema. New fields are **transient animation/runtime state** only: `_queuedMoveDir`, `_turnTimer`, `_pendingWalkDir`, `_stepIndex`, `_MOVE_MS`, `_TURN_MS` on `Game`; `_slideFromX/Y`, `_slideStart`, `_slideMs` on enemy objects.

### UI/UX Spec — Procedural Walk Animation (the depth section)

The job: make a **single static front-facing 16px sprite** (drawn at 24px inside the 32px tile) read as a *walking person*, using only transforms in `_drawPlayer`. Human vision parses "walking" from **rhythmic weight-shift + vertical bounce**, and "this is a character (not a sliding cursor)" from **facing**. We stack five cheap layers, all driven by `_animProgress` (0→1 per tile) and `_stepIndex` (foot parity), wrapped in a `ctx.save()/translate(center)/…/restore()` about the sprite's center.

1. **Vertical step-bob** — one bounce per tile, so chained tiles read as a steady gait. `bob = -sin(π · _animProgress) · WALK_BOB_PX` (≈ **2px** peak). Returns to 0 at each tile boundary → seamless chaining, clean stop.
2. **Foot parity weight-shift** — the trick that turns "bouncing ball" into "walking person." Alternate a small horizontal lean each step by `_stepIndex % 2`: even steps lean/sway one way, odd steps the other (≈ **±1px** sway and/or **±2–3° rotation**). This *is* the procedural stand-in for left-foot/right-foot frames.
3. **Squash & stretch** — couple a subtle scale to the bob phase: squash at footfall (bottom of bob: `scaleY ≈ 0.94`, `scaleX ≈ 1.04`), neutral→slight stretch at the apex. Sells weight. Keep within ~6%.
4. **Facing** — flip horizontally when `facing === 'left'` (`ctx.scale(-1, 1)` about center); `right`/`up`/`down` draw unflipped. Optional vertical hint: a tiny forward lean (`+1px`/small +rot) when walking `down`, a slight back lean when walking `up`, since the sprite can't show its back. The satchel/asymmetry flipping on L↔R is a real, readable facing cue.
5. **Idle hand-off** — when **not** moving, the existing 1px / 250ms idle breathe-bob (`game-feel.md` §5A) plays; when moving, the walk layers supersede it. Both are small-amplitude, so the transition is invisible. Optional brief "settle" (one damped bob) on stop.

**Tone:** Violencetown is slapstick (`sprite-sheets-and-idle-animations.md`: "expressive and funny, not subtle"). Default amplitudes lean *lively* — a courier hustling — but every value is a constant so we can dial from "grounded" to "cartoon waddle":

```js
// renderer.js — top of _drawPlayer feel constants
const WALK_BOB_PX   = 2.0;   // peak vertical bounce
const WALK_SWAY_PX  = 1.0;   // peak horizontal weight-shift (alternates by step)
const WALK_LEAN_DEG = 2.5;   // peak rotation/waddle (alternates by step); 0 = no rotation
const WALK_SQUASH   = 0.06;  // scale delta at footfall
```
```js
// inside _drawPlayer, when game._animating (or continuous walk):
const p   = game._animProgress;                 // 0..1 this tile
const bob = -Math.sin(Math.PI * p) * WALK_BOB_PX;
const side = (game._stepIndex % 2 ? 1 : -1);    // foot parity
const sway = Math.sin(Math.PI * p) * WALK_SWAY_PX * side;
const rot  = (Math.sin(Math.PI * p) * WALK_LEAN_DEG * side) * Math.PI / 180;
const sq   = Math.sin(Math.PI * p) * WALK_SQUASH; // 0 at boundaries, max mid-step
ctx.save();
ctx.translate(cx + sway, cy + bob);
ctx.rotate(rot);
ctx.scale((game.facing === 'left' ? -1 : 1) * (1 + sq), 1 - sq);
ctx.translate(-cx, -cy);
// …existing drawFrame(PLAYER_SPRITE…) unchanged…
ctx.restore();
```
(Numbers are starting points; in-code comments mark them tunable.) **Optional footfall dust:** at the bottom of the bob, spawn 2–3 short-lived particles at the departure tile via the existing `_damageNumbers`-style pool — reinforces "stepping," ~10 lines, include only if it reads well.

### Save/Load Impact
**None.** All new state is transient. Defensive note: `facing` already defaults to `'down'` in the constructor, so an old save without an explicit facing is safe; no migration needed.

### Edge Cases
1. **Walk into a wall mid-continuous-walk** → chain halts (`_autoRepeatShouldStop`/wall check), `bump-wall` sfx, walk layers settle to idle; `_animating` is never left true.
2. **Direction released at the exact tile boundary** → fall back to a still-held key (existing held-stack), no phantom "stutter step."
3. **Two keys held, one released** → continue the other (existing `_heldDirKeys` behavior preserved).
4. **Tap-to-turn, then immediate opposite tap** → facing flips, no step, no world advance, `_turnTimer` from the first tap is cleared so it can't fire a stale walk.
5. **Buffered direction faces a wall/enemy/container on completion** → routed through `_doMove`, which bump-handles it (no crash, no wrongful turn advance for a silent bump).
6. **Enemy dies / is removed mid-slide** → renderer guards on the enemy still being in the list; `_slide*` fields vanish with the object.
7. **Menu / radial wheel / pause / transition opens mid-walk** → `state !== IDLE` stops chaining immediately; `_queuedMoveDir` is cleared on state change.
8. **Window blur while holding a key** → existing blur handler clears `_heldDirKeys`; chain stops (no phantom held key).
9. **Background-tab rAF throttle** → `performance.now()`-based `t` clamps to 1 on refocus; the slide completes without overshoot.

### Done When
Hold **D** across the town plaza: the courier **walks continuously and smoothly** with a visible step-bob and weight-shift, **no stutter and no dropped tiles**, sprite **flipped to face right**. Tap **W** once: he **pivots to face up without stepping** and **without the turn counter advancing**. Hold **W**: he walks up. A wererat two tiles away takes its turn and **visibly slides one tile** toward you instead of teleporting. Release mid-stride: he **finishes the current tile and settles into the idle breathe**. Walk into a wall: he **stops with a bump**, no freeze. Held-walk still **halts before** a pickup / map transition / hazard tile (critical-path safety intact).

---

## Gate 3: Development
- **Branch:** `feature/movement-feel` (off `dev`).
- **Order:** (1) tunables + continuous chaining → (2) input buffer → (3) step timing → (4) procedural walk + facing [extra care] → (5) turn-in-place → (6) enemy slides. Each step leaves the game playable; commit incrementally.
- **Verification:** in-browser empirical loop via `python dev-server.py 3001` + `window.__game` (sample `playerX/Y`, `_animating`, `_stepIndex`, `facing`, turn count across frames; confirm uniform cadence, pivot-without-advance, enemy `_slide*` populate, no console errors). Where the decision logic can be factored pure, add a `tests/movement-feel.test.js` for Caelan's `node --test` run.
- **Known Issues / deferred:** real walk-cycle sprites; up/down facing; run toggle; full step-dust & NPC trails.

## Gate 4: Review & Polish
- Self-review against the Gate 3/4 checklists (no regression, input handling, edge cases, perf).
- Polish: dial the walk constants; confirm idle hand-off; footstep sfx already fires on step (`main.js:1548`).
- Playtest 10+ min (Caelan, post-merge — he owns the feel call and the merge to `dev`).
- PR on `feature/movement-feel`; merge is Caelan's call.

---

## Gate 2 Addendum (2026-07-03) — held-key *resume* across state/scene transitions

**Origin:** Caelan playtest, 2026-07-03: *"holding the button to get through screens is really rough — you have to pick up and hold your key a lot… it needs to check if the key is being held down."* A 4-reader recon confirmed the diagnosis against current `dev` (`24c4a46`). Verdict: the walk **does not** rely on OS key-repeat (`main.js:769` discards `e.repeat`) — the shipped `_onStepSettled` rAF self-chain drives continuous walking. Two remaining gaps produce the "keeps dropping" feel:

**Gap 1 — no resume when a scene/state (re-)enters IDLE with a key still held (the real bug).**
The *only* thing that ever fills `_heldDirKeys` is a fresh `keydown` → `_noteHeld` (`main.js:923`, `:1795`). Every scene/state teardown **empties** that stack and never refills it: map-transition → `state=RESOLVING` then `_loadMap` (`:2664`, `:434`, which never touches the stack), plus the wheel/death/ending/blur/pause clears (`:998`, `:1353`, `:3080`, `:3182`). A physically-held key fires **no new keydown** in the new scene, so the stack stays empty and no walk starts until you lift and re-press. This is the "screen-to-screen is rough" symptom.

**Gap 2 — the chain deliberately halts before consequential tiles (partly by-design).**
`_autoRepeatShouldStop` (`main.js:1913`) stops the self-chain before any wall / hostile / container / transition / hazard (Gate-1 Risk 3, Edge Case 1 — the critical-path safety this plan promised to keep). Once halted, the walk is dead until a new keydown. In dense town/sewer maps those tiles are frequent, so mid-map walking also "keeps dropping." This is **correct** for transitions/hazards; the fix below removes the *re-press* penalty without removing the safety-stop.

### The fix (input-only, isolated — `fixScopeIsolated: true`)

- **(A) Track physical held state separately from the walk stack.** Add a `this._physicalHeld` Set, mutated **only** by real `keydown` (add `e.code`, *including* on `e.repeat` and in non-IDLE states) and `keyup` (delete). Cleared in **exactly one place — the blur handler (`:998`)** — never by the scene-teardown clears. This is the source of truth for "what is physically down right now" that survives state/scene changes. `_stopAutoRepeat` keeps clearing the *walk* stack `_heldDirKeys` but must **not** touch `_physicalHeld`.
- **(B) One re-arm entry point, `_resumeHeldWalk()`,** next to `_onStepSettled` (`:1887`): rebuild `_heldDirKeys` from `_physicalHeld ∩ DIRS` and, if `state===IDLE && !_animating && something-held`, kick `_onStepSettled()` (which still runs `_autoRepeatShouldStop`, so the first step in a new zone still respects the transition/hazard gate — **no blind auto-walk into the next screen**). Call it where the world returns to live IDLE: the transition `.then()` in `_advanceWorld` right after `state=STATE.IDLE` (`~:2667`), on respawn, and on wheel/menu/pause close.
- **(C) Halt-frequency (optional, Caelan's call).** (A)+(B) alone make a halted-then-cleared walk **resume the instant the blocker clears** without a re-press — which removes most of the "it dropped my hold" feel. If more is wanted, *narrow* `_autoRepeatShouldStop` to halt only on genuinely blocking tiles (walls/hostiles/containers) and let held-walk re-attempt each tick against softer cases — but that loosens a deliberate safety, so gate it behind an explicit decision, not a silent change.

**Risks / guards:** re-arm must fire **only** on return to `STATE.IDLE` (never let a key held while a menu is open auto-step on close); `_physicalHeld` must be gated exactly as keydown is for the walk stack (SPLASH/RESOLVING/paused early-returns); blur stays the sole `_physicalHeld` clear (a lost keyup on focus-change must not leave a phantom held key); route the re-arm through `_onStepSettled`/`_doMove` so it honors `_animating` and can't double-step; **do not** resurrect the old `setInterval` `_startAutoRepeat` model (still in `main-TheDangerrZone.js` / commit `b8e3e08`) — it's the historical runaway-repeat source.

**Done-When (addendum):** hold **D**, walk into a map-transition, keep D held through the load → you keep walking in the new zone with **no re-press** (but the *first* step still respects the transition gate, no double-warp). Hold a direction, close the wheel with it still held → walking resumes. Hold across a bumped wall that then clears (enemy moves aside) → resume without re-press.

**Branch:** extend `feature/movement-feel` (or a small `feature/movement-resume` off `dev`); Caelan merges. **Files:** `game/main.js` only (keydown/keyup in `_bindInput`, new `_resumeHeldWalk`, the return-to-IDLE call sites).

---

## Cross-references
- `plans/architecture-and-game-feel.md` §4 — the governing diagnosis (Findings 1–3, Decision D); confirms lockstep camera + linear easing are correct.
- `plans/game-feel.md` — §1A trailing camera **superseded** by the above; §3A step dust, §3C bump shake, §5A idle bob, §5D NPC trails are adjacent/future.
- `plans/sprite-sheets-and-idle-animations.md` — the eventual real walk-cycle path this interim layer will hand off to.
- `plans/sprite-polish-playbook.md` — sprite/tile iteration workflow (tile-picker overlay).
