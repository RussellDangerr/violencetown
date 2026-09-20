# One bad frame — the non-finite gradient, and the loop it was killing

**Status (2026-09-20):** containment shipped, root cause NOT found. Read §4 before re-hunting it.

## 1. The report

An intermittent uncaught error at game start, on `dev`, pre-existing:

    Uncaught TypeError: Failed to execute 'createRadialGradient' on
    'CanvasRenderingContext2D': The provided double value is non-finite.
        at game/main.js:5315

`main.js:5315` was `this._render()` inside `_ensureParticleLoop`'s rAF callback.

## 2. What the throw actually cost — worse than "effects stop animating"

Measured, not reasoned: the same scripted check run against `dev` (a6ae14d) and against
this branch, with a render patched to throw three times.

| | `dev` | fixed |
|---|---|---|
| injected frames that got to throw | **1 of 3** | 3 of 3 |
| frames drawn afterwards | **0** | 189 |
| the splat that was mid-flight | **never pruned** | pruned |
| `_particleLoopRunning` afterwards | **stuck `true`** | settles to `false` |
| a *later* effect | **drew nothing at all** | animates normally |

The loop re-armed on the line *after* the render, so a throw skipped the re-arm **and** left
`_particleLoopRunning` set — and `_ensureParticleLoop` returns early on that flag, so nothing
could ever restart it.

The flag being stuck also gates off the 250 ms idle repaint (`main.js`, the `setInterval` that
checks `!this._particleLoopRunning`). So after one bad frame the game stops repainting *on its
own* entirely: no ambient NPC glides, no day/night ease, nothing until the next input-driven
render. One bad frame, and the town goes still for the rest of the session.

## 3. The fix

- **`game/effect-loop.js`** (new, pure, node-tested) — one tick of the effects loop. The re-arm
  decision is taken *before* the frame draws, a throwing frame is caught and reported rather than
  fatal, and the settle is announced before the last frame draws (that render runs `_trackFight`,
  which legitimately starts a fresh loop for the fight fog's fade).
- **`main.js` `_ensureParticleLoop`** delegates the fragile half to it. A throwing frame is logged
  once per loop run, not sixty times a second.
- **`main.js` `_fitCanvas`** — the guard was `box.width < 1 || box.height < 1`. NaN fails *both*
  comparisons, so an unmeasurable layout box sailed straight through into `computeViewport`.
  Now spelled `!(box.width >= 1)`, and it says so in the console when it rejects a non-finite box.
- **`viewport.js` `computeViewport`** — `dpr` already fell back when it measured badly; the CSS
  size did not, and `Math.max(1, NaN)` is `NaN`, so one bad measurement poisoned all 19 numeric
  fields. Now clamped to the same 1px floor a 0px screen gets.
- **`viewport.js` `offView`** — every comparison in it is false for NaN, so the cull waved a NaN
  offset through as "on screen" and the draw behind it threw. A tile that cannot be placed is
  now culled.

## 4. Ruled out — don't re-walk these

There are exactly six `createRadialGradient` calls in the codebase, all in `renderer.js`.

- **`:1322` ground shadow** — the only argument that matters is `rx`, from `def.shadowRx ?? 12`.
  Every `shadowRx` in `sprites.js` is a finite literal. Cannot go non-finite.
- **`:1741` heal halo** — its radius derives from `dn.text.length` and finite constants. All eight
  `_spawnHitSplat` call sites pass a template string, and `m.sx || 1` rescues a NaN anyway. Cannot
  go non-finite. (A NaN `p` from a zero `maxAge` gives `glow = NaN`, which fails `> 0` — the halo
  is skipped, not thrown.)
- **`:598` / `:640` / `:1078` / `:4420`** all reduce to three inputs: the viewport, `playerX/Y`,
  and `_scrollX/Y`. Traced each to its source: all 12 map JSONs carry finite `spawn`, `transitions`,
  `anchors` and `lights`; `map.js`'s runtime transition densification only emits loop counters;
  `DOCK` is a frozen literal; all four `_anim*` fields are initialised to 0 and always written
  together; `_animProgress || 0` eats a NaN; `snapPx` can't divide by zero.
- **Both hypotheses in the original report are wrong.** "An unsized viewport" — `_fitCanvas`
  already rejects a sub-1px box, and 1×1 and 2×2 viewports were exercised without a throw.
  "A zero-radius shadow" — a zero radius is perfectly legal; only a *non-finite* one throws.

**Empirically clean:** 145,000 gradient calls across 12 maps × 9 viewport sizes (1×1 to 5000×400)
× 3 night levels × every splat type × animating/fight states, plus 65 full page loads (40 with
real rAF, 25 with network+CPU throttling, 18 in the app's Browser pane) — every call site
instrumented, **zero non-finite arguments**.

## 5. If it fires again

The steady state is clean, so the bad value comes from a transient none of the above reproduces.
The fastest way back in: patch `CanvasRenderingContext2D.prototype.createRadialGradient` from an
inline `<script>` in `index.html`'s `<head>` (before `main.js`, which is a module and therefore
deferred), record `new Error().stack` plus `playerX/Y`, `_scrollX/Y` and the viewport whenever an
argument fails `Number.isFinite`, and persist to `localStorage` so it survives the reload.

Two things now make the next occurrence cheaper: `_fitCanvas` warns when it rejects a box that did
not measure, and the loop logs the throw instead of dying silently — so it will be visible in the
console *and* still reproducible, rather than a frozen town nobody connects to an error from
several seconds earlier.

Note `offView`'s NaN behaviour was the amplifier throughout: a garbage coordinate was never culled,
so it always reached a draw call. That is now closed at the source.
