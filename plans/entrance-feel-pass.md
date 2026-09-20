# The fight entrance — the feel pass

Status: **planned, not built.** Base: `dev` @ `5867818`.
Research is done (two independent audits, below). This document is the design gate and the
execution plan. Caelan makes the merge call.

---

## 1. Why

Caelan watched the entrance and called it "jittery". He was right, and it is not one defect but
**three independent ones landing inside the same 360 ms**. Two adversarial audits ran against the
code and the maths; every number below was computed or measured, not estimated.

What was **confirmed**:

| | Defect | Evidence |
| --- | --- | --- |
| **D1** | **Pixel crawl.** The punch-zoom snapshots the finished frame and re-scales that raster by a continuously-varying non-integer factor with nearest-neighbour sampling (`renderer.js:838-839`). | 15.0% of screen columns change width **every frame** (26.3% worst) at 3440×1440. At the art-pixel level ~30% of 860 art columns re-shuffle per frame for 360 ms. Measured in-browser: for a **0.82 px** move, 3.03% of the screen makes a *clearly visible* colour jump vs 1.01% with smoothing. |
| **D2** | **The punch is invisible.** `ZOOM_IN_MS`(80) < `IMPACT_MS`(110) and the bw/redblack cards are opaque, so the whole zoom-**in** happens behind a curtain. | The world first appears at zoom **1.1592**; the peak is **1.16**. You only ever see it zoom *out*. Compounding it, `easeOut` puts **50% of the lift in frame 1** and 80% in two — even unhidden it is a step, not a push. |
| **D3** | **A hard cut.** `search`'s flash tapers (`globalAlpha = 1 - t`, `renderer.js:848`); `bw`/`redblack` are a bare opaque `fillRect` (`renderer.js:856`) that vanishes in one frame. | Measured full-screen luminance across adjacent frames: `struck` **0.7892 -> 0.3274 = 2.41x** drop, instantaneous. |

What was **refuted / corrected** — recorded so nobody re-raises it:

- **The easing seam at `ms=80` is clean.** Claude's first hypothesis. `easeOut`->`easeInOut` is
  C1-continuous; value and velocity match to ~1e-12. **Not a defect.**
- **`tileJitter` is innocent.** Deterministic hash of (x,y), no `Math.random` anywhere in the
  entrance or fog path. The fog edge does not shimmer.
- **The fog roll is the best-tuned part of the animation.** No frame introduces more than 6.7% of
  the fog's total alpha; peak/mean never exceeds 2.35x; scatter is 2.1-2.6 order-bands. No banding,
  no pop. **Change nothing here.**
- **D3's magnitude was overstated** by the audit as ~8:1. Measured, it is **2.41:1** — the audit
  compared the card against the *settled* fogged scene, but at 110 ms the fog has barely begun
  rolling. Still a genuine single-frame jolt; less extreme than claimed.
- **One proposed fix is a placebo.** Rounding the destination rect to integers moves crawl
  15.0% -> 13.9% — noise. It fixes the sub-pixel origin but leaves the scale ratio non-integer, so
  the block-size shuffle survives. **Do not ship it and call it fixed.** It is the fix that looks
  most obviously correct and is not.
- **Zooming the world transform instead is wrong here.** It would make every sprite blit
  non-integer, so sprites crawl independently and tile seams open — and it cannot reach the HUD,
  which the entrance is specified to cover. The snapshot approach is right; the *sampling* is wrong.

---

## 2. The four changes

### C1 — smoothing on during the zoom · `renderer.js:838` · **one line**

`ctx.imageSmoothingEnabled = false` -> `true` while `at.zoom > 1`. Restore `false` afterwards so
nothing else inherits it.

This is the standard modern pixel-art answer for a continuous hit-zoom. The source is *already*
4x upscaled, so bilinear only softens the seam between existing blocks — it does not turn 16x16 art
mushy. Over 360 ms of fast motion it reads as motion blur. Preserves the authored 1.08/1.16 curve
exactly. **Measured effect: visible pixel jumps 3.03% -> 1.01%.**

Rejected alternative: quantising zoom to whole backing-pixel ratios gets crawl to 2.3%, but forces
the peak to 1.25 and collapses `struck` and `spotted` into the same step at Caelan's resolution.
That is a design change, not a bug fix — **parked, not chosen.**

### C2 — taper the bw/redblack card off · `renderer.js:856` · **one line**

Mirror what `flash` already does 8 lines above. Ramp `globalAlpha` over the last ~35% of the card:

    ctx.globalAlpha = 1 - clamp01((t - 0.65) / 0.35);

`t` is already normalised (`impactT`), so this **auto-scales if `IMPACT_MS` changes** — which is why
C2 and C4 compose without coordination. Reset `globalAlpha = 1` after the fills.

**Note the interaction:** a card that fades out is translucent while the zoom is still running, so
C2 may reveal part of the punch on its own and reduce how far C4 has to go. Evaluate C4's numbers
*after* seeing C1+C2+C3 together.

### C3 — `ZOOM_OUT_MS` 280 -> 160 · `fight-entrance.js:12` · **one constant**

Cuts the window in which the HUD and VT323 text ride the rescale from ~15 frames to ~3, and removes
the 2-3 tail frames that move the screen edge **less than one backing pixel** — pure cost, zero
visible motion. Settle completes at 240 ms instead of 360 ms, still inside the 200-300 ms band where
a beat reads as deliberate.

### C4 — make the punch visible · `fight-entrance.js:10-11` · **CORRECTED**

> **The audit's proposed numbers do not work.** It suggested `IMPACT_MS` 110->150 with
> `ZOOM_IN_MS` 80->130. That keeps `IMPACT_MS > ZOOM_IN_MS`, so the card still lifts **20 ms after
> the push is already over** and the punch stays invisible. The inequality is backwards.

**The requirement is `IMPACT_MS < ZOOM_IN_MS`.** The card must lift *while* the zoom is still
pushing. Candidates:

| `IMPACT_MS` | `ZOOM_IN_MS` | push you actually see |
| --- | --- | --- |
| 110 | 180 | 70 ms (4.2 frames) |
| 90 | 200 | 110 ms (6.6 frames) |

Also re-shape the front-loading: `easeOut` over the in-phase puts 50% of the lift in frame 1. With a
longer `ZOOM_IN_MS` that matters less, but consider `easeInOut` for the in-phase so the push has a
ramp rather than a step. **This is the one change with a genuine feel trade-off — Caelan's call on
the final numbers, set with eyes on it.**

---

## 3. Execution — two Sonnet agents, file-disjoint

The changes fall into exactly two non-overlapping file groups. That is the whole reason this
parallelises; CLAUDE.md's rule is *parallelise only FILE-DISJOINT work*.

| | **Agent A — rasterisation & the cut** | **Agent B — the timeline** |
| --- | --- | --- |
| Does | **C1**, **C2** | **C3**, **C4** |
| **Owns (may edit)** | `game/renderer.js`, `tests/fight-fog-render.test.js` | `game/fight-entrance.js`, `tests/fight-entrance.test.js` |
| **Must not touch** | `game/fight-entrance.js`, `tests/fight-entrance.test.js` | `game/renderer.js`, `tests/fight-fog-render.test.js` |
| Branch | `feature/entrance-raster` | `feature/entrance-timing` |

Both are **Sonnet**. Both are small, well-specified changes against code that is already fully
diagnosed — no exploration required, which is exactly the shape Sonnet handles well.

### Three hard constraints on the agents

1. **Worktrees must be cut from `dev`, not from the default branch.** `isolation: 'worktree'` forks
   from the **default** branch (`main` @ `9f4158f`), which is *behind* `dev` @ `5867818` by the
   hit-splat merge **and** the effects-loop fix. An agent forked from `main` would edit a stale
   `renderer.js` and conflict on merge. **Claude creates both worktrees explicitly**
   (`git worktree add -b <branch> <path> dev`) and hands each agent its path.
2. **No agent may use the browser.** There is one Browser pane and it cannot be shared. Agents
   verify with `node --test` and by reading code. **All visual verification is Claude's**, at
   integration.
3. **No agent merges anything.** Each finishes on its own pushed branch and stops. Integration and
   the merge call are Caelan's, per standing preference.

### Per-agent verification gate (both must clear before reporting done)

- `npm test` — baseline on `dev` @ `5867818` is **1621 tests / 287 suites / 0 failures**.
  (An earlier draft said 1611/286 — that was measured at `a6ae14d`, before the effects-loop fix
  added `tests/effect-loop.test.js` and the viewport guards. **Re-measure; never quote.**)
- `npm run -s balance:check` — must say *balance golden matches*.
- `git grep -iE 'violence[ _-]+town' -- ':!CLAUDE.md' ':!plans/item-hotbar-xmb-implementation.md'`
  — must return zero lines.
- Show the command output. A claim without output does not count.

---

## 4. Integration — Claude, with the browser

Agents cannot see. This step is where the work is actually judged.

1. Merge both branches into `feature/entrance-feel-pass`. Re-run all three gates. **A merge is done
   when the game RUNS** — load it, check the console, confirm a fight still starts.
2. **Capture before/after at identical instants.** Stage a real fight, pin `_fightStart.at` to an
   exact offset, render, and diff. The deterministic-instant method is already proven and beats a
   screen recording, which cannot hold a 40 ms beat still.
3. **Re-run the crawl measurement** from §1 D1 (hold the source still, vary only the zoom, one 60 Hz
   step at the peak) and confirm visible-jump % actually fell. This is the number that says C1
   worked; *do not* substitute "it looks smoother".
4. **Re-measure the D3 luminance step** across the card lift and confirm the 2.41x is gone.
5. **Confirm the punch is now visible** — render the frames between `IMPACT_MS` and `ZOOM_IN_MS` and
   check the zoom is still rising when the world appears.
6. Set C4's final constants **with Caelan looking at it**. Everything else is corrective; C4 is
   taste.

---

## 5. What is deliberately NOT in this pass

Recorded so the next session does not mistake these for oversights.

- **The fog roll timing.** Measured well-tuned. Untouched.
- **Integer-quantised zoom** (crawl 2.3%, peak forced to 1.25). Parked — design change.
- **The clock read at frame end** (`renderer.js:822` re-reads `performance.now()` instead of taking
  the rAF timestamp). Real: ~6% of a frame's intended motion per 1 ms of frame-time variance.
  Correct fix threads `now` through `_render -> renderFrame -> _drawEntrance` and touches ~6 sites
  across two core files. **Its own row.** Note the effects-loop fix (`5867818`) just reworked this
  neighbourhood, so re-read `game/effect-loop.js` before starting it.
- **Coherent fog jitter** (hash on a coarser grid so scatter clusters over 2-3 tiles and reads as
  *smoke* rather than a global dim). Cosmetic, deferred.
- **`NO_REPLAY_MS` hysteresis.** A hard 3 s boundary means 2.9 s plays nothing and 3.1 s plays the
  full flash; a skirmish that flickers will feel inconsistent. Wants a recency *count*, not a
  different constant. Deferred.
- **The linear quiet fade** (`fight-entrance.js:79`) — the one genuinely mechanical curve in the
  file, on the reduce-motion path. One word (`easeInOut`). Deferred only because it is not the
  reported symptom.

---

## 6. Open items for Caelan

1. **C4's final numbers** — 110/180 or 90/200, and whether the in-phase gets `easeInOut`.
2. **`chore/dead-code-sweep` (the Escape-branch cleanup) is still unmerged** and `dev` has moved
   twice under it. It auto-merges, but CLAUDE.md warns auto-merge silently drops things — it wants a
   RUN-the-game check, not a marker count. Merge it before this pass compounds the drift, or
   explicitly park it.

---

## 7. Built and measured (2026-09-20)

Both agents delivered; merged into `feature/entrance-feel-pass`. Gates: **1624 tests / 287 suites /
0 failures**, balance clean, naming clean. Verified in the running game, at 1920x1080.

| | before | after |
| --- | --- | --- |
| **D3** `struck` card lift | **2.26x** luminance drop in one frame | **1.28x**, spread over a ~40 ms ramp |
| **D3** `spotted` card lift | 1.79x rise | 1.46x |
| **D1** visible pixel jumps, ~0.75 px move | **3.03%** of screen | **0.76%** |
| **D1** at the zoom peak (0.43 px move) | — | **0.01%** |
| **D1** mean delta when a pixel changes | 79.6 | **17.3** |
| **D2** zoom when the world appears | 1.1592 of a 1.16 peak (99.9% done) | **1.1224**, still rising |

The crawl signature inverted exactly as predicted: many more pixels now change (30-39% vs 9%) but
by small amounts instead of few pixels snapping hard. That is what smooth resampling looks like and
it is imperceptible; the old pattern was not.

**C1 confirmed live in the browser, not just in source** — instrumenting `ctx.drawImage` caught the
punch draw (destW 2223 on a 1920 canvas) executing with `imageSmoothingEnabled: true`.

**The C2 x C4 interaction predicted in §2 is real and is what makes C4 work.** C4 alone would not
have been enough: with `easeInOut` over 180 ms the zoom's peak velocity lands at ms~90, but the card
lifts at 110, so the punchiest frames are still behind it. C2's taper starts fading the card at
t=0.65 (ms 71.5), so those frames are seen *through* a translucent card. Captured frames confirm it:
at 70 ms the card is solid (z=1.019), at 90 ms the world shows through while the zoom is still
climbing (z=1.040), at 110 ms it is clear (z=1.061) and still rising toward the 1.08 `struck` peak.

**If it still reads soft, the lever is `IMPACT_MS` down toward 90 — not `ZOOM_IN_MS` up.** That
moves the card lift in front of peak velocity instead of behind it.

Both agents re-measured the test baseline rather than quoting the stale figure in this document, and
both reported it. Agent B additionally removed `easeOut`, dead after the in-phase switch, and
flagged the liberty; verified unreferenced (the remaining hits are `easeOutCubic`, unrelated).
