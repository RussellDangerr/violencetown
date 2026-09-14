# Feature: The fight as fog of war — what they can't see, and an entrance that says how it started

**Phase:** Design → Development.
**Priority:** High — F1, first of the three pieces Caelan's 2026-09-11 notes queued after the screen
(`plans/roadmap-2026-09.md` §4).
**Status:** Design (approved section by section, 2026-09-14).
**Companions:** `plans/visual-pass.md` (the threat overlay's phases and its 09-06 rulings, two of
which this revisits for fights) · `plans/stealth-perception-and-thieve.md` (`perceives()`, the one
sight rule this reuses) · `plans/screen-fill.md` (*Follow-on pieces* 1, where this began).
**Lab:** `game/_design-fight-fog.html` — local only (`.gitignore:88`), served by
`python dev-server.py 3001` at `/_design-fight-fog.html`. The real game with a prototype layer: a
Sewer or Town fight, every choice below as a switch, auto-fight, and `?capture=1` for rendering
clips headless (how Caelan reviewed this from his phone).

> **Decisions (Caelan, 2026-09-11 to 2026-09-14):**
> - **Fog of war, not a spotlight.** *"The circle really makes the entire experience seem really
>   drilled in on that fight. It really looks like a spotlight when it's more of a fog of war about
>   everything else that's happening outside. Again, the world is still moving around the outside,
>   so we don't want it to be completely dark."* (09-11)
> - **The fight area is what the fighters can see.** His idea first — *"maybe the fight area is
>   determined by the line of sight of the enemies, only drawing in where people can see as part of
>   the battle area"* (09-11) — then chosen over a steadier range bubble and over a square: their
>   real sight, the same cones the chase AI uses. (09-13)
> - **The "you've been made" flip becomes an entrance.** *"When I hear 'flash,' I'm thinking of an
>   impact frame or a fun zoom, and then smoke rolling out as fog as an animation across the
>   screen. Persona 5 has some really snappy stuff … Octopath Traveler … I think these JRPG elements
>   are the backbone of what I'm trying to do here."* (09-13)
> - **The fog's shape, the vignette's look.** *"The fog, the new fog, is exactly what I had in mind
>   in terms of the inversion and the way that it's limiting the screen. I think the vignette is
>   visually closer to what I had in mind in terms of what the fog of war would look like."* So: a
>   soft shadow, not the pixel stipple. (09-14)
> - **Not every fight the same.** *"I don't want every fight to feel the same."* Three entrances,
>   picked by **how the fight started** — chosen over by-enemy and over random. (09-14)
> - **Built as two small pure modules plus two renderer passes** — chosen over growing the stealth
>   overlay and over baking the fog into the night light map. (09-14)
> - **The stealth overlay outside fights keeps its stipple.** (09-14)

---

## Why: what a fight looks like today

Three layers stack the moment anyone hunts you:

- **The spotlight** — `renderer._drawArena` (`ef1aeaf`, 2026-06-27; its comment: *"no JRPG
  teleport-to-a-forest"*). It multiplies the world toward a cool dark tone (82, 84, 94), about a
  third of its brightness, and punches a lit circle centred on you: 4 to 7 tiles in radius (the
  farthest hunter plus 1.5) with a 2.6-tile soft edge. Eased in and out through
  `renderer._arenaLevel`, 15% a frame.
- **The threat field's stipple** — `_drawThreatOverlay`. Once anyone is chasing you the phase is
  ALARM, which paints a red dither (`rgb(204,68,34)` at 0.20) on every walkable tile an alert
  watcher can see: the ground between you. (A search alone is HAZE: a dark dither on the ground
  they *can't* see.)
- **The combat vignette** — also in `_drawThreatOverlay`, riding `_arenaLevel`: a radial black to
  0.35 at the screen's corners (`plans/visual-pass.md`, 09-06: *"The vignette is for combat"*).

On a filled screen (`plans/screen-fill.md`) the lit stage is a small share of the view: Caelan's
monitor shows about 54 tiles across, and the stage is at most 14 of them fully lit (19 with its soft
edge) — 8 when the enemy is two tiles off.

**What this changes of the 09-06 rulings** (`plans/visual-pass.md`): *"It inverts when they
actually find you"* — the flip survives, as the entrance (§2). *"Fine dither, not smooth alpha"* —
kept for the stealth overlay; the fight fog is smooth, but it takes the arena dim's place rather than
adding a fourth smooth layer (the mud that rule guarded against), and the vignette and the stipple
leave fights with it. *"The vignette is for combat"* — retired; the fog is the frame now.

**Where fights start, in code** — each path leaves a distinct trace, which is what makes "how it
started" (§2) cheap:

| How | Where | What changes | Entrance (§2) |
|---|---|---|---|
| They spot you | `npc.js` HOSTILE case (`perceives` → DIRECT) | `chasing`; logs *"[X spotted you!]"* | spotted |
| You hit someone who isn't hostile | `main.js combatAttack` → `_onEntityHarmed` | `chasing`; logs *"[The X turns on you!]"* | struck |
| You hit a hostile enemy that isn't hunting you | `combatAttack` → `emitNoise` (perception.js), then its turn in `npc.js` | `suspicious`, then `searching` (you're in its blind spot) or `chasing` (you're not) on the same beat | struck |
| You hit your own ally | `combatAttack` → `_revertAlly` | `chasing`; *"turns on you"* | struck |
| A gift insults them, or a conversation sours | `give-action.js`; `main.js _pickDialogueChoice` → `_onEntityHarmed` | `chasing` | spotted |
| Suspicion grows into a search | `npc.js` → `nextAwareness` | `searching` | search |
| Pursuers follow you through a door — **paused today** (`_zonePursuit` is off) | `main.js _injectFollowers` | `chasing` | spotted |

`isCombatActive` (`wheel-model.js`) is true while any non-ambient, living enemy is hunting —
`chasing` or `searching` (`ai.js isHunting`).

---

## The design

### 1. The fight area and its fog

- **Fighters** are the enemies `isCombatActive` counts — alive, not ambient, hunting — less any
  ally (`_ally`) or anyone without eyes (`sightRange` 0): the threat overlay's own watcher filter.
  **A fight is on while there is at least one fighter**, and everything below keys on that.
- **The fight area** is every tile at least one fighter perceives — `perceives()` returns DIRECT or
  PERIPHERAL — over the view plus a three-tile margin (so the blur and a step's scroll never show
  the edge). It is the AI's own answer, so standing in the fog means none of them can see you there:
  behind a fighter, around a corner from it, or past its range. A fighter's own tile is always seen,
  so a fighter never stands in its own fog. Night already shrinks sight (up to 40% at full dark),
  so night fights carry more fog.
- **Each fogged tile knows how far out it is**: its Chebyshev distance from the nearest seen tile
  (a breadth-first pass outward from the area). That distance drives the roll-out (§2) and the
  fog's depth.
- **Tiles are kept in world coordinates**, not as offsets from you, so the fog stays pinned to the
  ground — including while it fades after a fight, when you may already be walking.
- **It is recomputed when anything it reads changes** — the turn, your position, each fighter's
  position, facing and night level, the viewport, the zone — and never otherwise. Each recompute is
  `perceives()` for about 1,800 tiles × the fighters (the view plus the margin at 3440×1440).
- **The look is a soft shadow.** Each tile's fog strength goes into a mask at one pixel per tile;
  the mask is scaled up with smoothing and blurred by about a tile, tinted a cool dark
  (`rgb(58,62,84)`), and multiplied over the world at 0.62. Strength deepens with distance — 0.4 at
  the edge of their sight, rising to 1.0 seven tiles out — so the world at the rim of the fight is
  lightly shadowed (about 80% brightness) and the far world about half as bright. It never goes
  black, because the world out there is still moving. It lies on everything, walls included: a soft
  shadow does not bury the art the way the stipple did. (These are the lab's numbers; the build
  keeps them as named constants.)
- **Where it is drawn:** in `_drawArena`'s slot — after the Wilderness blackout and the night
  grade, before the zone-exit markers and the HUD — pinned to tiles through the same scroll and
  shake translate the world uses.
- **What a fight no longer draws:** the spotlight, the combat vignette (the always-on subtle border,
  `_drawVignette`, stays), and the threat field's stipple, ALARM's red and HAZE's dark alike.
  **What it keeps:** each watcher's facing chevron, the awareness marks (? ! over heads), and the
  dashed "sees you" thread.
- **Outside fights nothing changes.** The stealth overlay keeps its stipple for suspicious watchers
  and for lining up a theft, where which exact tile is safe matters more than the look, and the
  soft shadow's edge blurs by about a tile.
- **The Wilderness is skipped**, as the spotlight is today: its blackout already hides everything
  past your light.
- **When the fight ends** (no fighters left), the fog fades out over 0.5 s, holding the last fight
  area while it fades. **It clears at once, without the fade, on a zone change, a death or a
  restart** — the held area belongs to the map you left.

### 2. The entrance

The fight stays where it is: the entrance borrows the JRPG snap, not the JRPG battle screen.

- **Three entrances, picked by how the fight started:**

  | How it started | Entrance | Zoom punch | Fog arrives |
  |---|---|---|---|
  | **You struck first** — you hit one of the fighters on the turn the fight began: anyone who wasn't hunting you, including a hostile enemy from its blind spot | **Black & white close-up**: cream screen, you and the fighters as black silhouettes, blown up ×2.5 about the fight's middle | small, ×1.08 | rolls **out** from the edge of their sight |
  | **They spotted you** — a new fighter is chasing and you didn't hit anyone (a sighting, a gift or conversation that turned someone, pursuers through a door) | **Red & black slash**: red screen, a white slash through the fight, silhouettes ×4 | big, ×1.16 | closes **in** from the screen's edges |
  | **It grew out of a search** — the new fighters are only searching | **White flash**: a white screen fading over the impact window, no silhouettes | none | rolls **out** |

- **Recording the start.** On the turn a fight begins (no fighters → some), `main.js` stamps
  `_fightStart = { kind, at }`: `'struck'` if the player hit one of the fighters that turn — every
  player hit goes through `combatAttack`, which notes the turn and the target — else `'spotted'` if
  any fighter is `chasing`, else `'search'`. The pure module turns the kind into the entrance.
- **The timeline**, at 1×:
  - the impact frame, 0–110 ms, over the whole screen;
  - the zoom punch, which scales the whole finished frame (HUD included) about you: in over 80 ms,
    back out by 360 ms (ease-out, then ease-in-out);
  - the fog: each fogged tile fades in over 150 ms, starting at 110 ms + its order × 34 ms + up to
    70 ms of per-tile jitter, so the edge reads as smoke rather than a ruler. Order is the distance
    from their sight when rolling out, and the distance from the screen's edge when closing in. On
    a screen big enough that the farthest tile would start later than 820 ms, the step shrinks so
    it doesn't: the roll always finishes inside a second.
- **Silhouettes** come from the real sprites of you and the fighters, drawn body-only into an
  offscreen canvas and filled solid. `_drawEnemySprite` and `_drawPlayerSprite` paint a hit flash
  (a filled square) on top of the body, and the enemy also gets a health bar and buff badges — and
  a first strike begins on exactly the turn of a hit — so the build splits a body-only draw out of
  each. (The awareness marks come from the threat overlay, so they are already left out.)
- **Input is never blocked.** The entrance is presentation over a turn-based game; acting during it
  simply acts.
- **No replays on a flickering chase.** If a fight starts again within 3 s of the last one ending —
  an enemy that loses you and finds you again — the fog fades back in over 300 ms without an
  entrance.
- **Reduce motion** (the existing setting, `Settings.reduceMotion`): no impact frame and no zoom;
  the fog fades in over 300 ms, all at once.
- **The Wilderness gets its entrance too**; only the fog is skipped there.
- **Out of scope for now:** a sound for the impact (the game ships muted, and a sound deserves its
  own call); a boss entrance; entrances by hit type (Caelan, 09-14: *"different types of hits
  would have different impacts: slashing versus crushing"* — carried to F2, where damage types
  become visible).

### 3. How it is built and checked

- **`game/fight-area.js`** — pure (imports `perception.js` only). `fighters(enemies)` selects §1's
  set; `fightArea(map, fighters, bounds)` returns, in world tile coordinates, which tiles are seen
  and each fogged tile's distance. No DOM, no renderer, node-testable; F3 reuses it to decide who
  gets pulled into a fight.
- **`game/fight-entrance.js`** — pure: the entrance, and the fog's per-tile timing and depth.
  `entranceFor(start, lastFightEndedAt, now)` returns the entrance or none (the 3-second rule);
  `entranceAt(entrance, ms, { reduceMotion })` returns what that moment draws (the impact on or off,
  the zoom factor); `fogReveal(order, maxOrder, ms, jitter, { reduceMotion })` returns a tile's
  fade-in, 0 to 1; `fogDepth(distance)` returns its strength. The constants live here.
- **`game/renderer.js`** — `_drawFightFog` replaces `_drawArena`, and the fog's own fade replaces
  `_arenaLevel`'s ease (which the combat vignette also rides, and which `main.js`
  `_hasActiveEffects` polls). The mask is rebuilt only while the fog rolls in or fades out; the
  rest of the time the blurred fog is cached with the area, and a frame costs one multiply draw.
  `_drawEntrance` draws the impact and the zoom over the finished frame; body-only actor draws feed
  the silhouettes; `_drawThreatOverlay` skips its field and the combat vignette while a fight is
  on.
- **`game/main.js`** — stamps `_fightStart` and starts the render loop; `combatAttack` notes each
  hit's turn and target; records when a fight ends; clears the fog on a zone change, a death and a
  restart; and keeps the loop alive through the entrance and the fades (`_hasActiveEffects`).
- **Tests:**
  - *fight-area:* the three tiles behind a fighter are fog; a wall casts fog; PERIPHERAL counts as
    seen; two fighters' sight combines; night shrinks the area; allies and ambient townsfolk are
    not fighters; distances are Chebyshev steps out; tiles are in world coordinates.
  - *fight-entrance:* each start kind picks its entrance; no entrance within 3 s of the last fight;
    reduce motion drops the impact and the zoom; depth is 0.4 at the rim and 1.0 seven tiles out;
    the last tile of a 3440×1440 view is in before 1 s.
  - *main:* each start path stamps the right kind — a sighting `'spotted'`, hitting a non-hostile
    `'struck'`, hitting a hostile enemy from its blind spot `'struck'`, a soured conversation
    `'spotted'`, a search `'search'`; a zone change clears the fog at once.
  - *renderer:* in a fight, no spotlight, no combat vignette and no field stipple are drawn; outside
    a fight the threat overlay draws exactly as before.
- **In the browser**, at 3440×1440, 1920×1080 and the phone preset: each entrance in a real fight,
  with stills of each stage (freeze the page's clock and seek, as the lab does); stepping behind a
  fighter puts you in the fog; the fog clears when the fight ends, and stays put if you walk during
  the fade; leaving the zone mid-fight clears it at once; a clean console.
- **Speed:** a fight frame at 3440×1440 timed with the twin-canvas method
  (`plans/screen-fill-implementation.md`, Task 10's note) against today's spotlight, on a quiet
  machine, both while the fog rolls in and once it has settled.
- **Branch:** `feature/fight-fog` off `dev`; the merge is Caelan's call.
- **The lab** stays local as the visual reference until this merges.

---

## Out of scope

- F2 (hit-splat art) and F3 (who gets pulled into a fight) — their own specs; F3 builds on
  `fight-area.js`.
- The combat HUD — see *Follow-on pieces*.
- Any change to what enemies perceive or how they chase. This draws the AI's sight; it does not
  change it.
- The stealth overlay outside fights.

## Open, and not blocking

- The stealth overlay's stipple beside the fight's soft shadow: two looks for "they can't see you
  here". Kept deliberately (precision for theft planning); revisit if the contrast jars in play.
- The threat overlay draws under the fog, so a fighter's mark or health bar that pokes into a
  fogged tile above it dims with that tile (about 20% at the rim). Lift them above the fog if it
  reads badly in play.
- An impact sound, and a boss entrance.

## Follow-on pieces (raised by Caelan, 2026-09-14)

1. **The quest-1 autoplay** — next, by Caelan's order. A standard player profile completing quest
   1 step by step, on autoplay: *"for me to be able to see things (and for you to be able to test
   things and balance things)"* — his eval framing. Its own spec.
2. **The combat HUD.** In his 09-14 screenshot the wheel's dial sat over the message log. Caelan:
   the wheel should not overlap the message menus — collapse it left, or show an equipment panel
   for you and the enemy (what you could steal or buy); the log could become a combat log; the item
   bar *"needs to be more functional than just a single item … that menu has been strange for a
   little while."* Its own spec; it pairs with this one, which changes the world when a fight
   starts, where that changes the dock.
3. **Entrances by hit type** — with F2.
