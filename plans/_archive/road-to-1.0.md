# Violencetown — Road to 1.0
**Date:** 2026-06-08
**Status:** ACTIVE — the shipping plan. Supersedes the big roadmap *as the near-term priority* (does not delete it).
**Gate vocabulary:** mirrors [GAME_STUDIO_PLAN.md](../GAME_STUDIO_PLAN.md) — Research → Design → Development → Polish.

> **The one-line reframe:** Violencetown 1.0 is **the existing car-fix arc, finished**. A complete, ending-having, polished *short* game, shipped **web-first**. Not five zones. Not creature-hopping. Not Godot. Not app stores. One tight arc that **just works**, start to a real ending, in the browser.

---

## 1. Reframed Goal — What 1.0 Is (and Isn't)

The adventure plans describe an ambitious JRPG: five zones, a hero's-journey arc, a party system, cryptids and factions, eventually Godot and app stores. **That is the dream, and it stays the dream — as post-1.0 work.** Trying to ship all of it is the [single most common way indie projects die](../GAME_STUDIO_PLAN.md) (scope creep is the #1 killer in every post-mortem). So we cut hard.

### 1.0 IS
- The **car-fix arc that already exists in the code**, finished end-to-end: opening → sewer escape → fix the car → **a real ending**.
- **Web-first.** Playable in a browser tab. itch.io + Cloudflare Pages. No install, no account, no store.
- **Polished and solid.** It never soft-locks, never crashes on the critical path, has sound, has an options menu, saves reliably.
- A thing the dev **actually shipped** — real, finished, public.

### 1.0 IS NOT (all deferred to post-1.0)
| Deferred | Where it lives now | Why it waits |
|----------|--------------------|--------------|
| 5 zones (Sewer/Circus/Factory/Graveyard/Street-return) | `adventure-transition-plan.md`, `game-zones.md` | Each zone is weeks of authored content. Ship one arc first. |
| Creature-hopping / party system | `adventure-transition-plan.md`, `abc-decision-matrix.md` | Whole new system. Not on the critical path. |
| Cryptids, factions, reputation | `game-zones.md` | Content + systems for a game 5× this size. |
| Godot port | (discussed) | Re-platforming a game that isn't finished is building an engine, not a game. |
| App-store release (iOS/Android/Steam) | — | **Optional later chapter.** See §1.1. |
| "Series of short adventures" | (vision) | 1.0 is *one* short adventure done well. The series is what comes after proving we can finish one. |

### 1.1 Success Criteria — and What "Winning" Means Here
**Money is explicitly NOT a success criterion.** The wins for 1.0 are:
1. **Ship something real** — a finished, public, playable game with the dev's name on it. The thing most projects never do.
2. **Creative control** — no platform holder, no gatekeeper, no revenue cut dictating the work. The dev owns it end to end.
3. **Understanding the product & the landscape** — going through the full ship cycle once (build → polish → publish → watch people play) is worth more than any single feature.

**On app stores (the optional later chapter).** App stores are the *opposite* of the creative control the dev values: review queues, content gatekeeping, 30% cuts, platform rules that can change under you. **Web and itch.io take nothing and gate nothing** — you publish when you decide it's ready, and it's live. So 1.0 ships to the web, full stop. A store release is a *possible* post-1.0 chapter to be opened deliberately, with eyes open about the trade-off — never a 1.0 requirement.

---

## 2. Priority #1 — The "It Just Works" Foundation

> **One early bug makes the player brace for breakage for the entire session.** Trust is lost in the first 60 seconds and never fully recovered.

This is the **top priority, above all features.** A player who hits a soft-lock, a wrong-win, a consumed-instead-of-thrown item, or a dead-stalled quest in the first few minutes stops trusting the game. From then on every odd moment reads as "is it broken again?" — and they quit. No amount of audio, juice, or content buys that trust back.

Concretely, "it just works" means: **the critical path (start → play → real ending) cannot soft-lock, cannot wrong-win, and cannot crash — for any reasonable play order.** Everything in §4 and the `fix/critical-path` branch exists to make that sentence true. We stabilize first, then add sound and polish on top of a foundation we trust.

---

## 3. Checklist — What Polished Small Commercial Games Have in Common

The 15-point bar, each with a one-line **gap analysis** of where Violencetown stands today.

1. **The critical path is bug-free and cannot soft-lock (start → play → real ending, no stuck states).**
   — *GAP: FAILING.* Quest dead-stalls on fragile ordering; examine-before-start and early-converter both soft-lock with no recovery. Top priority of `fix/critical-path`.
2. **It has an actual ending (a clear win/credits state, not "ran out of content").**
   — *GAP: FAILING.* Completing `fix_car` shows nothing and unlocks nothing (`deliveryUnlocked` is never read). No win/credits state exists. `fix/critical-path`.
3. **Saving is reliable and obvious (never corrupts, never silently loses progress).**
   — *GAP: PARTIAL.* localStorage save exists, but in-session map re-entry resets world state while the save preserves it (looted chests refill, killed enemies respawn) — progress silently desyncs. Stabilize on `fix/critical-path`; deeper fix deferred (§4).
4. **The first 60 seconds teach controls + goal through play, not a text wall, and deliver one satisfying moment.**
   — *GAP: PARTIAL.* There's an opening set-piece (Borgir, the sewer escape) but no deliberate onboarding pass and the satisfying beat isn't guaranteed. Onboarding is a Polish-gate task (§6).
5. **Core actions have "juice" (immediate visual + audio feedback on every meaningful input).**
   — *GAP: PARTIAL.* Some visual feedback exists; **zero audio.** Juice/audio pass scheduled — `feat/audio` + Polish gate.
6. **There is sound (looping music + SFX on core actions); silence reads as unfinished.**
   — *GAP: FAILING.* No audio at all. `feat/audio`.
7. **Scope is ruthlessly cut to a tight, complete arc (few features, all finished).**
   — *GAP: ADDRESSED BY THIS DOC.* §1 cuts to the single car-fix arc and defers everything else.
8. **Controls are clear (WASD + arrows), ideally remappable; the game can pause anytime.**
   — *GAP: PARTIAL.* WASD + arrows work; not remappable; no explicit pause. Remap + pause land in `feat/options-accessibility`.
9. **Edge cases fail gracefully (resize, tab-out, refresh, weird input, dead-ends).**
   — *GAP: FAILING.* Auto-repeat walking ignores transitions/pickups/car/barricade/hazards; death deletes the quest converter and can respawn onto a barricade. `fix/critical-path`.
10. **State is never communicated by color alone (pair with icon/shape/text).**
    — *GAP: PARTIAL.* HP/MP/GP bars lean on color. Audit + icon/label pass in `feat/options-accessibility`.
11. **The store/landing page leads with gameplay (animated GIF + gameplay-first screenshots + short trailer).**
    — *GAP: NOT STARTED.* No itch.io page yet. Landing-page asset capture is a Polish/ship-prep task once the build is stable.
12. **Capsule/cover art is readable at thumbnail size (0–3 words).**
    — *GAP: NOT STARTED.* No capsule art. Ship-prep task; "VIOLENCETOWN" splash exists as a starting point.
13. **A free demo / in-browser playable exists (strongest trust + wishlist driver).**
    — *GAP: STRENGTH.* The whole game *is* the in-browser playable — this is the format we're shipping. Biggest structural advantage we have.
14. **Priced honestly for length, with realistic (modest) sales expectations.**
    — *GAP: N/A for 1.0.* Web-first / itch.io, money is not a success criterion (§1.1). Likely free or name-your-price. Revisit only if a store chapter opens.
15. **An options menu exists (volume, fullscreen, controls) — its absence signals unfinished.**
    — *GAP: FAILING.* No options menu. `feat/options-accessibility`.

---

## 4. Bug / Stability Triage (from the static audit)

Severity scale: **CRITICAL** = breaks the critical path / soft-lock / wrong-win / data loss · **HIGH** = bad UX or trust damage on the happy path · **MED** = rough edge · **DEFERRED** = real but post-stabilization.

### Critical path — fixed in `fix/critical-path`

| # | Severity | Issue | Branch |
|---|----------|-------|--------|
| 1 | **CRITICAL (headline)** | **Main quest dead-stalls from fragile ordering.** The quest starts *only* on Borgir-adjacency; examining the car **before** the quest starts, **or** grabbing the converter **before** its stage, both soft-lock with no recovery path. The intended start→play→ending spine is gated behind an exact, undocumented action order. | `fix/critical-path` |
| 2 | **CRITICAL** | **Throw on a healing item heals & consumes it instead of throwing it.** Picking "throw" on a heal item silently fires the use/heal path — the item is gone and was never thrown. Wrong action, no undo. | `fix/critical-path` |
| 3 | **CRITICAL** | **`fix_car` has no ending and unlocks nothing.** Completing the main quest produces no win/credits state; `deliveryUnlocked` is set but **never read** anywhere. The game has no defined "you won." | `fix/critical-path` |
| 4 | **CRITICAL** | **Legacy tile-7 "BOSS ROOM REACHED" wrong-win still in the sewer.** A dead remnant win-trigger fires on a specific tile, ending/branching the run incorrectly. | `fix/critical-path` |
| 5 | **CRITICAL** | **Death deletes the quest converter; respawn can land on a barricade tile mid-escape.** Dying during the escape can destroy a required quest item and/or drop the player onto an impassable barricade — soft-lock by death. | `fix/critical-path` |
| 6 | **HIGH** | **Auto-repeat walking ignores transitions / pickups / car / barricade / hazards.** Held-key movement skips the per-tile interaction checks, so the player can blow through a zone transition, walk over a pickup, or into a hazard/barricade without the game reacting. Edge-case failure (checklist #9). | `fix/critical-path` |
| 7 | **HIGH** | **Inventory has 10 slots but the hotbar shows 9.** Slot 10 is invisible and untappable — items there are unreachable. Off-by-one between model and UI. | `fix/critical-path` |
| 8 | **MED** | **Restart has no confirmation; the Codeball debug nuke is bound to a live key.** A misclick/keypress can wipe a run; a debug "nuke" remains on a player-reachable key. | `fix/critical-path` |

### Missing pillars — separate feature branches

| Severity | Gap | Branch |
|----------|-----|--------|
| **HIGH** | **No audio at all** (no music, no SFX). Silence reads as unfinished (checklist #5, #6). | `feat/audio` |
| **HIGH** | **No options / accessibility menu** (volume, fullscreen, remap, pause; color-only state) (checklist #8, #10, #15). | `feat/options-accessibility` |
| **MED** | **No automated tests.** Nothing guards the critical path from regressing as fixes land. | `test/harness` |

### Deferred — systemic tech-debt (post-stabilization, NOT in 1.0 scope unless they bite)

These are real and worth tracking, but fixing them now would balloon the change and risk the ship. Park them.

- **Event-name / payload coupling has no tests.** Quest/state events are matched by string name + ad-hoc payload shape with nothing asserting the contract — easy to silently break. (A `test/harness` follow-up could pin the contracts.)
- **In-session map re-entry resets world state while the save preserves it.** Re-entering a map refills looted chests and respawns killed enemies, desyncing live state from the saved state. (Underlies checklist #3's partial.)
- **Duplicated radial geometry / constants across `main.js` + `renderer.js`.** The radial menu's geometry/constants are copy-pasted in two places — they drift. (Note: an existing commit already chipped at "single source for UI geometry"; finish the job post-1.0.)
- **No single source of truth for "what landing on a tile does."** Tile-entry behavior (transition / pickup / hazard / barricade / win-trigger) is scattered, which is the root cause of bugs #1, #4, #6. A unified tile-entry resolver is the proper post-1.0 refactor; for 1.0 we patch the symptoms on `fix/critical-path`.

---

## 5. Feature-Branch Breakdown & Merge Order

Four coherent branches are being implemented now. They were deliberately kept **coherent and non-overlapping to avoid `main.js` merge-hell** — each owns a clear slice, and shared-file edits are tagged.

| Branch | Owns | Gate |
|--------|------|------|
| **`fix/critical-path`** | All eight critical-path bugs in §4. The stabilization base. | Development |
| **`feat/audio`** | Looping music + SFX hooks on core actions (move, hit, pickup, win). | Development → Polish |
| **`feat/options-accessibility`** | Options menu (volume, fullscreen, remap), pause, color-only-state fixes. | Development → Polish |
| **`test/harness`** | A minimal automated test setup + a scripted critical-path smoke test. | Development |

### Recommended Merge Order
```
1. fix/critical-path        ← FIRST. The base. Everything else assumes a non-soft-locking game.
2. feat/audio               ← then sound, on top of a critical path that actually reaches the ending.
3. feat/options-accessibility ← then the options/pause/a11y layer (volume control needs audio to exist).
4. test/harness             ← anytime (independent), but ideally last so it pins the post-fix behavior.
```
**Rationale:** `fix/critical-path` is the foundation — merging audio or options onto a game that still soft-locks just polishes a broken core. Audio precedes options because the volume slider needs something to control. `test/harness` is independent and can land whenever, but landing it after the others lets its smoke test encode the *fixed* critical path as the regression baseline. Keep each branch short-lived and merge in this order to minimize `main.js` conflicts.

---

## 6. Playtest + Bug-Tracking Protocol

### The Scripted Run (repeat every change)
A fixed **start → ending** script, run after every meaningful change. If any step fails, that's a stop-ship bug logged immediately.

```
1. Fresh load (clear save). Splash → new game.
2. Opening beat plays (Borgir / sewer escape). Controls readable without a manual.
3. Escape the sewer — no wrong-win, no soft-lock, transitions fire on held-key movement.
4. Reach the car. Examine it in a "wrong" order on purpose — must not soft-lock.
5. Acquire the converter (try grabbing it early on purpose — must not soft-lock).
6. Complete fix_car.
7. A REAL ENDING fires (win/credits state). Game reaches a defined "you won."
8. Reload — save restored correctly, no desync that blocks progress.
```
Bonus adversarial passes: die mid-escape (converter must survive, respawn must be on a walkable tile); tab out and back; resize the window; mash held keys through a transition.

### The Bug Log (keep it dead simple)
A single running list — a markdown table or a flat text file is enough. No tracker, no ceremony.

| ID | Sev | Where (repro step) | Status | Branch / fix |
|----|-----|--------------------|--------|--------------|
| e.g. CP-01 | CRIT | "examine car before quest start → frozen" | open/fixed | `fix/critical-path` |

One row per bug, severity tagged, repro step from the scripted run, status, and the branch that fixes it. That's the whole system.

### Mapping onto the Four Gates
| Gate | Status for 1.0 |
|------|----------------|
| **Gate 1 — Research** | **DONE.** Genre/landscape understood; the existing plans (`adventure-transition-plan.md`, `game-research-findings.md`) cover it. |
| **Gate 2 — Design** | **DONE.** The car-fix arc is already designed and built; 1.0 is finishing it, not redesigning it. |
| **Gate 3 — Development** | **IN PROGRESS.** = the four branches in §5 (`fix/critical-path`, `feat/audio`, `feat/options-accessibility`, `test/harness`). |
| **Gate 4 — Polish** | **PENDING.** Juice + audio pass, onboarding pass (first-60s, checklist #4), and the **mandatory 10-minute playtest** from GAME_STUDIO_PLAN.md. Plus ship-prep: itch.io landing page, capsule art (checklist #11, #12). |

---

## 7. "Done When" — Definition of Done for 1.0

> **A new player can start the game, be onboarded in under 60 seconds, and play from start to a real ending — with sound, an options menu, and reliable saves — entirely on the web, with NO soft-lock or crash anywhere on the critical path.**

Concretely, all of the following are true:

- [ ] **Start:** Fresh load → playing in seconds, no account, no install (web).
- [ ] **Onboarded < 60s:** Controls + goal are taught through play (not a text wall), and the first minute delivers one satisfying moment.
- [ ] **Start → real ending:** The full car-fix arc is completable and ends in a defined **win/credits state** — not "ran out of content."
- [ ] **No soft-lock / no crash on the critical path** — for any reasonable play order (examine-early, grab-converter-early, die-mid-escape, held-key movement all handled).
- [ ] **Sound:** Looping music + SFX on core actions. Silence is gone.
- [ ] **Options menu:** Volume, fullscreen, controls; the game can pause.
- [ ] **Reliable saves:** Progress persists and restores without corruption or progress-blocking desync.
- [ ] **Web-first:** Live and playable in a browser (itch.io / Cloudflare Pages).

When every box is checked, tag **v1.0.0** and ship it. App stores, the other four zones, the party system, and the series are **post-1.0** — opened deliberately, one chapter at a time, on a foundation that already works.
