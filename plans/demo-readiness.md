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

### 2.3 Autoplay — RULED, and reverted

Flipped to `muted: false` on the grounds that a silent demo undersells the procedural audio.
**Overruled by Caelan the same day:** sound firing the instant someone clicks GAME START *"is too
janky to be auto-playing on click."* Reverted; it ships muted.

Worth recording, because the wrong answer here is seductive. Web Audio genuinely does require a user
gesture, and the splash button genuinely is one — so unmuting is *technically* well-behaved and the
code has a tidy justification for it. It is still the wrong default. A stranger opening a link on a
work laptop, in an open office, next to someone else, should **choose** to make noise rather than
find out they already are.

Note also what caused the flip: the old comment read *"default-ON until audio/music is intentionally
worked on"*, which parses as a stale TODO rather than a decision — so it invited exactly this. The
comment in `settings.js` now states the ruling and says not to flip it again without asking.

**The real problem the flip was aiming at still stands, and is different.** Nobody discovers the
audio exists. That is a *discoverability* problem and wants a visible sound control — one line on the
splash, or a speaker glyph in the HUD — not autoplay.

---

### 2.4 The depth was invisible — ADDRESSED

The audit's headline: a stranger giving this ninety seconds would never learn that trading, stealth,
theft, the fence or contextual item use existed. Onboarding was one overlay listing seven controls in
a single breath, a quest HUD that says where to GO but never what a verb IS, and two one-shot lines.

`game/hints.js` is the answer, and deliberately **not a tutorial mode** — nothing gated, nothing to
skip. One table, one row per lesson, each firing the first time the player is already standing in the
situation it describes, because the situation IS the lesson. Same shape as `item-uses.js`.

Five lessons: a vendor beside you, standing unseen beside someone, carrying something that works on
what you face, holding goods the street has heard about, and being badly hurt.

**Paced, not queued.** Play showed two systems taught on two consecutive steps, which reads as the
game talking over itself. There is an 8-turn gap now — a gap, not a cap.

`hintsSeen` is a comma-joined id list rather than a boolean per hint, so a new lesson stays a
one-file change. The old `blindSpotHintSeen` migrates, so a player mid-run is not re-taught.

### 2.5 A deploy takes up to FOUR HOURS to reach a returning visitor

Found while verifying the second ship. The origin serves the new build immediately — verified
byte-for-byte — but a browser that loaded the site earlier keeps running the old one.

Cloudflare Pages sends this on every JS module:

```
Cache-Control: public, max-age=14400, must-revalidate
```

`index.html` is `DYNAMIC` (never cached), so the document is always fresh — but it references
`main.js` at an unchanging URL, and the browser serves that from its own HTTP cache for **four hours**
without asking. `must-revalidate` only bites once the entry has already gone stale.

Measured, not inferred: after pushing, a cache-busted navigation still ran the previous deploy —
`hints.js` was absent from the page's module graph and `Settings.DEFAULTS.hintsSeen` did not exist —
while `fetch(…, {cache:'reload'})` against the same origin returned the new file.

**It is not the service worker**, which is the obvious suspect and is innocent. `sw.js` is
deliberately network-first and says so in its own header. Its stale `violencetown-v6` cache name
(unbumped since v0.15.0, five releases ago) is only the offline fallback bucket.

**Who it hits:** a brand-new visitor with no cache gets the fresh build. Anyone who looked within the
last four hours — Caelan checking his own deploy, or a recruiter who opens the link twice — does not.

**The fix** is a Cloudflare Pages `_headers` file at the served root. ETags are already present, so
revalidating costs a 304 rather than a re-download:

```
/*.js
  Cache-Control: public, max-age=0, must-revalidate
```

Not applied — it changes production caching, which is Caelan's call.

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
