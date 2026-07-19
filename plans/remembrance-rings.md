# Feature: Remembrance Rings — the adjacency-fusion perk axis

**Phase:** Progression / build system — the backbone build layer.
**Priority:** High (Caelan: *"this is part of the backbone of it"*).
**Status:** Design (approved 2026-07-19).
**Supersedes:** `plans/ring-builds-ability-axis.md` + `plans/ring-builds-implementation.md`. That
system — the learned-pool / equipped-loadout store shipped as `game/skills.js` — is **absorbed**
here. Note the naming trap: "ring builds" there meant the *action wheel's* concentric rings. In
this spec, rings are literal jewellery worn on fingers.

> **Decisions (Caelan, 2026-07-19):**
> - **Merge, not coexist** — rings are the ONE slotting system; `skills.js` folds in.
> - **Rings carry earned perks only** — the base kit (fists, `fireball`, `coneOfCold`) stays innate
>   and always on the wheel. Every ring is a gift, never a replacement for what you already had.
> - **6 visible slots**, 3 per hand, unlocked in symmetric pairs **2 → 4 → 6** … plus **hidden**
>   thumb (→8) and pinky (→10) reveals.
> - **Adjacency is the engine** — neighbouring rings buff each other, and authored pairs **fuse**
>   into entirely new abilities.
> - **Remembrance material drops → fashioned into a ring at Platero**, a jeweller in Downtown.
> - **All runtime ground drops persist per-zone.**
> - **Unrevealed fingers render bare** — no socket, no lock, no tease.

---

## Gate 1: Research

### Genre References

- **Elden Ring — Remembrances.** A boss's memory as a physical object, carried to an NPC and spent
  to become one of several rewards. Source of the core idea: *the item IS the memory of the fight.*
- **The Witcher 3 — Mutagens.** Slotted alongside skills, where *committing* to a matching
  archetype amplifies the payoff. Source of the location-based pressure that makes slotting a
  decision rather than an inventory chore.
- **Far Cry 3 / Baldur's Gate 3 — going further than the player believed possible.** The
  wingsuit-and-grappling-hook goodwill: a game rewarding the player's suspicion that there might be
  more. Source of the hidden thumb/pinky reveal.
- **Deckbuilder relic/joker adjacency (Balatro, Slay the Spire).** One new piece detonating many new
  possibilities — the target feel for every ring acquired.
- **NetHack `struct prop`** (inherited from the superseded spec). Still the shape of the
  source-merge: a property is active if granted by ANY source and not blocked.

### Player Experience Goal

> *"Every boss I beat leaves me something I can wear, and every new ring I slot beside another one
> might invent a skill I've never seen. The hands I'm building ARE my memory of the game so far."*

### Technical Feasibility (verified 2026-07-19 on `dev` @ `1b5ce56`)

**Already in place — this system leans on it:**

- `game/skills.js` — the learned-pool / equipped-loadout store. **Absorbed by this system.**
- `_refreshGrantedSkills` (`main.js`) merges `base ∪ equipped ∪ gear` into `knownSpells` /
  `grantedTricks`; the wheel reads those two lists. **Rings become a new source feeding the same two
  outputs — so the wheel itself needs almost no change.**
- `questItem: true` is already a first-class protected flag: blocks sell / throw / give / smash and
  survives player death (`main.js:2497`, `:3897`, `:4734`; `trade.js:63`).
- Enemy-death → ground-drop already exists: `main.js:3563` pushes the catalytic converter onto
  `groundItems` at the dead enemy's tile. **The remembrance drop needs no new mechanism.**
- `_collectedItems` (`main.js:334` / `:519` / `:2803`, `save.js:92`) already stops taken spawns from
  respawning, and is persisted. It is the direct model for the new dropped-items layer.
- The Remoticon device already has a tabbed body + tap routing (`deviceEquipLayout`, `_tapDevice`) —
  the hands UI reskins its SKILLS tab.
- Ground items **do not decay**. There is no TTL anywhere in the codebase.
- Disposition and the Gold Card / GP both exist, and are the natural gates for "cool" and "fancy".

**Gaps this feature must close:**

- `_loadMap` (`main.js:516`) rebuilds `groundItems` from **authored spawns only**, so any runtime
  drop is erased on zone re-entry. Compound failure: take an item at (5,5), drop it at (10,10),
  leave and return → the (5,5) key sits in `_collectedItems` so it won't respawn there, *and* the
  (10,10) copy is wiped. **The item leaves the world entirely.** This is live item-loss, not merely
  a persistence gap.
- `GRATE` is `walkable: false` (`data.js:12`); rat-form needs a transform-aware walkability check.
- Worker NPCs can consume ground items, gated only by `npc.wantsItems` (`npc.js:376`). Needs a hard
  `questItem` guard so no future content author can make a remembrance vanish by accident.

### Scope (MVF)

Ring data model + tags · the ten-slot hand store with the visible-6 / hidden-4 unlock ladder ·
within-hand adjacency + generic resonance + an authored fusion table · the hands UI (Remoticon tab)
with bare unrevealed fingers · Platero's fashioning flow · persistent runtime drops · the wererat
worked example end-to-end.

### Out of Scope

The full ring roster and fusion table (content — the long tail, explicitly Caelan's authoring job) ·
3+-ring chain fusions (pairs only this pass; the chain geometry is built so triples can layer on
later) · ring rarity / upgrade tiers · respec costs · any change to weapon-granted abilities
(weapons keep granting exactly as they do today).

### Risks

1. **Combinatorial content burden.** N rings → N² pairs, against a promise of "one ring, ten new
   possibilities."
   → **Mitigation:** fusions key on **tags, not ring ids**. One authored `vermin × fire` recipe
   covers every vermin ring against every fire ring. The generic resonance fallback means
   unauthored pairs still pay out, so the table can grow lazily without dead zones.
2. **Absorbing `skills.js` mid-flight.** It shipped recently and touches save + wheel.
   → **Mitigation:** rings feed the same `knownSpells` / `grantedTricks` outputs, so consumers don't
   change shape. Old save fields are ignored (save compatibility explicitly deprioritised).
3. **The reveal leaking.** If any UI element, log line, tooltip, or save inspection hints at
   thumb/pinky before unlock, the joke dies and cannot be recovered.
   → **Mitigation:** unrevealed fingers render with *no socket at all*; no code path may narrate a
   hidden slot. Treat as an explicit review checklist item, not a hope.

---

## Gate 2: Design

### The ring

```js
RING = {
  id:   'rat_ring',
  name: '[Rat Ring]',
  description: 'A braid of coarse wererat fur set in dull silver. It twitches when you are not looking.',
  tags: ['vermin', 'sewer'],          // family/element — the fusion key
  remembranceFrom: 'wererat_boss',    // whose memory this is
  passive: { evasion: +5 },           // optional — always-on while slotted
  trigger: null,                      // optional — { on:'hit', effect:'ignite', chance:0.25 }
  grants:  'rat_form',                // optional — an active; feeds the wheel
}
```

A ring may carry any mix of `passive` / `trigger` / `grants`. **Tags are the connective tissue** —
they drive fusion, resonance, and flavour.

### Slots, hands, and the unlock ladder

Anatomical order per hand: `thumb – index – middle – ring – pinky`.
Slots unlock in this order, **lighting the same finger on both hands at once**:

| Tier | Finger unlocked | Slots | Adjacent pairs | Player-facing meaning |
|---|---|---|---|---|
| 0 | ring *(start)* | 2 | 0 | Rings act alone |
| 1 | middle | 4 | 2 | **Rings combine** |
| 2 | index | 6 | 4 | Chains of three |
| **3 (hidden)** | **thumb — "cool enough"** | **8** | **6** | the menu grows |
| **4 (hidden)** | **pinky — "fancy enough"** | **10** | **8** | full hands |

Because unlocks proceed ring → middle → index → thumb → pinky, each hand's unlocked set is **always
anatomically contiguous**. Therefore:

> **Two slots are adjacent iff they sit on the same hand, are anatomical neighbours, and are both
> unlocked.** Adjacency never crosses hands.

That is precisely what makes tier 0 a deliberately combo-free teaching state — the two starting
rings sit on *opposite* hands — and makes tier 1 the staged **"rings combine"** reveal. **Tier 1
must land early**, around the end of the tutorial arc, so the combo layer opens while every new ring
still feels explosive.

Tiers 3 and 4 **double the combination surface (4 pairs → 8)** *after* the player has concluded the
system is finished. Gating: **thumb on disposition** (you became cool enough that people notice) and
**pinky on the Gold Card / GP** (you became fancy enough to wear one) — the only two progression
gates in the game not earned by beating something. Neither should land too late.

### Adjacency resolution — resonance and fusion

For every adjacent pair of slots where **both** hold a ring:

1. Build an unordered, sorted tag-pair key from the two rings' tags.
2. **Authored fusion exists?** → grant its ability, and record the discovery permanently.
3. **Otherwise** → apply a small generic **resonance** bonus.

```js
FUSION = {
  pair: ['vermin', 'fire'],           // unordered tag pair
  id:   'ember_rat',
  name: '[Ember Rat]',
  description: 'A rat of cinder and grudge, conjured and sent scurrying. It does not come back.',
}
```

Three invariants, all downstream of *buffs must feel given*:

- **Fusions add; they never replace.** Both rings keep their own effects at full strength.
- **A fusion costs no slot.** It emerges from the pair.
- **Every adjacent pair pays something.** Experimentation never dead-ends. An authored fusion is the
  jackpot, not the price of admission.

### UI/UX Specification

- The Remoticon's SKILLS tab becomes **THE HANDS**: two hands, anatomically complete, drawn at all
  times.
- **Unrevealed fingers are drawn bare** — no socket, no lock icon, no `???`. The player concludes
  the system is three fingers per hand. On unlock, a socket *appears* on a finger that was always
  right there in front of them.
- The **visible progress bar** is the locked-but-shown middle/index sockets *within* the three known
  fingers. Thumb and pinky live entirely outside that frame.
- **A spark on the link** between two adjacent rings signals *a fusion exists here* without naming
  it. Slotting reveals its identity; discovered fusions are recorded permanently in a log.
- Log lines follow house tone: `[The rings agree. Something new is possible.]`, never
  `Fusion unlocked.`

### Acquisition — Platero

Defeated foe → drops a **remembrance material** (`questItem: true`) onto the ground at the tile where
it fell → the player carries it to **Platero**, a jeweller in Downtown → it is fashioned into the
ring. The material is the chess pawn taken off the board; Platero is where a memory becomes
wearable.

### Persistence

A new per-zone **dropped-items layer**, mirroring `_collectedItems`: every runtime drop (player-
dropped or death-dropped) is recorded against its map and restored on zone re-entry. Nothing that
fails to respawn today begins respawning — this makes the world strictly *more* permanent. Plus the
`questItem` guard on `npc.wantsItems` matching.

### Integration Map

| Module | Change |
|---|---|
| `game/rings.js` | **Create.** Pure store: slot model, adjacency computation, resonance/fusion resolution, unlock ladder. Node-testable, no DOM. |
| `game/ring-data.js` | **Create.** The ring roster + fusion table (content). |
| `game/skills.js` | **Absorbed** — its store role moves to `rings.js`. |
| `game/main.js` | Ring state; `_refreshGrantedSkills` → `_refreshFromRings`; unlock hooks; transform-aware walkability. |
| `game/renderer.js` | The hands UI in the device body. |
| `game/layout.js` | Hand/socket rects, shared by draw **and** hit-test (never diverge them). |
| `game/items.js` | Remembrance materials; Platero's fashioning verb. |
| `game/save.js` | Four-touch for owned rings, slot assignments, unlock tier, discovered fusions, dropped-items layer. |
| `game/npc.js` | `questItem` guard on `wantsItems`. |
| `game/data.js` | Transform-aware `GRATE` walkability. |
| `game/wheel-model.js` | Unchanged in shape — still reads `knownSpells` / `grantedTricks`. |

### Save/Load Impact

Persist: `ownedRings`, per-slot ring assignment, `unlockTier`, `discoveredFusions`, and the per-zone
dropped-items map. Old saves start with an empty collection; the superseded `learned*` / `equipped*`
fields are ignored without throwing. **The unlock tier must never leak the existence of tiers 3–4 to
a player who has not reached them.**

### Edge Cases

1. Slot a ring whose fusion partner is later unslotted → the fused ability disappears cleanly from
   the wheel; both rings keep their own effects at full strength.
2. Unlock a tier while rings are already slotted → new sockets appear empty; existing adjacencies
   are untouched, new ones simply become possible.
3. The same tag pair adjacent twice (once per hand) → the fusion grants **once**; the second pair
   falls back to resonance. No double-dipping.
4. A ring whose multiple tags match multiple fusions on one pair → resolve deterministically by
   authored priority, never randomly.
5. Rat-form active when the player saves while standing in a `GRATE` tile → on load, either the
   transform restores or the player is ejected to a walkable tile. **Never load into a wall.**
6. Rat-form expires *while* standing on a grate → same ejection rule.
7. A remembrance material dropped in a zone the player never revisits → persists indefinitely. That
   is intended, not a leak.
8. Old save carrying populated `learnedTricks` / `equippedTricks` → ignored gracefully.

### Done When

> Beat the wererat → **[Tuft of Wererat Fur]** drops on the tile where it fell → leave the sewer
> entirely, come back, **it is still there** → carry it to Platero in Downtown → it becomes the
> **Rat Ring** → slot it → *rat-form (3 turns)* appears on the wheel → cast it → `GRATE` tiles
> become walkable → squeeze through → take the **[Red Cape]** → later, at tier 1, slot the Rat Ring
> beside a Fire Ring → a spark appears on the link → **Ember Rat** is discovered and castable →
> save, reload, everything holds. Console clean.

---

## Content principle — a standing rule for this system

Remembrance effects conjure **ghosts and elementals — never gore, viscera, or animal cruelty.** The
Ember Rat is a rat of cinder and grudge, conjured from the memory of the sewer; it is not a live
animal set alight. This is a constraint on the whole system, not a note about one ring, and it
applies to every remembrance authored from here on. It is also the better fantasy: a summoned
fire-rat is more magical than a cruel one.

---

## Gate 3 / 4 (filled during implementation)

- **Branch:** `feature/remembrance-rings` off `dev`.
- **⚠️ Merge-hygiene blocker:** `feature/defeat-scenarios` is built, verified, and unmerged, and it
  touches `main.js` (+311), `renderer.js` (+268), `layout.js` and `items.js` — four of the files this
  feature rewrites. **Merge it to `dev` before starting this work.** (`feature/diagonal-prototype`
  is ancient — missing `skills.js`, `ai.js` and ~368 commits of `dev` — not a real collision, but
  worth pruning.)
- **Verification:** in-browser via `python dev-server.py 3001` + `window.__game` (no local node);
  node unit tests for `rings.js` (adjacency, resonance/fusion resolution, the unlock ladder) and the
  save round-trip, run in CI.
- **Sequencing (impl-plan):** (1) pure `rings.js` + tests → (2) the persistence layer for runtime
  drops → (3) ring state in `Game` + the source-merge → (4) the hands UI → (5) Platero + the wererat
  content chain → (6) the hidden tiers. Verify after each.
