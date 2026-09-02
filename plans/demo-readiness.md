# Demo readiness — what a recruiter actually sees

**Opened:** 2026-09-02, when Caelan asked what would make the playable demo complete for someone
who clicks the link from his portfolio.

Four read-only audits ran in parallel (critical path, crash/first-run, touch parity, first-90-seconds
legibility). This is what they found plus what was measured directly, split into **fixed**, **his
call**, and **known and left**.

---

## 0. THE ONE THAT DOMINATES: the live site is 147 commits behind

`DEPLOYMENT.md` — Cloudflare Pages watches **`main`**. `main` is a direct ancestor of `dev`, 147
commits back. These modules **do not exist** in the deployed build:

```
game/offer.js   game/perception.js   game/item-uses.js
game/theft.js   game/disposition-curves.js   game/item-registry.js
```

3,849 insertions across 29 game files. So the live demo has none of: the unified offer screen, the
vision cones and rear blind spot, Thieve, the fence, contextual item use, the threat overlay, the
bump telegraph, walk-home, or the modifier-key fix. Both builds still report `0.20.0`, so nothing on
the page reveals it.

**Shipping is a fast-forward.** Nothing else on this page is worth as much.

---

## 1. Fixed

| what | why it mattered |
|---|---|
| **The game was muted by default** | `settings.js` shipped `muted: true` "until audio/music is intentionally worked on". It has been — procedural SFX for every action, an ambient bed per zone — and no first-time player ever heard any of it. Ninety seconds of silence from a game whose README sells its audio. |
| **"Drive out of Violencetown."** | `fix_car.onComplete` told the player to go, with no hint that driving without alcohol triggers a red-flash, screen-shake, take-damage crash cutscene. The warning existed — but only if you bumped the car a *second* time, after being told to just drive. It now says the engine is running too hot to make the ramp. |
| **`[E]` was documented wrong in two places** | E became **facing-only** on 2026-09-02; `index.html` and `README.md` both still described the old "any adjacent shopkeeper" sweep. A player walking up to the first NPC from the wrong angle got "Nothing here worth examining." |
| **The splash told phones to press Space** | Static text, never adapted. Now carries a `.help-touch` companion. |
| **A corrupt save blanked the screen** | `continueGame` dismissed the splash and showed the wrapper *before* awaiting `loadInto`, with no try/catch — so a throw left a blank screen and a console-only error. Now falls back to a fresh run and says so; the broken save is left on disk rather than overwritten. |
| **`migrate()` only validated one level deep** | A single `null` in `world.{enemies,groundItems,containers,tileDiffs}` threw during load (`Enemy.fromSave` destructures its argument). A corrupted per-NPC `robbed` entry survived `||=` and threw on the next theft. Both now swept. |
| **`maxHp: 0` loaded fine and drew nothing** | Finite, so it passed validation; `hp/maxHp` then went `NaN`, and a canvas `fillRect` with a NaN width draws *nothing* rather than throwing — a missing health bar with a clean console. Floored at 1 in both `save.js` and `Enemy.fromSave`. |
| **The README's first visual was a placeholder** | "📸 _Gameplay screenshot / GIF goes here._" was the first thing under the pitch. |

---

## 2. His call

### 2.1 Every tap target is ~0.62× its designed size on a phone — MEASURED

The canvas is a fixed **608** logical square (`layout.js`), CSS-scaled to the viewport. Measured on a
real 375×812 viewport: the canvas renders at **375 CSS px**, a scale of **0.617**.

| target | logical | real px on a 375-wide phone |
|---|---|---|
| XMB item stepper | 14 | **9** |
| offer tray slot | 36 | 22 |
| offer row / commit button | 40 | 25 |
| hotbar cell | 42 | 26 |

Apple's minimum is 44. **Nothing clears it.** `main.js`'s own hotbar comment claims the 42px cell
plus `HIT_SLOP` gives "54×54, clearing Apple's 44pt minimum" — true only at 1:1, which no phone is.

This is not a bug to patch, it is a design decision: a blanket `HIT_SLOP` increase would make
edge-to-edge rows ambiguous (the offer rows are deliberately zero-slop so they cannot overlap). The
real options are (a) fewer logical pixels on narrow viewports, (b) a touch-specific layout with
bigger controls, or (c) accept it and treat phone as a secondary target. **Not guessed at.**

### 2.2 "End of Chapter One" does not exist

`_endChapterOne()` is defined at `main.js:4936` and **called from nowhere**. The bridge runs
`_playBridgeCutscene()` into Chapter Two instead — no alcohol crashes you into the Canyon, alcohol
ramps you to Downtown. Commit `a83cdd4` says the replacement was deliberate.

So there is no clean stopping point. For a portfolio demo that is a real question: a visitor who
finishes the car arc is dropped into Chapter Two content rather than given a curtain. Either delete
the orphaned ending, or give the demo an explicit endpoint. **A product call, not a bug fix.**

### 2.3 Unmuting by default

The one change here you might want to reverse — it is a single line in `settings.js`. A silent demo
undersells the audio; an unexpected noise on someone's laptop is its own risk. Web Audio needs a
gesture and the splash button is that gesture, so nothing plays unprompted.

---

## 3. Known and left

- **Quest-ordering bug**: picking up the converter *before* ever examining the car collapses three
  stages at once and runs the sewer set-piece while the map is TOWN — spawning rats in town and
  blocking a few tiles. Self-resolving (bumping the car still completes the quest) but visibly
  broken. Guard `escape_sewer.onEnter` on zone name. Narrow enough that it is not demo-blocking.
- **Reticle aiming has no touch control** — any tap outside the wheel hub commits immediately, so
  AoE placement and picking among several targets are keyboard-only. Single-target throws still work
  via the target list, so nothing is blocked, only optimised.
- **Thieve has no direct-tap path** and its auto-aim only considers hostiles, so a touch player robs
  whoever they happen to face.
- **Pause has no touch entry point** (`KeyP` only). Turn-based, so low cost.
- **Touch cannot turn in place.** Worth noting the rear blind spot is unaffected — `perception.js`
  keys facing off the *watcher's* last move, never the player's.
- **`npc.js` double-brackets four log lines** by wrapping `entity.name` (already `[Type]`) in
  brackets again. House-wide in that file, cosmetic, and the copy is being replaced anyway.
