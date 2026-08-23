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
3. **Consequential.** The victim hates you afterward at −100 and hunts you — but has to *find* you
   first, and you get exactly one beat of head start.

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
its three branches; a downward disposition flip; per-enemy theft persistence.

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
| No Node on the dev machine — tests can be written but not run | Same as rings / defeat-scenarios. Tests ship to CI; in-browser verification is the local gate. |

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

**Thieve requires BOTH**: you are hidden (nobody in the room holds `DIRECT` on you) *and* the victim
is blind to you (`NONE`, not merely non-`DIRECT`). The first clause is what makes "there are no
witnesses" true by construction rather than by assertion — a third party watching you rob someone
blocks the verb even though the victim never sees a thing.

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

**Steal limit.** `stealLimit = STEAL_BASE (50) + passives.stealLimit`. `aggregatePassives`
(`rings.js`) already sums numeric ring passives into one object, so a `stealLimit` passive on a ring
or a piece of gear costs exactly one authored number and no new plumbing. That is Caelan's "goes up
with perks/equipment," for free, and it is a fresh edge into the ring system the audit calls
under-connected (§3.1).

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

### The consequence

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

**Then the hunt.** `state = 'searching'`, last-seen ← **the player's tile at the moment of the
theft**, and facing is **not** changed on this beat. They spin and start hunting on their *next*
turn. That is "immediately hostile, does not necessarily find you immediately," and it is exactly
one beat of grace to be somewhere else.

**Victim only reacts** in v1. By construction there cannot be a witness who saw *you* — the verb
refuses if anyone holds `DIRECT` on you. A bystander who watched the *victim* without seeing the
thief is a deliberate v2 extension, not a v1 hole.

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
| `_robbed` | `{ [enemyId]: { gold: n, items: [ids], hostile: true } }` | applied in `spawnEnemy` **after** JSON hydration |

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

### Testing

Node tests, committed and run in CI (**no Node on the dev machine — they cannot be run locally**;
in-browser verification is the local gate, same as rings and defeat-scenarios):

- `tests/perception.test.js` — the 3/2/3 adjacent split for all eight facings; range clamps; LOS
  interaction; `(0,0)` facing fallback; `sightRange 0`.
- `tests/awareness.test.js` — every ladder transition, including the turn-but-don't-advance beat and
  the calm-down path.
- `tests/noise.test.js` — promotion radius; the already-chasing-is-not-redirected rule (a direct
  port of today's `rockClatter` behaviour, so this is also a regression test).
- `tests/theft.test.js` — steal limit with and without passives; gold conservation; loadout removal;
  highest-value selection and its tie-break; `applyHostileFlip` leaving `_wasFlipped` alone.
- `tests/save-roundtrip.test.js` — extend for `_robbed` and the new enemy fields.

Also: `tools/balance-harness.mjs` and its golden diff should be re-run after Phase 1, since blind
spots change effective threat. Any golden movement is a finding, not noise.

### Build order

One branch, six phase-commits, each verified in-browser before the next. They are a dependency
chain, so there is no parallel-branch conflict risk (`feature/diagonal-prototype`, the only other
unmerged branch, is 328 commits behind and one ahead — a fossil).

| Phase | Ships | Verified by |
|---|---|---|
| **1** | `perception.js`, facing, `npc.js` sight check swapped over | Enemies have a blind spot; walking behind one is not noticed. **Biggest behaviour change in the feature — playtested alone.** |
| **2** | The awareness ladder | `?` → `!` observable; the turn-to-look beat exists; leash unchanged |
| **3** | Noise; `rockClatter` retires into `emitNoise` | The rock still works identically; a swing pulls attention |
| **4** | Threat rendering; `_drawAggroOverlay` retires; both dither treatments behind a toggle | Cones legible; pips correct; no mud over day/night or arena |
| **5** | `theft.js`, the wheel subtree, `applyHostileFlip`, `_robbed` | Full loop: sneak → rob → they hunt → zone re-entry keeps it. **Shove → Thieve works.** |
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

## Non-goals

Cover and crouch · per-tile properties (the audit's tag layer, §5.4 — this feature should *not* drag
it forward) · a sneak stance · player-side fog of war · a detection meter · NPC-on-NPC theft ·
witnesses · pickpocketing containers.
