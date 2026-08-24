# Feature: Perception, Stealth, and the Thieve verb

**Phase:** Systems — a perception layer under the AI, and one new social verb on top of it.
**Priority:** High (Caelan, 2026-08-22: *"this will add an element and a reason to sneak up behind
enemies"*).
**Status:** Design (approved 2026-08-22).
**Companions:** `plans/systems-audit-2026-08.md` (§4 the transaction spine, §5 locks and keys, §7
order of operations) · `plans/balancing-bible.md` (the Laws) · `plans/pd3-ai-consolidation.md` (the
FSM this extends) · `plans/height-visibility.md` (the Gate-1 fog-of-war research this partly
answers).

> **Decisions (Caelan, 2026-08-22):**
> - **One spec, phased build** — perception → awareness → noise → rendering → thieve, in that order,
>   with a checkpoint between phases. They are a dependency chain, not independent subsystems.
> - **The dither means "where THEY can see"**, not "what you can't see." No roguelike shroud; the
>   room stays legible so a theft is something you can *plan*.
> - **Cone + peripheral arc** — a forward cone spots you; a wider, shorter side arc only makes them
>   *suspicious*. No omnidirectional bubble.
> - **Four discrete awareness states**, not a detection meter. Violencetown has no scalars and
>   should not grow one (audit §6).
> - **Stealth is positional + noise** — no sneak stance, no speed tax. Being hidden is a gift you
>   already have, per the buffs-feel-given rule.
> - **Thieve drills to Coin / Kit / Gear** on the existing wheel grammar. No new panel.
> - **Seen means refused** — the verb greys out. Hidden always succeeds. No dice anywhere.
> - **Anyone with pockets** is a valid target, with an author opt-out for quest-critical NPCs.
>
> **Revised 2026-08-23 (Caelan) — notice is a separate question from success:**
> - **A clean theft is genuinely clean.** Take little enough and there is **no disposition change and
>   no hostility** — they never know. The −100 is the price of being *noticed*, not of stealing.
> - **Weight vs. buffer, not a roll.** What you take has a weight (gold, item value, and for gear the
>   actual stat swing you remove from them); each victim has a notice buffer. Under it is clean, over
>   it is noticed. Deterministic and shown on the wheel *before* you commit.
> - **Being noticed does not hand them your position.** They learn they were robbed, not by whom or
>   from where — hostile and searching, but sweeping, not beelining.
> - **Peripheral is graded, not forbidden.** Dead behind = full buffer; peripheral = a much smaller
>   one; `DIRECT` = still refused outright.
> - **Both dither treatments get built** behind a toggle; the loser is deleted after Caelan looks at
>   them side by side in the real game.

---

## Gate 1: Research

### The problem this solves

The game has a stealth *vocabulary* and no stealth *system*. `Hide` is a wheel node that logs
`[You try to keep a low profile... (no effect yet)]` and spends the turn (`main.js:3333`).
`rockClatter` (`ai.js:58`) is described in its own comment as "the game's first stealth affordance"
and is the only one. Perception is a single omnidirectional radius plus a Bresenham LOS check
(`npc.js:145`), so enemies have no front and no back — there is nowhere to sneak *to*. The
aggro overlay (`renderer.js:2533`) draws a sight ring and an LOS thread but is explicitly
"PURELY VISUAL, READ-ONLY," so it advertises a fidelity the AI does not have.

Meanwhile the taking-their-stuff half is already built and shipped: `_handleEnemyDeath` moves the
enemy's wallet to the player through `transferGold`, drops their unused `loadout` via
`dropLoadout`, and records them in `_muggedIds` so a respawn comes back broke rather than
farmable. **Thieve is the living version of a path that already exists for corpses.**

### Player experience goal

> You see a guard. You see which way he is facing. You walk the three tiles he cannot see, take his
> coin purse, and are two rooms away before he finishes turning around.

Three properties make that work and all three are design constraints, not flavour:

1. **Decidable.** You can see the safe tile *before* you commit. The theft is a plan, not a gamble.
2. **Absolute.** Hidden always succeeds; seen cannot be attempted. There is no roll to lose, so
   there is nothing to save-scum and nothing to feel cheated by.
3. **Consequential in proportion.** Take a little and nothing happens at all. Take enough to be felt
   and the victim hates you at −100 and hunts you — without knowing who you are or where you went.
   Fail to be found, and the whole street gets a little colder toward everyone.

### Genre references

- **Commandos / Desperados / Shadow Tactics.** The vision cone as the primary readable object on
  screen. Source of the whole "the dither shows where THEY can see" decision — these games are
  played by reading cones, not by reading your own visibility.
- **Thief (1998).** Light and shadow as terrain; the player's job is route-finding through a
  negative space. Source of the *shade-the-safe-part* rendering candidate.
- **Metal Gear Solid / Splinter Cell.** The `?` → `!` awareness ladder as a legible, escalating
  contract with the player. Adopted; the numeric detection meter that usually accompanies it is
  explicitly **rejected** (audit §6 — Violencetown has no scalar and that is an asset).
- **Invisible, Inc.** Turn-based stealth where every guard's next-turn vision is shown *before* you
  move. The reason perception must be a shared function rather than a render-time approximation.
- **Skyrim / Oblivion pickpocketing.** The failure case is a percentage roll, and the result is that
  players quicksave before every attempt. Deliberately **not** copied — hence "seen means refused."
- **NetHack.** Theft has permanent social consequences and shopkeepers remember. Source of the
  `_robbed` persistence requirement.

### Scope

**In:** a shared perception module; enemy facing; a four-state awareness ladder; noise as a
first-class stimulus; a threat-visualisation pass replacing the aggro overlay; the Thieve verb and
its three branches; the weight-against-buffer notice model; a downward disposition flip; area
paranoia on a failed search; per-enemy theft persistence.

**Out (named, not forgotten):** cover/crouch mechanics; per-tile properties (that is the audit's
tag layer, §5.4); a sneak stance; light level affecting detection *in v1*; witnesses; player-side
fog of war; NPC-on-NPC theft.

### Risks

| Risk | Mitigation |
|---|---|
| Every enemy in the game gains a blind spot → existing fights get easier | Phase 1 ships alone and is playtested alone. Peripheral arc + suspicious-turns-to-look is the balancing pressure. Retune `sightRange` per spawn if needed. |
| A third state variable on top of `fsmState` + `state` (audit's ballooning warning) | The ladder **extends the existing legacy `state`** rather than adding an axis. Net new state variables: zero. |
| Four darkening passes fight for the same pixels (day/night multiply, arena dim, Wilderness blackout, threat wash) | The threat wash is an ordered **dither stipple**, not a translucent fill — it composites without shifting the tone of the layers under it. |
| Theft trivialises the economy | Steal limit is a small fixed number (50 GP base). `_robbed` closes farming exactly the way `_muggedIds` closes corpse-farming. |
| Theft breaks a quest by robbing the wrong NPC | `thievable: false`, mirroring the existing `bribeable: false`. |
| Verb-list freeze (audit §7 item 10) | Acknowledged and spent deliberately. Thieve adds *edges*, not a node: it wires stealth × disposition × wallets × loadout × AI × the shove. Audit §4 argues this is the cluster worth investing in. |
| Concurrent work on `feature/unified-offer-screen` collides with this | Checked against their real diff, not their plan: `give-action.js`, `trade.js` and `wheel-model.js` are untouched. One shared import hunk in `renderer.js` is the whole exposure. See *Coordinating with the offer screen*. |

---

## Gate 2: Design

### Module layout

Two new **pure, node-testable** modules, following the `ai.js` / `pathing.js` / `rings.js`
precedent — `Game` (main.js) touches `document` at load and cannot be constructed under node, so
the math lives outside it.

| Module | Owns | Imports |
|---|---|---|
| `game/perception.js` | cone geometry, the perception verdict, awareness transitions, noise propagation | `pathing.js` (LOS), `utils.js` |
| `game/theft.js` | what is stealable, the steal limit, the take resolution | `items.js`, `enemies.js` (`resolveLoadout`) |

Neither imports `main.js`, `npc.js`, or `renderer.js`, so there is no cycle. `perception.js`
imports `pathing.js`, which imports only `utils.js`.

**Modified:** `npc.js` (the ladder), `enemies.js` (fields + save contract), `renderer.js` (threat
pass replaces the aggro overlay), `wheel-model.js` (the Thieve subtree), `main.js` (the resolver,
noise emission at action sites), `give-action.js` (the downward flip), `save.js` (`_robbed`).

**Rejected alternatives.** *Growing `pathing.js`/`ai.js` in place* — no new files, but it welds
perception onto two deliberately single-purpose leaf modules and makes the diff far harder to
review. *A precomputed per-tile threat grid as the primary API* — used as a render-side cache
(below), but the authoritative call stays "can this watcher perceive this tile?", so the AI and the
overlay can never disagree. That disagreement is precisely the bug the current overlay's
READ-ONLY disclaimer exists to avoid.

### Facing

Enemies already carry `_lastDx` / `_lastDy`, stamped by `stepEntity` on every move, persisted in
`toSave`, and read by `combat.js`'s backstab check. Two gaps:

- **Never-moved enemies read `(0,0)`.** `facingOf(e)` falls back to `(0,1)` — south, toward the
  camera. Map JSON may declare `facing: 'N'|'S'|'E'|'W'|'NE'|…` on a spawn, hydrated into
  `_lastDx/_lastDy` at construction.
- **Nothing turns without walking.** A `suspicious` promotion stamps facing toward the stimulus.
  This is what stops a blind spot from being a permanent parking space.

Attacking already re-faces (`npc.js`, the adjacent-attack branch). No change needed there.

### The perception verdict

For a watcher at `(wx,wy)` with facing **f**, against a tile at offset **d = (tx−wx, ty−wy)**:

```
cos = (f · d) / (|f| · |d|)
```

| Zone | Test | Verdict |
|---|---|---|
| **Cone** | `cos ≥ 0.7071` (±45°, a 90° wedge) · `cheb ≤ sightRange` · LOS clear | `DIRECT` |
| **Periphery** | `cos ≥ 0` (±90°) · `cheb ≤ ceil(sightRange / 2)` · LOS clear | `PERIPHERAL` |
| **Rear** | `cos < 0` | `NONE` |

`d = (0,0)` (a watcher's own tile) returns `DIRECT`.

**The property that makes this teachable:** for all eight facings — cardinal *and* diagonal — the
eight adjacent tiles split identically into **3 cone (front) · 2 peripheral (sides) · 3 blind
(rear)**. Verified by hand for `f = (0,1)` and `f = (1,1)`; it follows from the dot product being
symmetric under the 45° rotation that maps one onto the other. So the entire player-facing rule is:

> **The three tiles behind them are the blind spot.**

No exceptions to memorise, and it self-balances the "shadow someone forever from one tile back"
failure of a pure cone: standing at a flank is `PERIPHERAL`, two beats of that makes them
`suspicious`, and a suspicious enemy *turns* — which puts you in the cone.

### Two thresholds, deliberately different

| Predicate | Definition | Used by |
|---|---|---|
| **Hidden** | no living, non-ally watcher returns `DIRECT` on the player's tile | general stealth consumers |
| **Blind to you** | *this specific victim* returns `NONE` on the player's tile | the theft's core rule |

You can be hidden from a room while still in someone's peripheral vision — but you cannot pick the
pocket of a person who is half-aware of you. The theft is specifically the behind-them move.

**Thieve requires** that you are hidden — nobody in the room holds `DIRECT` on you, the victim
included. That clause is what makes "there are no witnesses" true by construction rather than by
assertion: a third party watching you rob someone blocks the verb even though the victim never sees
a thing.

The victim's own verdict is **not** a gate but a **grade** — it sizes the notice buffer (below):

| Victim's verdict on your tile | Meaning |
|---|---|
| `NONE` (dead behind) | full notice buffer — the clean approach |
| `PERIPHERAL` (their flank) | buffer reduced hard — only the lightest touch goes unnoticed |
| `DIRECT` | refused outright; the verb greys out |

### API — `perception.js`

```js
export const VERDICT = { DIRECT: 'DIRECT', PERIPHERAL: 'PERIPHERAL', NONE: 'NONE' };

export function facingOf(watcher)                       // → { fx, fy }, (0,1) fallback
export function perceives(map, watcher, tx, ty)         // → VERDICT
export function isBlindTo(map, watcher, x, y)           // perceives(...) === NONE
export function spotters(map, watchers, x, y)           // → watchers returning DIRECT
export function nextAwareness(watcher, verdict, ctx)    // → { state, faceTo?, lastSeen? }  (pure)
export function emitNoise(watchers, x, y, loudness)     // promotes idle/suspicious watchers
```

**Tunables** (one block, top of file):

```js
CONE_COS         = 0.7071   // ±45°
PERIPH_COS       = 0        // ±90°
PERIPH_RANGE_DIV = 2        // peripheral range = ceil(sightRange / 2)
SUSPICION_BEATS  = 2        // consecutive peripheral beats → suspicious
INVESTIGATE_WAIT = 1        // beats spent turning before walking to look
SWEEP_BEATS      = 3        // beats scanning at last-seen before giving up
CALM_BEATS       = 6        // suspicious with no stimulus → idle
BLIND_SWEEP_BEATS = 8       // a robbed victim with no last-seen sweeps this long
```

And in `theft.js`:

```js
STEAL_BASE         = 50     // GP ceiling on a Coin take, before passives
NOTICE_BASE        = 3      // weight a victim fails to notice, before passives
PERIPHERAL_PENALTY = 0.5    // buffer multiplier when robbed from their flank (floor 1)
COIN_PER_WEIGHT    = 25     // GP per point of weight
VALUE_PER_WEIGHT   = 25     // item baseValue per point of weight
PARANOIA_DELTA     = -25    // exactly one trade.js BAND — see Paranoia below
PARANOIA_RADIUS    = 6
```

### The awareness ladder

**This is a rename, not a new axis.** Enemies already carry two overlapping state variables:
`fsmState` (`IDLE`/`WANDER`/`WORKING`/`HOSTILE`/`ALLIED`) and the legacy `state`
(`idle`/`chasing`/`returning`). A third would be exactly the ballooning the audit warns about. So
the ladder **extends `state`**, and most of it already exists unnamed — `npc.js` already, when a
chaser goes blind, pursues `_lastSeenX/Y` instead of the player's true position and gives up on
arrival. That is a searching state without a name or a face.

```
idle → suspicious → searching → chasing → returning → idle
```

| From | Trigger | To | Notes |
|---|---|---|---|
| `idle` | `DIRECT` | `chasing` | today's `[spotted you!]` line, unchanged |
| `idle` | `PERIPHERAL`, `SUSPICION_BEATS` running | `suspicious` | **turns to face it; does not advance** |
| `idle`/`suspicious` | noise in range | `suspicious` | last-seen ← noise tile |
| `suspicious` | `DIRECT` | `chasing` | |
| `suspicious` | `INVESTIGATE_WAIT` beats, no contact | `searching` | |
| `suspicious` | `CALM_BEATS`, no stimulus | `idle` | |
| `searching` | `DIRECT` | `chasing` | |
| `searching` | reached last-seen, no contact | sweep `SWEEP_BEATS`, then `returning` | scans in place, rotating facing |
| `searching` | **no last-seen at all** (a robbed victim) | sweep `BLIND_SWEEP_BEATS`, then **paranoia**, then `returning` | wanders its home region rotating facing — it has nowhere to go |
| `chasing` | lost sight | `searching` | today's inline last-seen branch, now named |
| any | leash exceeded / blind too long | `returning` → `idle` | existing leash, unchanged |

The **"turns to face it, does not advance"** beat is load-bearing: it is the window in which you
duck back behind the corner, and it is the entire reason a peripheral glance is not a death
sentence.

`_lostSightTurns`, `LEASH_DISTANCE`, and `LOST_SIGHT_BEATS` keep their current meanings and tuning.

### Noise

`emitNoise(watchers, x, y, loudness)` — every watcher within `loudness + (hearingRange ?? 0)` tiles
(Chebyshev) whose state is `idle` or `suspicious` sets last-seen to that tile and promotes to
`suspicious`. Anything already `chasing` is **not** redirected.

`hearingRange` is therefore an authored **bonus**, not the radius — it defaults to 0, so loudness
alone decides how far a sound carries, and a sharp-eared creature can be given `hearingRange: 3`
without every sound in the game needing a per-listener table.

That last clause is verbatim today's `rockClatter` rule. **`rockClatter` is deleted and becomes one
call into `emitNoise`** — the game's only existing stealth affordance becomes the general case
rather than a special case. `pullsAggro` on the rock (`items.js:74`) keeps working; it now selects a
loudness rather than hard-coding a behaviour.

| Source | Loudness | Rationale |
|---|---|---|
| a step | 1 | effectively silent; present so it is tunable, not so it bites |
| a door / the pipe-jam | 4 | |
| a cast | 5 | |
| a melee swing | 6 | fighting is loud; a brawl draws a crowd |
| a thrown item landing | 8 | preserves today's `sightRange ?? 8` rock behaviour exactly |
| **a theft** | **0** | silent by definition — only the victim reacts |

**Sound ignores walls in v1.** It goes around corners, which is both more truthful and the
forgiving direction for the AI (noise cannot see through a wall to find you; it only mislocates
attention).

### Rendering

`_drawAggroOverlay` is retired and replaced by `_drawThreatOverlay`. Three channels, so the dither
is never the sole signal (colourblind / low-vision):

1. **The threat field.** Per visible tile, the strongest verdict across all living, non-ally
   watchers. Painted as an **ordered dither stipple** — a 2×2/4×4 Bayer pixel pattern — not a
   translucent fill. This matters technically as well as aesthetically: the screen already carries a
   day/night multiply pass, a combat-arena dim, and (in the Wilderness) a blackout. A fourth smooth
   alpha layer is how you get mud; a stipple composites over all of them without shifting their tone,
   and it reads as deliberately retro rather than as a dirty screen.

   **Two treatments, both built, one toggle** (Caelan decides at the screen, then the loser is
   deleted — this is the spec's one intentionally open question):
   - **A — shade the safe.** Tiles returning `NONE` darken under the stipple; watched tiles stay
     bright. You move through shadow; "am I hidden" is answered by "am I standing in the dark part."
   - **B — tint the watched.** `DIRECT` tiles take a red-gold stipple, `PERIPHERAL` a fainter amber;
     everything else is clean. More obvious in motion; reads more like a UI overlay than a world.

2. **Facing chevron.** A small directional mark on each enemy sprite.
3. **Awareness pip.** `·` calm · `?` suspicious · `!` searching · `!!` chasing — riding the
   mood-smiley machinery already at `renderer.js:1086`.

**Caching.** The field is rebuilt once per world beat, keyed on `game.turn` plus a dirty flag,
because nothing's perception changes between beats. The player's render-side slide does not
invalidate it. Cost is ~10 watchers × 121 visible tiles, and only on beats.

Reduce-motion (existing `Settings` hook) flattens the breath/pulse exactly as the current overlay
does.

### The Thieve verb

`Trick → Thieve` (`aimType: 'adjacent'`), drilling to three children — a sibling of Bribe and
Trade, which is the correct neighbourhood: **a theft is a transaction with the sign flipped.**

| Branch | Takes | Available when |
|---|---|---|
| **Coin** | `min(victim.gold, stealLimit)` | `victim.gold > 0` |
| **Kit** | one item from `victim.loadout` — highest `baseValue`, ties by authored order | `loadout` non-empty |
| **Gear** | one item from `victim.equipped`, applying its stat delta on removal | `equipped` non-empty |

Branches grey out through the same `available` predicate the wheel already uses for unaffordable
spells. The whole verb greys out unless all three hold: you are **hidden**, the victim is **blind to
you**, and the victim has not opted out with `thievable: false`.

**Deterministic, never random.** Highest-value-first means the player can predict what a pocket
yields, which is what makes a theft a plan. `loadout` entries resolve through `resolveLoadout`
(`enemies.js`), which already tolerates the legacy `{ name, value }` literals still present in old
saves and fixtures; an entry that resolves to no real def is skipped rather than stolen as a ghost.

**Steal limit.** `stealLimit = STEAL_BASE (50) + passives.stealLimit`, and its sibling axis
`noticeBuffer = NOTICE_BASE (3) + passives.noticeBuffer` — see *Notice* below for why there are two.
`aggregatePassives` (`rings.js`) already sums numeric ring passives into one object, so each costs
exactly one authored number and no new plumbing. That is Caelan's "goes up with perks/equipment," for
free, and it is two fresh edges into the ring system the audit calls under-connected (§3.1).

**Gold moves through `transferGold` only.** `theft.js` computes the amount and never touches gold
itself; `main.js` performs the transfer. The single-choke-point invariant in `trade.js` is
preserved, so the theft is auditable alongside every buy, sell, and bribe.

**Gear needs new authoring.** Enemies carry a `loadout` (things they would *use*) but their `armor`
and `damage` are flat numbers with no items behind them. `equipped` is a new authored array whose
removal actually moves those numbers — steal the brute's plate, then fight a softer brute. It is the
most interesting edge in the feature and the only part requiring content work, so **the Gear branch
greys out until an enemy declares `equipped`** and degrades to absent rather than to a lie.

The stat delta is concrete, because equippable defs already carry the numbers (`items.js`:
`armor: 2` on the pizza box, `armor: 4` on the traffic cone, `damage: 12` on the crowbar). On
removal: `entity.armor −= def.armor ?? 0` and `damage −= def.damage ?? 0`, with the result clamped
into Law 3's `[−90, +10]` armor band so a theft can never author an illegal entity. Stolen gear is
recorded in `_robbed.items` so it stays gone across a zone re-entry, and the stat delta is
re-applied at spawn rather than stored — one source of truth.

**Cost.** One world turn, through `_advanceWorld` like every other verb.

### Notice — weight against a buffer

**Succeeding and being noticed are two different questions.** A theft from a blind spot always
succeeds. Whether the victim *notices* is decided separately, by how much you took — and if they do
not notice, **nothing happens at all**: no disposition change, no hostility, no search. A clean
theft is genuinely clean. The −100 is the price of being noticed, not the price of stealing.

**Weight** — what a take costs you, in one table:

| Branch | Weight |
|---|---|
| Coin | `ceil(gp / 25)` — 50 GP = 2, 100 GP = 4 |
| Kit | `max(1, ceil(baseValue / 25))` — a rock is 1, a real item is more |
| Gear | `max(3, armor × 2 + damage)` — the stat swing you are removing from them |

Gear is deliberately heavy because it is the **action-economy** take: lifting the crowbar
(`damage: 12`) is a 12-weight act, and stealing someone's weapon should never be quiet. That is the
material weight behind the verb — you are not just moving an icon, you are moving their combat
numbers onto your side of the fight.

**Buffer** — what a victim fails to notice:

```
noticeBuffer = NOTICE_BASE (3) + passives.noticeBuffer
             × PERIPHERAL_PENALTY (0.5, floored at 1) if the victim's verdict on you is PERIPHERAL
```

Clean iff `weightTaken + weight ≤ noticeBuffer`, where `weightTaken` accumulates in `_robbed` and
**never refills**. So one pocket is quiet and the second is not — Caelan's "you just couldn't steal
more than one item," falling out of the arithmetic rather than being asserted as a rule.

Worked, at base: 50 GP is weight 2 against a buffer of 3 — clean. Go back for another 50 and you are
at 4 — noticed. A rock (1) then coin (2) hits exactly 3 — clean, and the last quiet thing you will
take from that person. The crowbar is 12 against 3 and is *always* noticed, from anyone, forever.
From their flank the buffer is 1, so only the lightest touch survives.

**Two perk axes, not one.** `stealLimit` (50 base, rising with passives toward ~100) governs *how
much* you can take; `noticeBuffer` governs *how quietly*. They are deliberately separate, and they
pull against each other: a limit perk alone makes you take 100 GP — weight 4 — and get noticed for
it. Wanting both is a build. That is the fixed-budget corollary from audit §6 arriving on its own.

**The wheel prices it before you commit.** Each branch renders its verdict — `Coin · 50 GP · clean`
versus `Gear · Crowbar · NOTICED` — so the decision is informed, deterministic, and never a gamble.
No dice anywhere in the system, exactly as ruled.

### The consequence

Everything below fires **only on a noticed theft.**

`give-action.js` gains `applyHostileFlip(recipient)` — the mirror of the existing `applyFlip`,
which today handles only the *upward* `becomeAlly` / `offerDiscount` cases. There is currently no
downward path anywhere in the codebase; this is it.

```
disposition   → −100        (the clamp floor applyDispositionDelta already enforces)
allegiance    → 'hostile'
fsmState      → 'HOSTILE'
_ally         → cleared     (robbing your own bribed ally absolutely turns them)
_wasFlipped   → UNTOUCHED
```

Leaving `_wasFlipped` alone is deliberate: a later bribe crossing their threshold can still buy them
back. From −100 that is expensive, and it should be. Note the existing decay (`1` point per ~20s of
free-roam) walks the number back toward 0 on its own over roughly half an hour of play — the grudge
fades, the hostility does not, and only a bribe undoes the latter.

`reactToTransaction(npc, 'theft', { item, gold })` gains `'theft'` as a fourth transaction type so
the `giftLog` records what was taken. The transaction spine grows an edge, which is precisely what
audit §4 asks for.

**Then the hunt — and they do not know where you are.** `state = 'searching'` with **no last-seen
tile**, and facing unchanged. They know they were robbed; they do not know by whom or from where. So
they sweep their area rather than beelining at you. Being noticed costs you a permanent enemy, not
your position.

**Victim only reacts** at the moment of the theft. By construction there cannot be a witness who saw
*you* — the verb refuses if anyone holds `DIRECT` on you. The neighbourhood's reaction comes later
and indirectly, below.

### Paranoia — what a failed search leaves behind

A search that ends without a culprit does not simply reset. The victim tells people, and the
**immediate area gets warier of everyone**: every living NPC within `PARANOIA_RADIUS` (6 tiles),
excluding the victim and excluding your own allies, takes **−25 disposition**.

That number is not arbitrary. `trade.js`'s `BANDS` are spaced **exactly 25 points apart**, so one
failed search moves every merchant in earshot **down precisely one price band** — `friendly` to
`neutral`, `neutral` to `wary`. The paranoia is legible the instant you try to buy something, without
a single new UI element. Four thefts in one district and the shops hit the `TRADE_FLOOR` and stop
dealing with you at all.

**Why this one does not feel goofy.** The Baldur's Gate version reads as omniscience — everyone
instantly knows, someone points at you, a popup announces your crime. This version never accuses
you of anything:

- It is **social, not omniscient.** Nobody identifies you. The district just gets colder.
- It is **already visible.** Every nameplate carries a mood smiley; they all tick down one notch at
  once. You watch a neighbourhood sour.
- It is **temporary, for free.** The existing decay (1 point per ~20s of free-roam) walks −25 back to
  0 in about eight minutes. A district cools off on its own. No new code, no timers.
- It is **bounded and earned.** A radius, not a zone; and only on a search that *fails*.

That last clause is the real design: **get caught and it stays between the two of you; get away with
it and the chill spreads.** There is no strictly correct play, which is what makes it a decision. If
the victim spots you mid-search the chase begins and no paranoia fires — they got their man.

Applied through `applyDispositionDelta`, so the existing clamp, the upward-flip guard, and the
`_ally` exemption all hold without special-casing.

### The shove combo — emergent, zero new code

`main.js:2007` shoves a character aside and sets `_spunTurns = 1`. Its own comment traces, for both
the knock-aside and the swap flavour, that **the player's landing tile is exactly the tile behind
the victim's new facing** — and `npc.js` makes the victim spend its next turn recovering with no
re-face, no move, no attack.

Under this perception model that tile is now, by definition, the **blind spot**. So:

> **Shove → Thieve** is a complete, working combo the moment Phase 5 lands, built entirely out of
> two systems that already shipped separately.

This is the shape the audit asks for in §4 and §5.4 — depth from elements interacting, not from
elements existing. It costs nothing and should be surfaced to the player (a first-time hint).

### Data schema

**`Enemy` — new / changed fields** (all round-trip through `toSave`/`fromSave`, which the class
owns so the shape cannot drift from the constructor):

| Field | Type | Notes |
|---|---|---|
| `state` | string | **extended** — now `idle`/`suspicious`/`searching`/`chasing`/`returning` |
| `_awareBeats` | number | consecutive peripheral beats; drives the `suspicious` promotion |
| `_sweepBeats` | number | beats spent scanning at last-seen |
| `facing` | ctor input | authored `'N'|'S'|…`, hydrated into `_lastDx`/`_lastDy` |
| `equipped` | array\<itemId\> \| null | authored; theft-removable, moves `armor`/`damage` |
| `thievable` | bool \| null | `false` opts out, mirroring `bribeable` |
| `hearingRange` | number \| null | optional per-enemy override |

`_lastSeenX/_lastSeenY`, `sightRange`, `_lastDx/_lastDy`, `_spunTurns` are unchanged and already
persisted.

**`Game` — new state:**

| Field | Shape | Notes |
|---|---|---|
| `_robbed` | `{ [enemyId]: { gold: n, items: [ids], weightTaken: n, noticed: bool } }` | applied in `spawnEnemy` **after** JSON hydration |

`weightTaken` is the accumulator the notice buffer is measured against and it never decreases —
that is what makes the second pocket riskier than the first, permanently and across zone re-entry.
`noticed` replaces the earlier `hostile` flag: it records that this victim's theft was *noticed*,
which is what re-applies the −100 and the hostility on respawn. A clean theft records `gold` /
`items` / `weightTaken` and **nothing else**, because a clean theft has no social consequence to
persist.

### The persistence trap

Reusing `_muggedIds` for theft would be a bug, twice over:

1. `spawnEnemy` clears gold **and** wipes the loadout for a mugged id. Steal 50 GP off a 200 GP
   enemy, leave the zone, and the other 150 silently vanishes.
2. Enemies re-hydrate from map JSON on every `_loadMap`. Without a record, the theft — and the −100
   — simply undo themselves on zone re-entry.

So `_robbed` is a **new, additive** map. `_muggedIds` is left exactly as it is and the death path
does not change; the two coexist and compose (rob a man, then kill him, and he comes back with
neither). `_robbed` is persisted and validated beside `muggedIds` in `save.js`, filtering
non-string keys the same way.

### Edge cases

| Case | Resolution |
|---|---|
| Victim dies between wheel-open and resolve | Resolver re-checks `isAlive()` and thievability; logs and spends nothing |
| Robbing your own bribed ally | `applyHostileFlip` clears `_ally` — they turn on you |
| Watcher with `sightRange = 0` | Peripheral range is 0 too; every tile is `NONE`; always thievable |
| Facing `(0,0)` (legacy save / never moved) | `facingOf` returns `(0,1)` |
| `ambient` NPCs (world-heartbeat, not player-turn) | Their ladder ticks on `resolveAmbientTurns`, same transitions |
| An enemy with the existing `blind` debuff | `sightRange` halves for perception — a real edge for Poke, at one line |
| A `feared` (fleeing) enemy | Movement override already wins; the ladder does not fight it |
| `_spunTurns > 0` | Recovery turn already skips the whole HOSTILE branch; awareness does not tick either |
| Player in Rat Form | Flagged as a v2 detection modifier; no v1 effect |
| Save/load mid-`searching` | `state`, `_lastSeen*`, `_awareBeats`, `_sweepBeats` all persist |
| Robbing a vendor mid-trade | Unreachable — the trade window and the wheel are different states |
| A clean theft, then the victim wanders into you | Nothing carried over; they were never told. Ordinary perception applies |
| Robbing an ally *cleanly* | Nothing happens — they stay your ally. `applyHostileFlip` fires only on notice |
| Victim dies before its search ends | No paranoia; a corpse tells no one |
| Paranoia radius spans a zone edge | Radius is measured in the current map only; NPCs on other maps are not loaded |
| Paranoia would push a vendor below `TRADE_FLOOR` | Allowed and intended — the shop closes to you until decay lifts it. See open question 4 |
| Two clean thefts, second exceeds the buffer | The *second* is noticed; the first stays clean and unrecorded socially |
| `weightTaken` present but `noticed` false on respawn | Goods stay gone, mood untouched — the accumulator is the only thing that survives a clean job |

### Testing

Node tests, run with `npm test` **locally** — Node v24.18.0 is installed on this machine as of
2026-08-23, so the long-standing "tests ship to CI unrun" caveat that applied to rings and
defeat-scenarios **no longer holds**. Every phase gate is now a green test run *and* an in-browser
check, not one or the other:

- `tests/perception.test.js` — the 3/2/3 adjacent split for all eight facings; range clamps; LOS
  interaction; `(0,0)` facing fallback; `sightRange 0`.
- `tests/awareness.test.js` — every ladder transition, including the turn-but-don't-advance beat and
  the calm-down path.
- `tests/noise.test.js` — promotion radius; the already-chasing-is-not-redirected rule (a direct
  port of today's `rockClatter` behaviour, so this is also a regression test).
- `tests/theft.test.js` — steal limit with and without passives; gold conservation; loadout removal;
  highest-value selection and its tie-break; `applyHostileFlip` leaving `_wasFlipped` alone.
- `tests/notice.test.js` — the weight table for all three branches; `weightTaken` accumulating and
  never refilling; the peripheral buffer penalty and its floor of 1; **a clean theft mutating no
  disposition and no allegiance** (the regression that matters most — it is the whole point of the
  revision); the worked examples above as fixtures.
- `tests/paranoia.test.js` — radius; victim and `_ally` both exempt; −25 lands on a band boundary in
  `trade.js`; fires only on a *failed* search, never when the victim acquires the player.
- `tests/save-roundtrip.test.js` — extend for `_robbed` and the new enemy fields.

Also: `tools/balance-harness.mjs` and its golden diff should be re-run after Phase 1, since blind
spots change effective threat. Any golden movement is a finding, not noise.

### Coordinating with `feature/unified-offer-screen`

That branch is live *concurrently* (`plans/unified-offer-screen.md`, being built 2026-08-23 in the
primary checkout while this work runs in a `git worktree` at
`.claude/worktrees/stealth-perception`). It collapses buy / sell / give / bribe into **one verb —
make an offer** — and consolidates the flip logic in `give-action.js` behind a single shared curve.

**Corrected 2026-08-23 against their actual diff.** An earlier draft of this section predicted a
high-conflict collision in `give-action.js` and gated Phase 5 behind their merge. That prediction
was read off their *plan*; the 74-commit diff says something different, and the correction matters
because it removes the gate entirely.

What they have actually built is three **new** modules — `offer.js` (the basket, `resolveOffer`,
`commitBlocker`), `disposition-curves.js` (goodwill / resentment), `item-registry.js`
(`resolveItemDef`) — plus `layout.js`, `weapons.js`, and **25 lines of `main.js` / 8 of
`enemies.js`.** Measured overlap:

| File | Predicted | Actual | Risk |
|---|---|---|---|
| `give-action.js` | consolidates flip logic | **untouched; API byte-identical to `dev`** | **none** |
| `trade.js` | shared pricing curve | **untouched** — imported by `offer.js`, never modified | **none** |
| `wheel-model.js` | one passing reference | **untouched** | **none** |
| `renderer.js` | `_drawTradeModal` | untouched *so far*; their Tasks 9–11 replace it | low — different function, shared import block |
| `main.js` | four regions | 25 lines, all in `_resolveItemDef` / `_takeItemAt` / `_grantItem` | low — disjoint from the wheel resolver |
| `enemies.js` | — | one import line | trivial |

**So there is no gate, and no phase ordering.** All six phases proceed in sequence. The only real
collision left is the *import block* at the top of `renderer.js`, which both branches widen; whoever
merges second keeps both sets and re-runs the game.

Three things their branch does change about this design:

1. **`ITEMS[id]` cannot resolve a weapon** — weapons live in `WEAPONS` — and stolen Gear is
   overwhelmingly weapons. The theft resolver goes through the *Game method* `_resolveItemDef`,
   which is correct on `dev` and on their branch alike. This was a latent bug in the first draft.
2. **Weapons now carry `baseValue`**, so a stolen weapon prices properly once they merge, and
   degrades to the weight floor of 1 before then. No ordering dependency.
3. **They independently landed on 25 as the resentment unit** (`RESENT_MAX_PER_OFFER = 25`,
   `RESENT_FLOOR = -25`) — the same band spacing paranoia is tied to here. Their floor caps what a
   bad *deal* can cost you; theft deliberately punches through it to −100. Keep the two distinct on
   purpose: haggling badly should never make an enemy, and robbing someone should.

### Build order

One branch, six phase-commits, each gated on a green `npm test` **and** an in-browser check.

| Phase | Ships | Verified by |
|---|---|---|
| **1** | `perception.js`, facing, `npc.js` sight check swapped over | Enemies have a blind spot; walking behind one is not noticed. **Biggest behaviour change in the feature — playtested alone.** |
| **2** | The awareness ladder | `?` → `!` observable; the turn-to-look beat exists; leash unchanged |
| **3** | Noise; `rockClatter` retires into `emitNoise` | The rock still works identically; a swing pulls attention |
| **4** | Threat rendering; `_drawAggroOverlay` retires; both dither treatments behind a toggle | Cones legible; pips correct; no mud over day/night or arena |
| — | *No gate here. The concurrent offer-screen branch leaves `give-action.js`, `trade.js` and `wheel-model.js` untouched — measured, not assumed.* | |
| **5** | `theft.js`, the wheel subtree, notice/weight, `applyHostileFlip`, paranoia, `_robbed` | Full loop: sneak → rob clean → **nothing happens** → rob heavy → noticed → blind sweep → district cools. **Shove → Thieve works.** |
| **6** | Polish: night shrinks sight, `equipped` authoring, audio, first-time hint, tuning | |

Per Caelan's standing rule the branch is finished and pushed, and **the merge-to-`dev` call is
his**.

---

## Open questions

1. **Which dither treatment survives** — shade-the-safe or tint-the-watched. Both are built in
   Phase 4 behind a toggle; Caelan decides at the screen and the loser is deleted. This is the one
   question the spec deliberately leaves open.
2. **Does night reduce `sightRange`?** `_nightLevel` already exists and driving perception from it
   is roughly one line — steal at night becomes a real strategy. Deferred to Phase 6 because it
   silently retunes every existing chase.
3. **Should `sightRange` be retuned per spawn after Phase 1?** Answerable only from play.
4. **Does paranoia stack across repeated failed searches in one district?** Spec'd as yes — it is
   plain `applyDispositionDelta`, so four failed searches drive a neighbourhood to the `TRADE_FLOOR`
   and the shops stop dealing. That is either the best consequence in the feature or too punishing,
   and only play will say. The existing decay is the release valve either way.
5. **Should a clean theft be *completely* silent, or leave a tell?** Spec'd as completely silent —
   no log line, no mood tick, nothing. The alternative (a faint "something feels lighter" bark a few
   beats later) is more alive but risks reading as a bug the first time it happens.

## Non-goals

Cover and crouch · per-tile properties (the audit's tag layer, §5.4 — this feature should *not* drag
it forward) · a sneak stance · player-side fog of war · a detection meter · NPC-on-NPC theft ·
witnesses · pickpocketing containers.
