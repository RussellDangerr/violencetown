# C3b — touch and mouse can aim attacks and turn in place

## Goal

Two things the keyboard can do that a mouse or a finger cannot, today:

1. **Aim.** Once a wheel verb enters its aim step, the keys move the reticle and
   Space fires. On pointer, any tap outside the wheel's dial closes the whole
   wheel (the dial cull runs before the aim branch), and a tap inside it fires
   at the auto-picked tile. You cannot choose which enemy to hit, or where a
   burst lands.
2. **Turn in place.** A tap on the tile beside you walks onto it. There is no
   way to face a tile without stepping, and facing matters: E acts on the faced
   tile and Thieve robs whoever you face.

## How it works

### Aiming (ruling C3R3, pick a)

"Tap to place the reticle, tap it again to fire. A tap out of range snaps to the
nearest legal tile, and the hub still cancels."

- While the wheel is aiming, the dial cull is skipped: a tap anywhere no longer
  closes the wheel.
- A tap on the hub cancels the aim (back to the wheel), as it does today.
- A tap on the dock is ignored.
- Any other tap is a world tile. If it is the reticle's tile, the action fires
  (through the same commit as Space, so the friendly-strike confirm still
  shows). Otherwise the reticle moves there.
- A tile that is not legal snaps to the nearest legal one. Legal is the same
  rule the keys use: within the verb's reach (`aimRange`), and walkable for a
  placed reticle (throw, spells, reach weapons). Adjacent verbs (Hit, Cleave,
  Trade, Run, Thieve) are legal on any tile beside you, as their arrow-key
  gesture is. Your own tile is never legal for an adjacent verb; a tap on it
  does nothing.
- Picking between targets is just this: tap the one you want, then tap it again.
- "Nearest" is the closest legal tile to the tapped one by straight-line
  distance, ties broken in reading order. If no tile is legal, the reticle stays.
- The pure helpers live in `wheel-model.js`: `isLegalAimTile`, `clampReticle`
  and `aimTap`. `main.js` only turns the point into a tile and acts on the
  answer.

### Turning in place (ruling C3R2, pick a)

"Long-press an empty tile next to you. You face it and don't move."

- "Next to you" is the four tiles up, down, left and right: facing has only those
  four directions. Diagonal tiles behave as they do today.
- "Empty" is a tile with nothing to target on it. A long-press on a person or
  thing still opens its Target List, untouched.
- To tell a long-press from a tap, the step onto an adjacent empty tile now
  happens when the press is released rather than when it lands. A release before
  the long-press time walks one step, as today. Holding to the long-press time
  turns you to face the tile instead, with no step and no turn spent (the same
  free pivot the arrow keys give).
- Dragging off the press drops the turn but still walks on release. A cancelled
  pointer drops both.
- An adjacent wall or other unwalkable empty tile can be faced the same way; a
  quick tap on it still does nothing.
- The long-press time is the one the Target List already uses (450 ms), so the
  two long-presses feel the same. No new number.
- The pure helper `adjacentFacing(px, py, tile)` in `wheel-model.js` names the
  facing, or null when the tile is not one of the four.

## Acceptance

- On pointer you can place an area attack and pick between targets: tap places
  the reticle, tapping it again fires, an out-of-range tap snaps to the nearest
  legal tile, and the hub cancels.
- On pointer you can turn to face a tile without stepping (long-press an empty
  tile beside you).
- One-tap walking still works, including onto the tile beside you.
- A GIF at 3440x1440 of aiming and turning with the mouse.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Tests

`tests/pointer-aim.test.js`: the pure helpers (legality, snapping, tie order,
fire-vs-place, the facing helper) and source checks that `main.js` skips the
cull while aiming, routes aim taps through `aimTap`, and defers the adjacent
step to release.

## Out of scope

- The friendly-strike confirm keeps its current pointer behaviour (hub cancels,
  a tap inside the dial commits, a tap outside closes).
- The aim hint strip's wording, and drawing the hub during aiming (the hub is
  not drawn while aiming; it is where the open wheel's hub sits). Both live in
  the renderer.
- Gamepad aiming.
- The keyboard's aim and turn grammar, unchanged.
