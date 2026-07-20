# Defeat Scenarios — Delivery Notes (for review)

**Status:** ✅ BUILT + verified in-browser on `feature/defeat-scenarios`. **NOT merged** — this is packaged for your review. Branch is off `dev`; merge is your call.

**What it is:** Outward-style *varied defeat* — HP→0 no longer wipes you. A scenario is picked, weighted by `(zone × who-beat-you × story-state)`, and runs a consequence template (wake somewhere · time skip · temporary status · a safe-floor + aggressor take-rule · recovery · optional gift). Built to the spec at `plans/defeat-scenarios.md` (System 1 of 3).

---

## Commits (10, on `feature/defeat-scenarios`)

| Task | Commit | What |
|---|---|---|
| DT1 | `64ccdd3` | pure `game/defeat-scenarios.js` (table + picker + take-matcher + `isSafe`/`isBoss`) + node tests |
| DT2 | `84599bd` | defeater tracking (`_lastDefeatedBy`) + `_die`→`_resolveDefeat` dispatch + boss-retry |
| DT3 | `6a1fd94` | consequence runner (wake/time/status/take/gift) + temporary status buffs |
| DT3b | `7b4c650` | guard the gift path against unknown item ids |
| DT4 | `9f3b320` | recoverable loot **stash** (a spawned chest; `_containerStock` widened to hold weapons) |
| DT5 | `0df6ace` | the four flavored **sewer scenarios** |
| DT6 | `fa7c33d` | protected-item **glyph** + legend (what survives a defeat) |
| fix | `6f2d074` | hardening from the adversarial review (see below) |

## Verified in-browser (every step, zero console errors throughout)
- Each sewer scenario fires and applies its consequence: **Fungus** eat your food/mushrooms; **Wererats** rob your loot into a recoverable stash; a **sludge** death cracks your kit; **Carrion** (low-weight hope roll) heals + gifts a bandage; a generic **beaten-and-dumped** fallback covers everything else.
- `pickScenario` routes each defeater to the right eligible set (town → only the fallback).
- The **safe floor holds every time** — the quest converter and equipped weapon are never taken (also the anti-soft-lock guarantee). Verified even under `loot:'all'`.
- **Boss** (Wererat) → resets to full + retry, no item loss.
- **Save round-trip after a defeat** preserves the aftermath byte-for-byte: inventory, the spawned stash chest, the status buff, position, gold.
- The **glyph** renders on safe items in ITEMS (the quest converter) and GEAR (the equipped weapon), with the legend "gold corner = kept if defeated".
- A real end-to-end `_die` by a Violet Fungus fires the full pipeline cleanly.

## Adversarial bug-hunt (3 reviewers: correctness / regression / silent-failure) → fixed in `6f2d074`
- **Buffs weren't cleared on defeat** — an active `sludge` DoT survived → re-death loop. Now every defeat clears buffs (matches the old `_respawn`).
- **Boss-retry didn't clear `_pendingTransition`** — a queued zone-transition could ghost-load a map after the retry. Fixed.
- **Stash dropped stack counts** — a robbed stack of 5 refunded 1. Now preserves counts.
- **Recoverable gold was silently lost** — the robbery took gold it never stashed. Dropped the gold from the robbery so "recoverable" is honest (gold-in-stash is a later follow-up).
- **Sludge stamped the defeater every tick** — mis-attributed a boss/fungus kill on a sludge tile. Now only claims the *killing* tick.
- Plus: fractional loot takes ≥1 (was 0 for a 1-item bag while the log claimed a loss); log a full-bag gift / a non-walkable wake spot / a throwing scenario predicate; `_skipTime` honors `'hours'`; neutral death copy.

---

## ⚠️ Please look at these (design calls / follow-ups)

1. **The robbery + recovery mechanic can't trigger in current play.** The only Wererat in the sewer is the **boss** (tag `wererat_boss`), so it runs the boss-retry, never `robbed_by_wererats`. The robbery/stash system is **built and verified directly** (and via save round-trip), but it won't fire in a real playthrough until a **non-boss "wererat gang"** enemy exists — a content add that belongs with System 2 (world persistence: Wererat-defeat → Lonny's quest). Your call whether to add a minion now or leave the mechanic waiting for that content.
2. **Node tests are unrun** — no local Node here. `tests/defeat-scenarios.test.js` + the suite need a `node --test` pass on a Node box before you merge.
3. **All worn gear survives a defeat, not just the weapon.** Armor lives in `game.equipment` (never the at-risk inventory), so nothing takes it. This is consistent with the safe-floor design but broader than the "quest + weapon + essential" doc line — confirm you're happy that death never strips armor.
4. **`swept_into_sludge` takes ALL consumables (food included)**, since food is `consumable:true` — so it overlaps the Fungus on food. Bounded and thematic ("your kit is soaked"), but tune the `breakables` rule later if you want food exempt.
5. **Minor / latent (documented, not fixed):** `wakeAt.map` (cross-map wake) isn't implemented yet — same-map only; a wake can transiently land on an enemy's tile; gold-in-stash is deferred; the old `_respawn` is now dead code (left in place, harmless).

## Next (Systems 2 & 3, per the spec's decomposition)
- **System 2 — world persistence:** mobs respawn, bosses reset one-go, world *shifts* on boss defeat (Wererat down → Lonny's quest, sewer relaxes). This is where the non-boss wererat + the robbery payoff naturally land.
- **System 3 — the loot bucket:** sell-only infinite-storage loot vs. essentials; enriches the "at-risk pool" the take-rules already consume.
