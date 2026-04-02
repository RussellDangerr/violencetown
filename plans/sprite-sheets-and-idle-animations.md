# Feature: Sprite Sheet System & Idle Animations
**Phase:** Phase 1 — Visual Foundation
**Priority:** High
**Status:** Research

> **Purpose:** Replace ASCII character rendering with sprite-based rendering using sprite sheets. Define how sprites are organized, sliced, layered, and animated — with special attention to idle animations that give the game life while waiting for player input.

---

## Gate 1: Research & Discovery

### Genre References

1. **Shattered Pixel Dungeon** (open source, Java/Android) — Uses per-entity sprite sheets. Each creature gets its own PNG strip. Sprites are 16x16 base, rendered at 2x–4x. Idle is a 2-frame breathe/bob loop. Animations defined in code: `idle`, `run`, `attack`, `die`, each referencing frame indices within the strip. Key insight: **one sheet per entity, not one giant atlas.**

2. **Stardew Valley** — Characters have directional sprite sheets (4 directions x N frames per action). Idle is subtle: 1-2px breathe cycle, occasional blink on a random timer. Environmental tiles (water, crops, torches) animate independently on their own frame clocks. Key insight: **idle blink on a random interval, not a fixed loop — feels alive, not robotic.**

3. **Enter the Gungeon** — Exaggerated idle animations. Characters bounce, weapons bob, capes flutter. 4–6 frame idles at ~150ms per frame. Everything oversold for comedic effect. Key insight: **Violencetown's slapstick tone means idle animations should be expressive and funny, not subtle.**

4. **Caves of Qud** — Tile-based, minimal animation. Character sprites are mostly static with color overlays for mutations/effects. Tiles shimmer via palette cycling. Key insight: **status effect overlays via tinting/compositing are cheaper than unique sprites per state.**

5. **Dead Cells** — Fluid idle animations (8–12 frames) with secondary motion (hair, cape, weapon sway). Idles transition seamlessly into movement. Key insight: **anticipation frames at the end of idle that blend into walk cycle make movement feel responsive.**

### Player Experience Goal

"Every character breathes, fidgets, and feels alive — even when the player is thinking. The world doesn't freeze visually just because it's your turn."

---

## Sprite Sheet Structure

### Organization Convention

Each sprite sheet is a **horizontal strip or grid** where:
- **Rows** = animation states (idle, walk, attack, hit, die)
- **Columns** = frames within that animation
- Sprites are uniformly sized cells within the grid

```
Example: 32x32 sprite, 6 columns wide, 5 rows tall
┌──────┬──────┬──────┬──────┬──────┬──────┐
│idle 0│idle 1│idle 2│idle 3│idle 4│idle 5│  Row 0: Idle (6 frames)
├──────┼──────┼──────┼──────┼──────┼──────┤
│walk 0│walk 1│walk 2│walk 3│walk 4│walk 5│  Row 1: Walk Right (6 frames)
├──────┼──────┼──────┼──────┼──────┼──────┤
│atk 0 │atk 1 │atk 2 │atk 3 │      │      │  Row 2: Attack (4 frames)
├──────┼──────┼──────┼──────┼──────┼──────┤
│hit 0 │hit 1 │      │      │      │      │  Row 3: Hit reaction (2 frames)
├──────┼──────┼──────┼──────┼──────┼──────┤
│die 0 │die 1 │die 2 │die 3 │      │      │  Row 4: Death (4 frames)
└──────┴──────┴──────┴──────┴──────┴──────┘
```

### Separate Sheets by Category

| Sheet | Contents | Reasoning |
|-------|----------|-----------|
| `terrain.png` | All ground tiles, walls, doors, hazard tiles, furniture | Terrain rarely changes. One load, many draws. |
| `creatures/human.png` | Human idle, walk, attack, hit, die | Per-creature sheets. Swap creature = swap sheet. |
| `creatures/wererat.png` | Wererat animations | Each creature has unique proportions and personality. |
| `creatures/robot.png` | Robot animations | |
| `creatures/clown.png` | Clown animations | |
| `creatures/skeleton.png` | Skeleton animations | |
| `npcs.png` | Rat, bandit, drunk, vendor, dog, bosses | Enemies and NPCs grouped together. |
| `items.png` | All items (weapons, consumables, rings) | Single sheet, static sprites (no animation). |
| `effects.png` | Damage flash, sludge coat, goo glow, particles, auras | Overlay effects, may be animated. |
| `ui.png` | HP bars, status icons, action indicators | UI elements separate from world sprites. |

### Sheet Size Recommendations

- **Power of 2 dimensions** (256x256, 512x512, 1024x1024) — GPU texture optimization, even on Canvas 2D (browsers internally texture-map)
- **Max practical size:** 2048x2048 for broad compatibility
- **For 32px sprites:** A 512x512 sheet holds 16x16 = 256 sprite cells — more than enough for all terrain
- **For creature sheets:** 192x160 (6 cols x 5 rows of 32x32) covers all animation states per creature

---

## Sprite Sheet Coordinates — How to Slice

### The Core Formula

Given a sprite sheet with uniform cell size:

```javascript
// Sprite sheet config
const SPRITE_SIZE = 32;  // pixels per cell
const COLS = 6;          // columns in this sheet

// Get source rectangle for frame N in row R
function getSpriteRect(row, frame) {
    return {
        sx: frame * SPRITE_SIZE,          // source X
        sy: row * SPRITE_SIZE,            // source Y
        sw: SPRITE_SIZE,                  // source width
        sh: SPRITE_SIZE                   // source height
    };
}
```

### The Canvas drawImage Call

```javascript
// drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
//
// sx, sy = top-left corner of the rectangle to cut FROM the sprite sheet
// sw, sh = size of the rectangle to cut
// dx, dy = where to place it on the canvas
// dw, dh = size to draw it at (can scale up/down)

const src = getSpriteRect(0, currentFrame);  // Row 0 (idle), frame N

ctx.drawImage(
    spriteSheet,          // the loaded Image object
    src.sx, src.sy,       // source position in sheet
    src.sw, src.sh,       // source size (one cell)
    tileX * TILE_SIZE,    // destination X on canvas
    tileY * TILE_SIZE,    // destination Y on canvas
    TILE_SIZE,            // destination width (can differ from sprite size)
    TILE_SIZE             // destination height
);
```

### Mapping Entities to Sprite Positions

```javascript
// data.js — entity definitions reference their sheet coordinates
const CREATURES = {
    human: {
        sheet: 'creatures/human.png',
        animations: {
            idle:   { row: 0, frames: 6, speed: 180 },  // ms per frame
            walk:   { row: 1, frames: 6, speed: 100 },
            attack: { row: 2, frames: 4, speed: 80 },
            hit:    { row: 3, frames: 2, speed: 120 },
            die:    { row: 4, frames: 4, speed: 150, loop: false }
        }
    },
    wererat: {
        sheet: 'creatures/wererat.png',
        animations: {
            idle:   { row: 0, frames: 4, speed: 200 },
            // ...
        }
    }
};

// Terrain tiles are static — just an index into the grid
const TERRAIN = {
    concrete:    { sheet: 'terrain.png', col: 0, row: 0 },
    brick_wall:  { sheet: 'terrain.png', col: 1, row: 0 },
    sludge_pool: { sheet: 'terrain.png', col: 2, row: 0, animated: true, frames: 3, speed: 300 },
    // ...
};
```

---

## Idle Animations — What Makes Them Good

### The Principles

1. **Breathe cycle** — The most basic idle. 1–2px vertical bob simulating breathing. Every living creature gets this at minimum.
2. **Asymmetric timing** — Don't loop at a constant rate. Inhale is faster than exhale. A 6-frame idle might hold frame 0 for 2 beats: `[0, 0, 1, 2, 3, 2, 1, 0]` with variable durations.
3. **Random interrupts** — Every few seconds, play a "fidget" micro-animation: blink, scratch, look around, weapon twitch. Use a random timer (3–8 seconds) so it never feels mechanical.
4. **Creature personality in the idle** — The idle IS the character. A skeleton rattles. A clown honks. A robot glitches. This is where Violencetown's comedy lives.
5. **Environmental animation is independent** — Water, torches, sludge, and goo animate on their own clock. They don't wait for player input. The world is always alive.

### Frame Counts and Timing

| Animation Type | Frames | ms/frame | Total Duration | Notes |
|---------------|--------|----------|----------------|-------|
| **Breathe/bob** | 4–6 | 150–200ms | 600–1200ms | Loops forever. Subtle 1–2px vertical shift. |
| **Blink** | 3 | 80ms | 240ms | Interrupt. Eyes close → open. Random interval 4–10s. |
| **Fidget** | 4–6 | 120ms | 480–720ms | Interrupt. Creature-specific. Random interval 5–12s. |
| **Terrain shimmer** | 3–4 | 250–400ms | 750–1600ms | Sludge bubbles, water ripples, torch flicker. |
| **Walk cycle** | 4–6 | 80–120ms | 320–720ms | Plays once per tile movement. |
| **Attack** | 3–5 | 60–100ms | 180–500ms | Snappy. Faster = punchier feel. |
| **Hit reaction** | 2–3 | 100ms | 200–300ms | Quick flash/recoil. |
| **Death** | 4–6 | 120–180ms | 480–1080ms | Does NOT loop. Final frame persists. |

### Creature-Specific Idle Designs

| Creature | Base Idle | Fidget Interrupts | Personality |
|----------|-----------|-------------------|-------------|
| **Human** | Subtle breathe, weight shift side to side | Scratch head, look over shoulder, crack knuckles | Nervous, ordinary person in extraordinary city |
| **Wererat** | Low crouch breathe, nose twitch (1px) | Sniff ground, ear flick, tail lash, sudden freeze-and-listen | Twitchy, paranoid, always sniffing |
| **Robot** | Minimal bob, antenna blink (LED flicker) | Static glitch (sprite jitters 1px), steam vent puff, head swivel 90 degrees | Mechanical, precise, occasional malfunction |
| **Clown** | Exaggerated bounce (3–4px bob) | Honk (squeeze nose, visual honk particle), juggle, pratfall-almost-trip | Over-the-top, restless, performing for nobody |
| **Skeleton** | Bone rattle (slight jitter on all bones) | Jaw clack, reassemble loose arm, head tilt 45 degrees | Loose, creaky, held together by spite |

### The Two-Clock System

Idle animation needs its own render loop, **independent from the game tick:**

```
GAME TICK (turn-based):
  └── Advances when player acts
  └── Resolves movement, combat, NPC turns
  └── Updates game state

ANIMATION CLOCK (continuous):
  └── Runs via requestAnimationFrame, always
  └── Advances sprite frame counters
  └── Renders current frame of every visible entity
  └── Terrain shimmer, idle bobs, effect pulses
  └── Does NOT change game state
```

```javascript
// Animation loop — runs continuously regardless of game state
let lastAnimTime = 0;

function animationLoop(timestamp) {
    const delta = timestamp - lastAnimTime;

    // Update all visible entity animations
    for (const entity of visibleEntities) {
        entity.animTimer += delta;
        if (entity.animTimer >= entity.currentAnim.speed) {
            entity.animTimer -= entity.currentAnim.speed;
            entity.currentFrame++;
            if (entity.currentFrame >= entity.currentAnim.frames) {
                if (entity.currentAnim.loop !== false) {
                    entity.currentFrame = 0;
                } else {
                    entity.currentFrame = entity.currentAnim.frames - 1; // hold last frame
                }
            }
        }

        // Random fidget check
        entity.fidgetTimer += delta;
        if (entity.fidgetTimer > entity.nextFidgetAt) {
            entity.playFidget();  // switch to fidget anim, return to idle when done
            entity.fidgetTimer = 0;
            entity.nextFidgetAt = 3000 + Math.random() * 7000;  // 3-10s
        }
    }

    // Update terrain animations (sludge bubble, water, torches)
    for (const tile of animatedTiles) {
        tile.animTimer += delta;
        if (tile.animTimer >= tile.speed) {
            tile.animTimer -= tile.speed;
            tile.frame = (tile.frame + 1) % tile.totalFrames;
        }
    }

    renderFrame();  // redraw canvas with current animation frames
    lastAnimTime = timestamp;
    requestAnimationFrame(animationLoop);
}

requestAnimationFrame(animationLoop);
```

---

## Overlay & Layering — Draw Order

### Rendering Layers (bottom to top)

For each tile position in the 21x21 viewport, draw in this order:

```
Layer 0: TERRAIN          — Ground tile (concrete, grass, sludge pool)
Layer 1: TERRAIN EFFECTS  — Animated overlays (sludge bubbles, water shimmer, goo glow)
Layer 2: GROUND ITEMS     — Dropped loot, pickups (rendered at tile position)
Layer 3: SHADOWS          — Entity shadows (simple dark ellipse under characters)
Layer 4: ENTITIES (sorted) — NPCs and player, sorted by Y position (lower Y drawn first)
Layer 5: EQUIPMENT        — Weapon/armor overlays on entity sprite
Layer 6: STATUS EFFECTS   — Sludge coat (purple tint), goo (green glow), damage flash (white)
Layer 7: FLOATING UI      — Damage numbers, HP bars above entities, action indicators
```

### Y-Sorting for Correct Overlap

Entities at higher Y (further down screen) are drawn AFTER entities at lower Y. This means a character standing "in front of" another visually overlaps them:

```javascript
// Sort entities by Y before drawing
const sorted = visibleEntities.sort((a, b) => a.tileY - b.tileY);
for (const entity of sorted) {
    drawEntity(entity);
}
```

### Equipment Overlays on the 5-Zone Body System

Equipment renders as **layered sprites on top of the base character sprite.** Each equipment slot maps to a sprite overlay with a defined offset relative to the character's origin:

```
Character base sprite (32x32):
┌─────────────────────┐
│     ┌───┐           │
│     │TOP│ (helmet)   │  ← Overlay: equipment_top.png drawn at offset (8, 0)
│  ┌──┴───┴──┐        │
│  │  FRONT  │        │  ← Overlay: equipment_front.png drawn at offset (4, 10)
│  │ (chest) │        │
│  ├─┤     ├─┤        │
│  │S│     │S│        │  ← Overlay: equipment_sides.png drawn at offset (0, 10)
│  └─┘     └─┘        │
│     ├─────┤         │
│     │BOTTM│         │  ← Overlay: equipment_bottom.png drawn at offset (8, 22)
│     └──┬──┘         │
└─────────────────────┘
BACK: drawn BEFORE the character (behind them)
```

```javascript
function drawEntity(entity) {
    const dx = entity.screenX;
    const dy = entity.screenY;

    // Layer behind character
    if (entity.equipment.back) {
        drawSprite(entity.equipment.back.sprite, dx + BACK_OFFSET_X, dy + BACK_OFFSET_Y);
    }

    // Base character sprite (current animation frame)
    drawAnimatedSprite(entity);

    // Layers on top of character
    if (entity.equipment.bottom) drawSprite(entity.equipment.bottom.sprite, dx + BOTTOM_OFFSET_X, dy + BOTTOM_OFFSET_Y);
    if (entity.equipment.front)  drawSprite(entity.equipment.front.sprite,  dx + FRONT_OFFSET_X,  dy + FRONT_OFFSET_Y);
    if (entity.equipment.sides)  drawSprite(entity.equipment.sides.sprite,  dx + SIDES_OFFSET_X,  dy + SIDES_OFFSET_Y);
    if (entity.equipment.top)    drawSprite(entity.equipment.top.sprite,    dx + TOP_OFFSET_X,    dy + TOP_OFFSET_Y);
}
```

### Status Effect Overlays

Don't make unique sprites for every status effect. Use **compositing and tinting:**

```javascript
// Sludge coating — draw character, then overlay purple at reduced alpha
function drawSludgeCoat(entity) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.globalCompositeOperation = 'source-atop';  // only tints existing pixels
    ctx.fillStyle = '#8B00FF';  // purple
    ctx.fillRect(entity.screenX, entity.screenY, SPRITE_SIZE, SPRITE_SIZE);
    ctx.restore();
}

// Damage flash — draw entity fully white for 2 frames
function drawDamageFlash(entity) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(entity.screenX, entity.screenY, SPRITE_SIZE, SPRITE_SIZE);
    ctx.restore();
}

// Goo glow — draw a green radial gradient behind the entity
function drawGooGlow(entity) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    const gradient = ctx.createRadialGradient(
        entity.screenX + 16, entity.screenY + 16, 4,
        entity.screenX + 16, entity.screenY + 16, 24
    );
    gradient.addColorStop(0, '#00FF00');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(entity.screenX - 8, entity.screenY - 8, 48, 48);
    ctx.restore();
}
```

### Height-Based Alpha Dimming

From the existing height-visibility plan — sprites on non-active height planes are dimmed:

```javascript
function getHeightAlpha(entityHeight, cameraHeight) {
    const diff = Math.abs(entityHeight - cameraHeight);
    if (diff === 0) return 1.0;   // current plane: full brightness
    if (diff === 1) return 0.5;   // adjacent plane: half
    return 0.2;                    // distant plane: faded
}

// Apply before drawing any entity on a different height
ctx.globalAlpha = getHeightAlpha(entity.heightPlane, player.heightPlane);
drawEntity(entity);
ctx.globalAlpha = 1.0;  // reset
```

---

## Performance Notes

- **Only redraw what's visible.** 21x21 viewport = 441 tiles max. Trivial for Canvas 2D.
- **Cache sprite sheet Image objects** — load once at startup, reuse forever.
- **Don't redraw static terrain every animation frame** if nothing moved. Use a dirty-tile system or an offscreen canvas for the terrain layer, and only composite animated layers on top.
- **requestAnimationFrame throttles to 60fps** — at 441 tiles plus ~20 entities, each frame is well under 1ms to draw.
- **Sprite sheets over individual images** — one draw call per entity vs. one HTTP request per sprite. The sheet is the optimization.

---

## Open Questions (For Gate 2)

- **Sprite size decision:** Stay at 24px (current tiles) or move to 32px? At 32px, equipment overlays become readable. At 24px, they're impressionistic blobs. The ABC matrix Category 8 leans toward 32px.
- **Directional sprites:** Do creatures face left/right? Four directions? Pixel Dungeon only uses left (mirrored for right). Violencetown's top-down view may need 4 directional facings.
- **Art pipeline:** Who creates the sprites? Pixel art tool recommendations: Aseprite (industry standard for animation), Piskel (free, browser-based), LibreSprite (free Aseprite fork).
- **Character sprite height:** Should character sprites be taller than one tile (e.g., 32x48 for a 32px tile grid)? Common in RPGs — character overlaps into the tile above. Requires Y-sort rendering.
- **Animation state machine:** How do animations transition? Idle → walk should blend. Attack → idle should snap. Define a simple state machine per entity.
