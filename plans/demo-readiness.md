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

#
#
 
2
.
4
 
T
h
e
 
d
e
p
t
h
 
w
a
s
 
i
n
v
i
s
i
b
l
e
 
—
 
A
D
D
R
E
S
S
E
D




T
h
e
 
a
u
d
i
t
'
s
 
h
e
a
d
l
i
n
e
:
 
a
 
s
t
r
a
n
g
e
r
 
g
i
v
i
n
g
 
t
h
i
s
 
n
i
n
e
t
y
 
s
e
c
o
n
d
s
 
w
o
u
l
d
 
n
e
v
e
r
 
l
e
a
r
n
 
t
h
a
t
 
t
r
a
d
i
n
g
,
 
s
t
e
a
l
t
h
,


t
h
e
f
t
,
 
t
h
e
 
f
e
n
c
e
 
o
r
 
c
o
n
t
e
x
t
u
a
l
 
i
t
e
m
 
u
s
e
 
e
x
i
s
t
e
d
.
 
O
n
b
o
a
r
d
i
n
g
 
w
a
s
 
o
n
e
 
o
v
e
r
l
a
y
 
l
i
s
t
i
n
g
 
s
e
v
e
n
 
c
o
n
t
r
o
l
s
 
i
n


a
 
s
i
n
g
l
e
 
b
r
e
a
t
h
,
 
a
 
q
u
e
s
t
 
H
U
D
 
t
h
a
t
 
s
a
y
s
 
w
h
e
r
e
 
t
o
 
G
O
 
b
u
t
 
n
e
v
e
r
 
w
h
a
t
 
a
 
v
e
r
b
 
I
S
,
 
a
n
d
 
t
w
o
 
o
n
e
-
s
h
o
t
 
l
i
n
e
s
.




`
g
a
m
e
/
h
i
n
t
s
.
j
s
`
 
i
s
 
t
h
e
 
a
n
s
w
e
r
,
 
a
n
d
 
d
e
l
i
b
e
r
a
t
e
l
y
 
*
*
n
o
t
 
a
 
t
u
t
o
r
i
a
l
 
m
o
d
e
*
*
 
—
 
n
o
 
g
a
t
e
d
 
o
p
e
n
i
n
g
,
 
n
o
t
h
i
n
g


t
o
 
s
k
i
p
.
 
O
n
e
 
t
a
b
l
e
,
 
o
n
e
 
r
o
w
 
p
e
r
 
l
e
s
s
o
n
,
 
e
a
c
h
 
f
i
r
i
n
g
 
t
h
e
 
f
i
r
s
t
 
t
i
m
e
 
t
h
e
 
p
l
a
y
e
r
 
i
s
 
a
l
r
e
a
d
y
 
s
t
a
n
d
i
n
g
 
i
n


t
h
e
 
s
i
t
u
a
t
i
o
n
 
i
t
 
d
e
s
c
r
i
b
e
s
,
 
b
e
c
a
u
s
e
 
t
h
e
 
s
i
t
u
a
t
i
o
n
 
I
S
 
t
h
e
 
l
e
s
s
o
n
.
 
S
a
m
e
 
s
h
a
p
e
 
a
s
 
`
i
t
e
m
-
u
s
e
s
.
j
s
`
:
 
a
d
d
i
n
g


a
 
l
e
s
s
o
n
 
i
s
 
a
 
r
o
w
.




F
i
v
e
 
l
e
s
s
o
n
s
:
 
a
 
v
e
n
d
o
r
 
b
e
s
i
d
e
 
y
o
u
,
 
s
t
a
n
d
i
n
g
 
u
n
s
e
e
n
 
b
e
s
i
d
e
 
s
o
m
e
o
n
e
,
 
c
a
r
r
y
i
n
g
 
s
o
m
e
t
h
i
n
g
 
t
h
a
t
 
w
o
r
k
s
 
o
n


w
h
a
t
 
y
o
u
 
f
a
c
e
,
 
h
o
l
d
i
n
g
 
g
o
o
d
s
 
t
h
e
 
s
t
r
e
e
t
 
h
a
s
 
h
e
a
r
d
 
a
b
o
u
t
,
 
a
n
d
 
b
e
i
n
g
 
b
a
d
l
y
 
h
u
r
t
.




*
*
P
a
c
e
d
,
 
n
o
t
 
q
u
e
u
e
d
.
*
*
 
P
l
a
y
 
t
e
s
t
i
n
g
 
s
h
o
w
e
d
 
t
w
o
 
s
y
s
t
e
m
s
 
b
e
i
n
g
 
t
a
u
g
h
t
 
o
n
 
t
w
o
 
c
o
n
s
e
c
u
t
i
v
e
 
s
t
e
p
s
,
 
w
h
i
c
h


r
e
a
d
s
 
a
s
 
t
h
e
 
g
a
m
e
 
t
a
l
k
i
n
g
 
o
v
e
r
 
i
t
s
e
l
f
.
 
T
h
e
r
e
 
i
s
 
a
n
 
8
-
t
u
r
n
 
g
a
p
 
n
o
w
 
—
 
a
 
g
a
p
,
 
n
o
t
 
a
 
c
a
p
:
 
e
v
e
r
y
t
h
i
n
g


s
t
i
l
l
 
g
e
t
s
 
t
a
u
g
h
t
,
 
n
e
v
e
r
 
b
a
c
k
 
t
o
 
b
a
c
k
.




`
h
i
n
t
s
S
e
e
n
`
 
i
s
 
a
 
c
o
m
m
a
-
j
o
i
n
e
d
 
i
d
 
l
i
s
t
 
r
a
t
h
e
r
 
t
h
a
n
 
a
 
b
o
o
l
e
a
n
 
p
e
r
 
h
i
n
t
,
 
s
o
 
a
 
n
e
w
 
l
e
s
s
o
n
 
s
t
a
y
s
 
a


o
n
e
-
f
i
l
e
 
c
h
a
n
g
e
.
 
T
h
e
 
o
l
d
 
`
b
l
i
n
d
S
p
o
t
H
i
n
t
S
e
e
n
`
 
f
l
a
g
 
m
i
g
r
a
t
e
s
,
 
s
o
 
a
 
p
l
a
y
e
r
 
m
i
d
-
r
u
n
 
i
s
 
n
o
t
 
r
e
-
t
a
u
g
h
t


s
o
m
e
t
h
i
n
g
 
t
h
e
y
 
a
l
r
e
a
d
y
 
k
n
o
w
.




-
-
-




#
#
 
3
.
 
K
n
o
w
n
 
a
n
d
 
l
e
f
t

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
