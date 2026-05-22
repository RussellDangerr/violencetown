# Feature: Game Feel — Camera, Juice, and Polish
**Phase:** Phase 2 onward (incremental, each section ships independently)
**Priority:** High (feel is the difference between "functional" and "I can't stop playing")
**Status:** Design (Gate 1)

> **Origin:** Design session 2026-05-22. Camera behavior, screen effects, and "juice" — the collection of small visual/audio feedback systems that make inputs feel responsive, impacts feel heavy, and the world feel alive.

> **Connects to:** `plans/combat-ui-layers.md` (combat zoom + fog ring make the layered modals feel spatial, not just menu-based), `plans/stats-consumables-library.md` (heal animation already shipped — this spec covers the rest of the feedback surface).

> **Reference frame:** "Juice" as a game-feel discipline was codified by Martin Jonasson & Petri Purho ("Juice it or lose it", 2012 GDC). The principle: every player input should produce visible, audible, and physical feedback that exceeds the mechanical consequence. A block breaking in Tetris does ONE thing (clear a line) but FEELS like an event (flash, shake, score pop, sound). Violencetown's combat already has some juice (damage numbers, screen shake, hit flash, stagger). This spec systematizes and extends it across the entire game.

---

## 1. Camera System

### 1A. Trailing Camera (Exploration)

**Current:** Camera snaps to the player's tile instantly. The viewport is always perfectly centered on the player.

**Target:** Camera **eases** toward the player over ~150ms. The player moves first; the world catches up. Creates a sense of weight and momentum without affecting gameplay.

```js
cameraX += (targetX - cameraX) * 0.15;
cameraY += (targetY - cameraY) * 0.15;
```

**Feel:** The PSP/Vita menu scroll. The world has inertia. Quick movements feel fast because the camera trails; slow movements feel deliberate because the camera keeps up.

**Edge case:** When the player is near map edges, clamp the camera so it doesn't show out-of-bounds black. The camera stops trailing at the boundary but the player can still move into the corner.

### 1B. Combat Camera Lock

**Current:** Camera tracks the player during combat, same as exploration. When the player bumps an enemy, the viewport shifts as they move.

**Target:** When combat initiates (bump → COMBAT_OVERLAY), the camera **locks** — stops tracking player movement. The camera centers on the **midpoint between player and enemy** (or weighted slightly toward the player). This frames the encounter as a spatial relationship, not just "player at center."

**Unlock triggers:**
- Run (Escape): camera smoothly resumes tracking as the player retreats.
- Kill: camera holds for 300ms (death beat), then smoothly resumes.
- Layer 2+ (Inspect): camera stays locked, zoom increases (see 1C).

### 1C. Combat Zoom

**Current:** Fixed viewport scale. 19×19 tiles at 32px = 608px canvas. No zoom.

**Target:** Smooth zoom transitions at combat moments via `ctx.scale()`.

| Moment | Zoom | Duration | Feel |
|---|---|---|---|
| Combat initiation (bump) | 1.0× → 1.3× | 200ms ease-out | Fight gets intimate. You're in it now. |
| Inspect panel open | 1.3× → 1.5× | 150ms ease-out | Sizing them up. Their sprite is bigger, closer, personal. |
| Kill (K.O.! moment) | Hold 1.3× for 300ms | Then 300ms ease back to 1.0× | The beat. The impact frame. Then the world returns. |
| Run (Escape) | 1.3× → 1.0× | 200ms ease-out | Pulling back. Disengaging. World opens up. |
| Boss encounter | 1.0× → 1.5× → 1.2× (settle) | 400ms with overshoot | Dramatic. The boss is BIG. Camera overcorrects then finds its frame. |

**Implementation:** Canvas `ctx.save()` → `ctx.translate(centerX, centerY)` → `ctx.scale(zoom, zoom)` → `ctx.translate(-centerX, -centerY)` → render world → `ctx.restore()` → render HUD at 1.0× (HUD never zooms). Zoom value lerps each frame like the trailing camera.

### 1D. Combat Fog Ring

**Current:** No visibility system in combat. All tiles render at full brightness.

**Target:** When combat initiates, a **visibility ring** appears centered on the engagement at the player's sight range (~8 tiles). Everything inside = full brightness. Everything outside = 30% alpha.

**Key design:** Enemies outside the ring are **still visible** — dimmed but present. If they move toward the ring, the player sees them coming. When an enemy crosses the ring boundary, a brief flash-brighten (100ms) signals "NEW COMBATANT" and the ring can expand.

**Spatial awareness payoff:** "I have 3-4 turns before that thing reaches us" is a real-time tactical read that makes every combat encounter a positioning puzzle. It's not just "can I beat this?" — it's "can I beat this BEFORE that one arrives?"

**Implementation:** After rendering the world at full brightness, draw a semi-transparent black overlay with a radial cutout centered on the engagement. The cutout radius = sight range × tile size × zoom. The fade from bright to dim should be soft (gradient, not hard edge) — about 2 tiles of transition from full bright to 30%.

**Exit:** When combat ends (enemy dies, player runs, disposition flips), the fog ring fades out over 300ms. The world returns to full brightness smoothly.

---

## 2. Screen Effects

### 2A. Zone Transition Fades

**Current:** Map swap is instant. `_loadMap()` replaces the map and re-renders immediately.

**Target:** Fade to black (200ms) → load new map → fade in (300ms). Fade-out is faster than fade-in — arrival should feel like opening your eyes.

**Implementation:** Overlay a black `fillRect` at increasing `globalAlpha` (0 → 1 over 200ms), swap the map at full black, then decrease alpha (1 → 0 over 300ms). The transition label ("[Descend into the sewer]") renders centered on the black frame.

### 2B. Element Contact Pulse

**Current:** Sludge damage is logged as text. No visual feedback on the viewport.

**Target:** Brief full-screen color tint when an element contacts the player:

| Element | Tint Color | Duration | Trigger |
|---|---|---|---|
| Sludge | Purple (#3c145a at 20% alpha) | 80ms | Step on sludge tile |
| Goo | Green (#1a5a1a at 20% alpha) | 80ms | Step on goo tile |
| Fun | Pink (#ff44aa at 15% alpha) | 60ms | Fun bar ticks up |
| Death | Dark grey (#111111 at 25% alpha) | 100ms | Death bar ticks up |
| Sun damage | Warm white (#ffffcc at 20% alpha) | 60ms | Exposed tile on Street |

**Implementation:** Canvas `fillRect(0, 0, CANVAS_PX, CANVAS_PX)` with the tint color at the specified alpha, rendered AFTER the world but BEFORE the HUD. Triggered by a `_flashScreen(color, alpha, durationMs)` method that sets a timestamp, and the render loop draws the overlay while active.

### 2C. Combat Vignette

**Current:** Combat overlay dims the world to ~60% by dimming behind the overlay options. No edge darkening.

**Target:** When combat initiates, a **vignette** darkens the edges of the viewport, drawing focus to the center where the fight is happening. The vignette deepens as you go deeper into layers (Layer 1 = subtle, Layer 2 Inspect = pronounced, Layer 3 Item Action = strong).

**Implementation:** Canvas radial gradient from transparent center to `rgba(0,0,0,0.4)` at edges. The gradient's opacity lerps with layer depth. Renders after the world, before the HUD.

### 2D. Low HP Heartbeat

**Current:** HP bar changes color (green → red) below 30%. No other indication.

**Target:** Below 30% HP, the viewport **pulses** — a slow rhythmic vignette that brightens and darkens with a heartbeat cadence (~70 BPM = one pulse per 860ms). The pulse is subtle: alpha oscillates between 0.05 and 0.15 on the vignette. As HP drops lower, the pulse speeds up (50% at 15% HP, 100% at 5% HP — near-death is frantic).

**Audio (future):** A low bass heartbeat sound synced to the pulse. This is the most effective low-HP indicator in gaming history (Zelda, Resident Evil, Dead Space all use it).

**Implementation:** In the render loop, if `playerHp / playerMaxHp < 0.3`, compute pulse phase from `performance.now() % pulsePeriod` and apply a sine-wave vignette alpha.

---

## 3. Movement Juice

### 3A. Step Dust

**Current:** Player moves between tiles with a 100ms slide animation. No particle trail.

**Target:** When the player moves, a small puff of dust appears at the **departure tile** (the tile they left). 2-3 tiny particles that expand, fade, and dissipate over 200ms. Color matches the tile type: grey for stone, brown for dirt, purple for sludge (sludge step = dust + element pulse, double feedback).

**Implementation:** Reuse the existing `_damageNumbers` particle system but with smaller, faster, non-text particles. Add a `_spawnDust(tileX, tileY, color)` method that creates 2-3 particles with random spread, low opacity, and short maxAge.

### 3B. Footstep Rhythm (Audio, Future)

**Current:** No sound.

**Target:** A soft footstep sound on each tile move. The sound varies by tile type:
- Stone/concrete: hard tap
- Sludge: wet squelch
- Grass: soft rustle
- Metal (factory): metallic clink

**Feel:** Footsteps are the single highest-impact audio addition to any top-down game. They make movement feel grounded. Without them, the character floats.

### 3C. Bump Rejection Shake

**Current:** Walking into a wall produces a text log message ("[blocked north]"). No visual feedback.

**Target:** When the player walks into a wall, a **micro-shake** — 2px offset for 60ms, direction matching the attempted movement. The world jitters in the opposite direction you pushed. The character visually "bounces" off the wall.

**Implementation:** Set `_screenShakeUntil` with a very low magnitude (1-2px) and short duration (60ms). Reuse the existing screen shake system at a lower intensity.

### 3D. Pickup Flash

**Current:** Items auto-pickup on walk-over. Log message says "[Picked up Rock]". No visual on the canvas.

**Target:** When an item is picked up, the item sprite **flashes white and scales up 1.5× over 100ms** before disappearing. A small particle burst (3-4 sparkle particles) emanates from the pickup position. The hotbar slot that receives the item **pulses gold** for 200ms.

**Implementation:** Instead of immediately removing the ground item from the render list, mark it as `_pickingUp = true` with a timestamp. The renderer draws it with increasing scale and whiteness until maxAge, then removes it. Hotbar pulse: set a `_slotFlashUntil[slotIndex]` timestamp, render slot border as bright gold while active.

---

## 4. Combat Juice

### 4A. Already Shipped

These exist in the codebase and are working:
- **Floating damage numbers** — Colored, sized by damage magnitude, drift upward and fade.
- **Event word particles** — "POW!", "K.O.!", "OUCH!" — Persona-style emphasis text.
- **Screen shake** — On heavy hits and kills. Camera jitters.
- **Hit flash** — Enemy and player sprites tint red for 100ms on damage.
- **Stagger** — Sprite offsets 3px in the hit direction over 80ms.
- **Slide-in overlay animation** — Combat options ease-out from center over 80ms.
- **Heal animation** — Green "+HP" floating numbers (shipped this session).

### 4B. Kill Freeze Frame

**Current:** Enemy dies, "K.O.!" particle appears, enemy is removed from the render list.

**Target:** On kill, the game **freezes for 80-120ms** — every animation pauses, the screen holds, and the K.O.! particle is the only moving element. This is the impact frame. Then: screen shake, corpse drops, combat resumes. The freeze makes the kill feel HEAVY.

**Reference:** Hollow Knight's nail hits freeze the game for 1-2 frames. Street Fighter hit-stop. Celeste's screen freeze on dash-crystal collection. Even 2-3 frames of freeze completely transforms how an impact reads.

**Implementation:** Set a `_hitStopUntil` timestamp. In the main render/update loop, if `performance.now() < _hitStopUntil`, skip all animation updates but continue rendering the static frame. The particle loop respects the freeze by not aging particles during hit-stop.

### 4C. Defend Stance Visual

**Current:** Choosing Defend halves incoming damage (via the guard buff). No visual change to the player sprite.

**Target:** When the player chooses Defend, their sprite gains a **blue-white shield shimmer** for the duration of the turn. A translucent arc or circle in front of the sprite, pulsing once over 400ms. When damage hits while defending, the shield **flashes bright** and a "BLOCKED" or "GUARDED" event word appears in blue.

### 4D. Aggro Indicator

**Current:** Enemies chase when they spot the player (LOS + sight range). No visual indicator of when an enemy notices you.

**Target:** When an enemy spots the player (transitions from IDLE to chasing/HOSTILE), a **"!" exclamation mark** pops above their head — red, bold, 200ms scale-up then fade. Classic Metal Gear / Pokémon trainer detection moment. The "!" tells the player: this enemy saw you, combat is about to happen.

**Implementation:** On the FSM transition to HOSTILE (or legacy chase initiation), call `_spawnDamageNumber(enemy.x, enemy.y, '!', '#ff3333', 20)`. The existing particle system handles the rest.

### 4E. Near-Miss Particle

**Current:** When a thrown item misses, the log says "[Threw Rock — missed]". No visual on the canvas.

**Target:** When a thrown item passes through empty tiles, render a **streak particle** along the throw trajectory. If it misses, the streak dissipates at the end. If it hits, the streak terminates at the enemy with an impact burst. The throw should feel like it TRAVELED, not just appeared.

---

## 5. World Juice

### 5A. Idle Sprite Animation

**Current:** NPCs and player have a subtle idle bobble (1px vertical oscillation on a 250ms interval). This exists and works.

**Target expansion:** Different idle animations per NPC type:
- Fungus miners: slight sway (plant-like)
- Carrion: motionless (she's dehydrated, conserving energy — her stillness IS her animation)
- Fungus King: heavy breathing / pulsing (he's large, he's angry)
- Chest: faint glow pulse when containing items

### 5B. Ambient Particles

**Current:** No ambient particles. The world is static between player actions.

**Target:** Zone-specific ambient particles that drift across the viewport independently of player action:
- **Sewer:** Purple sludge drip particles falling from the ceiling. Slow, sparse.
- **Street:** Dust motes drifting in sunbeams (on exposed tiles). Paper scraps blowing.
- **Circus:** Confetti. Slow-falling, colorful, gentle. Always present.
- **Factory:** Sparks from machinery. Occasional. Bright orange, fast.
- **Graveyard:** Fog wisps. Slow, horizontal drift. Grey-white.

**Implementation:** A separate particle pool (`_ambientParticles`) with zone-specific spawn rules. Spawns 1-2 particles per second. Long maxAge (2-3 seconds). Does NOT use the combat particle loop — ambient particles render at the world layer, below HUD, and are always active (not just during combat effects).

### 5C. Tile Glow on Interactables

**Current:** Items on the ground render as colored sprites/fallback squares. No distinction between "there's something here" and "there's nothing here" at a glance from several tiles away.

**Target:** Ground items and interactables emit a subtle **glow** — a soft colored circle beneath them that pulses slowly. The glow is visible from several tiles away and reads as "something is here" before the player can identify the specific item. The glow color matches the item's fallback color.

**Implementation:** Before rendering the item sprite, draw a radial gradient circle at 15-20% alpha centered on the item tile, pulsing between 10% and 20% on a 2-second sine wave.

### 5D. NPC Patrol Footstep Trails

**Current:** NPCs move between tiles silently and instantly (greedy-step pathfinding, no animation).

**Target:** When an NPC moves, they leave a brief **footstep mark** on their departure tile — a subtle darkened spot that fades over 3-4 seconds. Over time, well-traveled patrol routes become faintly visible as tracks on the ground. The player can read NPC movement patterns from the terrain.

**Implementation:** Array of `{ x, y, age, maxAge }` fade-marks. When an NPC moves, push a mark. Render as a semi-transparent dark circle at the tile position, alpha proportional to remaining age. Clean up expired marks periodically.

---

## 6. UI Juice

### 6A. Number Countup on Stat Changes

**Current:** HP changes are instant in the HP panel. "HP 92 / 100" snaps to "HP 72 / 100" immediately.

**Target:** When HP changes, the **number counts down/up** over 300ms. HP 92 → HP 72 doesn't snap — it ticks: 92, 90, 88, 85, 82, 79, 76, 74, 72. The speed of the count matches the magnitude (small hits count fast, big hits count slow and dramatic). Heals count UP in green.

**Reference:** Every JRPG since FFVII does this. The countup is where the drama lives — you watch the number fall and HOPE it stops before zero.

### 6B. Gold Bounce on Transaction

**Target:** When gold changes (earn or spend), the gold display in the HP panel **bounces** — scales up 1.2× then back to 1.0× over 200ms. Green flash when gaining, red flash when spending. The number also countups/countdowns (see 6A).

### 6C. Hotbar Slot Shake on Empty Use

**Target:** If the player tries to use an empty inventory slot (press 1 when slot 1 is empty), the empty slot does a **micro-shake** — 2px horizontal jitter for 100ms. Same rejection feel as bumping a wall (3C) but applied to the UI instead of the world.

### 6D. Text Log Fade-In

**Current:** Log messages appear instantly in the text log panel.

**Target:** New log messages **fade in** over 150ms (opacity 0 → 1) and slide up slightly (4px) from their final position. Old messages are already visible; only the newest entry animates. Creates a sense of flow — messages arrive, they don't appear.

---

## Priority Order (What Ships First)

| Priority | Feature | Lines of Code | Impact |
|---|---|---|---|
| 1 | Trailing camera (1A) | ~10 | Everything feels smoother |
| 2 | Kill freeze frame (4B) | ~15 | Combat feels 3× heavier |
| 3 | Zone transition fades (2A) | ~20 | Transitions feel intentional |
| 4 | Combat zoom (1C) | ~25 | Fights feel intimate |
| 5 | Bump rejection shake (3C) | ~5 | Walls feel solid |
| 6 | Pickup flash (3D) | ~20 | Loot feels rewarding |
| 7 | Aggro indicator "!" (4D) | ~3 | Detection reads instantly |
| 8 | Combat fog ring (1D) | ~30 | Spatial awareness in combat |
| 9 | Element contact pulse (2B) | ~15 | Elements read without HUD |
| 10 | Low HP heartbeat (2D) | ~15 | Tension without sound |
| 11 | Combat camera lock (1B) | ~15 | Fight framing |
| 12 | Combat vignette (2C) | ~10 | Focus and depth |
| 13 | Step dust (3A) | ~15 | Movement feels grounded |
| 14 | Number countup (6A) | ~20 | HP drama |
| 15 | Ambient particles (5B) | ~30 | World feels alive |
| 16 | Tile glow on interactables (5C) | ~15 | Discovery reads from distance |
| 17 | Defend stance visual (4C) | ~15 | Defense reads visually |
| 18 | Near-miss streak (4E) | ~20 | Throws feel physical |
| 19 | Idle sprite variation (5A) | ~20 | NPCs feel individual |
| 20 | NPC patrol trails (5D) | ~20 | World tells its own story |
| 21 | Footstep audio (3B) | Audio asset | Biggest single feel improvement, blocked on audio pipeline |

**Total for top 10:** ~160 lines of code. Each is independent — ship in any order, each one immediately improves feel.

---

## Genre References

1. **Hollow Knight** — The gold standard for 2D game feel. Hit-stop on every nail strike (2-3 frames). Screen shake scaled to damage. Geo (currency) particles burst from enemies on kill. Ambient particles per zone (spores in Fungal Wastes, rain in City of Tears). Every surface has a unique footstep sound.

2. **Celeste** — Screen freeze on collectible grab. Dust particles on jump/land/dash. Camera leading (camera shifts slightly in the direction of movement, showing more of where you're going). Hair physics as state indicator (color = dash availability).

3. **Undertale** — Screen flash on critical hits. Heart pulse at low HP. Battle box shake on damage. The "spare" sparkle effect. Proves that RPG combat feel doesn't need AAA animation — it needs precise timing and clear feedback.

4. **Persona 5** — The menu transitions ARE the feel. Every screen change has a wipe, a slide, a flourish. The All-Out Attack splash screen. The results screen cascade. Persona proves that UI transitions can be the game's primary aesthetic, not just functional plumbing.

5. **Nuclear Throne** — Maximum screen shake. Camera recoil on firing. Shell casings as persistent particles. Enemies flash white before exploding. The game is 30% mechanics and 70% screen shake. Violencetown should NOT go this far — but the principle (every action has a visible consequence) is the same.

6. **Mother 3** — The battle backgrounds. Psychedelic, pulsing, zone-specific. They don't affect gameplay — they affect MOOD. The rhythm-combo system where timing hits to the music grants bonus damage. Proves that combat feel can be musical, not just visual.

7. **Stardew Valley** — Pickup sparkle. Tool use dust. Crop growth pop. Shipping bin ka-ching. Every daily action has a small satisfying visual/audio response that makes farming (the most repetitive activity in the game) feel good for 200+ hours.

---

## Open Questions

1. **Trailing camera in tight corridors.** In 1-tile-wide sewer corridors, the trailing camera might make navigation feel sluggish because the world is constantly catching up in a confined space. Should the trail strength reduce in tight corridors (closer to 1:1 tracking)?

2. **Combat zoom and HUD overlap.** At 1.3-1.5× zoom, the world tiles get bigger but the HUD stays at 1.0×. Does the HP panel need to reposition at zoom levels? Or does the zoom crop naturally avoid the corners where the HUD lives?

3. **Ambient particle density.** How many particles per second feel alive vs. distracting? Sewer drips are atmospheric at 1-2/sec but annoying at 10/sec. Needs playtesting.

4. **Kill freeze vs. game flow.** 80-120ms of freeze per kill in a room with 5 enemies = 400-600ms of total freeze. Does it feel rhythmic (each kill is a beat) or stuttery (the game keeps stopping)? Hollow Knight handles this by making kills rare enough that each freeze is an event. If Violencetown has pack enemies (Chupacabra, Hopkinsville Goblins), kills happen faster and freezes might stack poorly.

5. **Audio pipeline.** Multiple features (footsteps, heartbeat, UI sounds) are blocked on "do we have audio at all?" The game currently has zero audio. Adding a sound system (even a minimal Web Audio API setup with 5-10 sound effects) is a prerequisite for half the feel improvements in this spec. Should audio be its own feature spec?

6. **Performance budget.** Ambient particles + dust + NPC trails + fog ring + vignette + glow = multiple per-frame overdraw passes. Canvas 2D is not GPU-accelerated on all browsers. At what point do we need to profile and cap? Recommendation: ship features 1-10 first, profile, then proceed.
