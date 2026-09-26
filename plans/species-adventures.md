# Species Adventures — one town, many bodies

**Date:** 2026-09-15
**Status:** DIRECTION — ruled in the 2026-09-15 design session; nothing built yet
**Supersedes:** `plans/adventure-transition-plan.md` (the linear-adventure north star of 2026-04-05)
**Amends:** `plans/cosmology-and-arc.md` (NG+, the unlock); `plans/decision-trees.md` (sequential
unlock); `plans/gold-standard-design.md` Law 6d; `plans/enemy-kits-and-dots-design.md` §6;
`plans/give-action-and-disposition.md` (faction tier); `plans/quest-journal.md` (availability);
`plans/remembrance-rings.md` (what respawns). The reconciliation table in §7 is the record.
**Version placement:** Caelan, 2026-09-15: *"this is more like 0.3 … we're still figuring out some
pretty big things."* This document does not move the 1.0 bar and does not reorder the September
roadmap's next session (H1). It is the shape the game grows into, written down so it stops living
in chat.

---

## 0. The one-paragraph version

Violencetown keeps its hand-authored maps. What changes is what lives in them and who you are
while you walk them. Enemies come from a **type registry** with per-zone **spawn tables**,
**weighted drops** and a **respawn clock**, so a five-minute trip into the sewer is always
productive and never a "run". The map JSON becomes a **base**; a character's quest flags apply
**world layers** on top of it at load — a grate opens, a spawn table swaps, a vendor appears.
An **account** owns a **stash** and a list of unlocked **species**; each **character** is one
species on its own **adventure**, with its own quest flags and its own view of the town. Playing
the Wererat is not a costume: the sewer is friendly, Town is not, some quests are closed to you
and others exist only for you, and your first minute in the body is a cinematic that opens a
quest. Characters share a fiction, never state. There are no roguelike runs and no procedural
maps. The loss loop is the shipped defeat-scenario system, unchanged.

## 1. Why — the session's reasoning, kept

The question that opened the session was *"how much work to make Violencetown procedurally
generated?"* The audit answered it: not much, and not the right question. The engine is already
data-driven (map JSON with spawns / transitions / regions / containers; a generic quest engine;
a weighted, seeded defeat table; RNG state in the save). What is missing for procgen is an enemy
registry, drop tables, a spawn/respawn model and a map generator — and only the generator is
large. It is also the piece the wanted loop needs least.

The complaint underneath was *a monster gets designed once and seen once*. That is a content
consumption problem; respawning enemies in persistent zones fix it, random layouts do not. Every
game Caelan was picturing — Valheim's *pack up and go as far as you can*, Outward's wilderness,
RuneScape's quests, Hades' hub — is a persistent world with bounded loss and repeat expeditions.
RuneScape in particular: a fixed map, respawns, set enemy lists with weighted drops, and quests
that unlock parts of the world and teach mechanics instead of fetching. (Caelan: *"RuneScape has
some of the best quests in gaming."*)

The map was *"the one thing I've been struggling with and being the laziest with, the one thing I
don't want to skimp on."* A 30×30 JSON is cheap to author. What was expensive was the linear
30-hour story spine — chapters consumed in order, one-shot setpieces — and that is what this plan
retires, not the maps. ROADMAP.md already records a 2026-04-01 pivot *away* from procedural
generation; this plan agrees with that pivot and generalises the world it produced.

On authorship (raised and answered): procedural generation does not dodge "how much of this is
mine"; it moves authorship into the rules and pools. The rulings — content tone, the buff
philosophy, item-use, the Poition, and the ones below — are the authorship. Systems execute taste.

## 2. Rulings made 2026-09-15 (Caelan's)

Numbered so later docs can cite them as **SA-n**.

- **SA-1 Fixed maps.** Every zone stays a hand-authored map. No runtime map generation, ever
  (re-affirms cross-game-study G-2 / G-10).
- **SA-2 No runs.** A trip into a zone is an expedition from a persistent world, not a roguelike
  run. Defeat is the shipped bounded-loss scenario system. Nothing here adds permadeath.
- **SA-3 "Species", not "race".** The playable-body category is a *species* (skeletons and
  aliens included). The field is `species`, which `enemies.js` already asked for — its
  `sewerDweller` boolean is the first species flag (see §4.4).
- **SA-4 Species changes the world, not just the body.** Playing a species changes who is
  hostile and friendly *and* which quests exist for you. Not the same quest line in a
  different sprite. (Caelan: *"the second, for sure."*)
- **SA-5 Characters share a fiction, never state.** All characters "live in the town at the same
  time", but no character's progress alters another's world. No timelines, no cross-character
  layer conditions. Cameos are authored flavour — a human in the Wererat's story is an NPC, not
  the player's human character. The bridge is not open for the rat because the human opened it.
- **SA-6 No static gates.** Never a boulder you cannot move *yet*. An obstacle is solved
  differently per species (the rat swims, the ghost floats, the vendor is someone else) or is
  not there for that species. Foreshadowing-by-locked-door is ruled bad gameplay.
- **SA-7 The car quest is mostly mandatory, never identical.** Most species still meet the car;
  each meets it its own way, with its own options. A species may also auto-fail or auto-pass a
  quest it cannot perceive (a robot cannot see ghosts → the ghost quest resolves at spawn and
  ghosts do not load for it).
- **SA-8 Not post-game content.** The first species token drops early enough that the player is
  still hungry (the sewer, not the finale). The Arkham City / Catwoman failure — finishing as
  Batman and never touching the rest — is the thing to avoid.
- **SA-9 The first minute in a new body.** A species adventure opens with (a) a cinematic beat,
  not a text box; (b) a quest that starts inside that beat; (c) the disposition difference on
  screen at once — a rat that would have attacked the human walks past; a vendor backs away.
- **SA-10 Tokens are the carrier.** A beaten monster type can drop that species' token
  (weighted rare). Token → stash → chosen when a new character is rolled. (Recommendation 1 in
  §3 records how this meets the canon's boss-cutscene gate.)
- **SA-11 Version placement.** Not the 1.0 bar. The next roadmap session is unchanged.

## 3. Recommendations pending Caelan's ruling

Each was proposed 2026-09-15 with its reasoning; none is confirmed. Overturn in this file.

1. **Species unlock vs canon.** `cosmology-and-arc.md` L140 gates each creature behind its zone
   boss's cutscene and the player's *choice* to transform; `origin-stories-and-menu.md` L108 says
   *rare drops, not kill milestones*; SA-10 says a token drop. **Recommendation:** the boss carries
   a guaranteed token, mooks a rare one; the token goes to the stash; the *choice* happens at
   character creation. Keeps the cutscene, the choice and the drop.
2. **Zone order.** `decision-trees.md` L15 locks Sewer → Factory → Town → Circus → Graveyard;
   cosmology L128 says any order. **Recommendation:** the quest graph wins — a zone opens when a
   layer opens it, authored per zone and per species.
3. **Farming.** Gold Standard Law 6d ("respawns come back broke") and enemy-kits §6 ("farming
   stays closed") were written against a world with no respawn. **Recommendation:** respawns come
   back *with kit, without wallet*. Drop tables carry items, never gold. Gold enters through
   quests, vendors and the fence. 6d's intent survives; the sewer is still worth five minutes.
4. **What the clock respawns.** `remembrance-rings.md` L205 makes the world "strictly more
   permanent"; `_collectedItems` stops taken spawns from returning. **Recommendation:** enemies
   respawn; authored placements do not. Rings, the pipe, the Ray Gun stay one-of. Renewable loot
   comes only from enemies.
5. **New Game Plus.** Cosmology L83 / L176–184 use NG+ as the vehicle for changed NPC reactions
   and Sunpyre's unlock. World layers + species are that vehicle. **Recommendation:** remove NG+;
   reassign Sunpyre to a layer. *Reread the cosmology doc before ruling* — Sunpyre and Jersey's
   reveal are load-bearing there.

## 4. The model

Five nouns. Each is one unit with one job.

### 4.1 Account (new, shared)
A second persistent store beside the character save. Holds **only**: the stash (a container of
items) and the set of unlocked species. Nothing else crosses characters (SA-5). Save-schema rules
from GAME_STUDIO_PLAN apply: versioned, defaults for missing fields. The stash carries each
item's **heat** (`the-fence.md`: heat is per item id and never decays) so it cannot launder stolen
goods between characters.

### 4.2 Character (exists today as "the save")
Position, HP/MP, gold, bag, gear, rings, quest-engine state, tile diffs, containers, the
enemy list — everything `save.js` holds now — plus `species` and the **quest flags** that select
layers. One account, several characters; the menu lists them.

### 4.3 World = base map + layers
Map JSON is unchanged as the base. A **layer** is a small record:

```
{ id, when: <predicate over this character's quest flags and species>,
  map: 'sewer', spawnTable: 'sewer_after_gauntlet', transitions: [...],
  tiles: [{x, y, tile}], props: [...], npcs: [...], remove: [ids] }
```

Every field after `when` is optional. `_loadMap` reads the base, then applies every layer whose
`when` is true for *this character* (never another's, SA-5). Chapter One's bridge-north unlock is
the first layer, so this generalises what exists. The sewer's `"sealed": true` rooms are the
primitive precedent. Zone-identity's tile and prop tests must see any new tile id a layer places.

### 4.4 Species
```
{ id: 'wererat', name, sprite, startKit: [...], startMap, startLayer,
  allegiances: { sewer: 'friendly', town: 'hostile' },   // the faction tier
  cannotPerceive: ['ghost'],                             // SA-7 auto-resolve
  traits: { moonblockAllergy: true } }
```
- `species` is its own field on enemies and on the player. Allegiance stays *who you fight*;
  species is *what you are* (enemy-kits §5a ruled this). `sewerDweller` becomes a lookup on the
  species table rather than a boolean.
- A **faction tier** sits above per-NPC disposition (`give-action-and-disposition.md` excluded
  it; this adds it). At spawn, an NPC's starting disposition toward the player is read from the
  player's species' allegiance to that NPC's species. Per-NPC bribery and flips work on top.
  Law 0 holds: a species never changes max HP.
- Lore inherited: a playable Wererat is allergic to moonblock (cosmology L27).
- Perception: `cannotPerceive` feeds the stealth/perception rules so a robot does not *see*
  ghosts, and the quest engine's species gate auto-resolves quests that depend on them.

### 4.5 Quest graph
`quests.js` stays the engine. Quests gain `availableTo` (a species set or a predicate) and a
`speciesResolve` hook (auto-pass / auto-fail at spawn, SA-7). Completion sets flags; flags select
layers. The linear chapter spine becomes a graph whose edges are layers. **Cinematic beats**
(pan, zoom, freeze, flash, shake, prop event) are a data list a quest stage plays at its
boundary; game-feel §1B/§1C already spec zoom, flash, the death beat and low-intensity shake,
so this is a schema over shipped primitives plus pan and prop events. Zoom is the one needing
viewport work (`viewport.js` has no zoom level). No fetch quests: every quest opens and closes
with a beat. The journal stays retrospective (`quest-journal.md`); availability surfaces in the
world, not as markers.

### 4.6 Living zones
- **Registry:** one dict (`cross-game-study` G-14 — never per-type files) pulled out of the
  ~20 type strings now inlined across 14 map files; balance bands, tiers and variants live here
  and round-trip through `tools/balance-harness.mjs`. The parked `plan:plans/bestiary.md` is the
  design source for what goes in it, already grouped by zone.
- **Spawn tables:** per zone, weighted, tiered; a layer can swap a zone's table. A non-boss
  "wererat gang" variant is the first entry (defeat-scenarios-delivery #1 needs it).
- **Drop tables:** weighted item rows on a type (rec. 3: items, never gold). Kits stay 1–3 items
  so the ground never carpets (enemy-kits §3d). Species tokens are rows here.
- **Respawn clock:** on the turn counter. Mooks return; anchors and named NPCs do not (cosmology
  L209, mooks vs anchors). Respawns keep the `_muggedIds` wallet rule (rec. 3). Ruling A3 (does
  the REMOTICON cost a turn?) becomes load-bearing: a turn now also ticks respawns.

### 4.7 Population vs. threat — why this is Digimon and not GTA

> **Raised by Caelan, 2026-09-20**, thinking about how many NPCs should be alive at once and
> whether the game needs a crowd manager that spawns near the player the way Grand Theft Auto
> does. Recorded here because it is piece 1's question and it will be cold by the time piece 1
> is built.

**The split already exists in the code.** `ambient` is the line. Measured in the shipped town on
2026-09-20: **9 NPCs — 7 ambient, 2 not.** `fight-area.js fighters()` excludes ambient entirely,
which is why setting an enemy `chasing` does nothing until `ambient` is also cleared. Ambient
Violencians are the crowd; non-ambient enemies are the content. The registry and spawn tables
above belong to the second group only.

**A crowd manager solves a problem this game does not have.** GTA spawns in a ring around the
player because its world is too large to hold at once and the player may be anywhere in it. SA-1
fixed hand-authored maps, each small enough to hold whole. There is nothing to stream, so there is
no ring to manage.

**And near-player spawning would cost two things this game has already paid for:**

1. **"There are no witnesses" is true by construction.** `perceives()` is shared by the chase AI,
   the threat overlay and the fight fog (`plans/fight-fog.md`), so standing unseen genuinely means
   unseen. An enemy that can materialise beside you breaks that: you could be spotted by something
   that did not exist last turn, and the stealth planning surface becomes a guess.
2. **Turn-based cannot hide pop-in.** GTA gets away with despawning behind you because the camera
   is moving at speed. Here the player is looking at a static screen where one tile changing *is*
   the whole event.

**So: the Digimon model, which §4.6 already describes.** A zone's hostile roster is re-rolled from
its spawn table on entry, plus the respawn clock. The field feels alive because it differs each
time you walk in, never because it changes while you are watching it.

**What is worth taking from GTA is behaviour, not density.** What makes that world feel populated
is that its people are visibly doing something. The scaffolding for this already exists on every
NPC — `behavior`, `homeRegion`, `wanderRadius`, `wanderEveryTurns`, `wantsItems`, `depositsTo`,
`carrying`, `barks`, `fsmState`; the shipped town's ambient Violencians run `["IDLE","WANDER"]` at
`wanderRadius` 4–6. That, plus the deferred living-world chatter thread, is the GTA feeling.
Density is the cheap lever and purpose is the one that reads.

**Recommendation (Caelan endorsed the shape 2026-09-20; the detail below is still open):** keep
**ambient population authored and fixed per map** — the town's Violencians are characters with
homes and names, not extras — and put the re-roll on the **hostile roster only**. The open question
is whether *any* ambient population should vary by layer or time of day; that is a content
question, not a spawning one, and it does not block piece 1.


## 5. The pieces, in dependency order

| # | Piece | Size | Core files touched | Depends on |
|---|---|---|---|---|
| 1 | **Living zones** — registry, spawn/drop tables, respawn clock | S–M | `enemies.js`, `main.js` `_loadMap`, map JSON, balance harness | nothing |
| 2 | **World layers** — base + layers in `_loadMap`; Chapter One's bridge as layer 1 | M | `map.js`, `main.js`, `save.js` (flags) | 1 (layers swap spawn tables) |
| 3 | **Account + species** — account store, stash, species table, faction tier, character menu | M | `save.js`, `npc.js` / `ai.js` (disposition at spawn), menu | 1 (tokens), 2 (species layers) |
| 4 | **Cinematic beats** — the schema, pan + prop events, zoom in the viewport | M | `viewport.js`, `quests.js`, renderer | nothing; runs beside 1–3 |
| 5 | **Species adventures** — the Wererat first: intro beat, first quest, species-gated quests | content | `quests.js` data, dialogue, layers | 2, 3, 4 |

Pieces 1–3 each touch core files: short-lived branches, merged promptly (CLAUDE.md hygiene).
Piece 4 is file-disjoint from 1–3 and can run in parallel. Doing 3 before 2 was offered (a
playable Wererat sooner, replaying identical world state until layers land) and not chosen; the
order above stands. Whether piece 1 precedes H1 (the combat HUD) is unruled; the roadmap's next
session is unchanged (SA-11).

**Anti-pattern watch** (GAME_STUDIO_PLAN L223, *building engine, not game*): the registry, the
layer applier and the account store are each small. The proof of the whole thing is one
Wererat waking in the sewer with a rat walking past. Build toward that screen.

## 6. Out of scope, on purpose
- Procedural maps, chunk worlds, city shifting (dead since 2026-04-01; stays dead).
- Roguelike runs, permadeath, "hop to next in roster" (`death-respawn.md` is superseded).
- Party / creature recruitment — unchanged post-1.0 thread; a species is a body, not a party.
- Cross-character interaction of any kind (SA-5). Multiplayer.
- Stat growth, levels, item stat randomisation (`game-research-findings` L41/L75/L100 stand).

## 7. Reconciliation — every plan this touches

Verified 2026-09-15 by reading each file against this direction.

| File | Verdict | What changes |
|---|---|---|
| `adventure-transition-plan.md` | **SUPERSEDED** | Was "ACTIVE — the new north star": a linear adventure with a beginning, middle and end; "no origins, you're Human" (L259); creatures as party members, not identities (via game-zones L20). Its LOCKED combat math (L95–99) is unaffected; its checkpoint death (L104) was already superseded by defeat-scenarios. Banner added. |
| `cosmology-and-arc.md` | AMENDED | L210 per-character map variation and L197 persistent flags are *this plan*, already canon. L140 unlock and L83/L176 NG+ → rec. 1 and 5. L209 mooks vs anchors governs the respawn clock. Lore (two poles, moonblock, six-cast spine, Sunpyre singular, KND rule) untouched. |
| `game-zones.md` | AMENDED | L20 "party members, not swappable identities" overturned by SA-4; Act table L35–42 → quest graph; zone element/hazard inventories become layer material; open q5/q6 (native creatures wandering) answered by spawn tables. The Town→Street rename never happened and still isn't. |
| `decision-trees.md` | AMENDED | L15 sequential unlock → rec. 2; Decision 2 (L86–108) resolved as unlock-and-choose via layers. Locked lore L42–50 respected. |
| `origin-stories-and-menu.md` | partly REVIVED | L7 "choose a creature", L102 origins found in the world, L108 monster runs as rare drops — all live again via species; its chunk-world substrate stays dead. |
| `game-research-findings.md` | AMENDED | L98 "rare drops, not kill milestones" vs SA-10 → rec. 1. Run-framing (L59/L62) retired. Fixed-identity items, no stat growth, Wealth = Danger stand. |
| `cross-game-study.md` | UNTOUCHED | G-2/G-10 (no procgen) re-affirmed; G-14 one dict binds the registry; L332 (the behavior array conflates disposition, FSM and faction) is the split §4.4 makes. |
| `gold-standard-design.md` | AMENDED | Law 6d restated per rec. 3. Laws 0–5 and 7 bind species and tiers. |
| `balancing-bible.md` | AMENDED | Role table gains tiers/variants; every spawn table round-trips the harness. Its stale "loot stays liquid gold only" (L129) contradicts gold-standard L223 regardless of this plan. |
| `enemy-kits-and-dots-design.md` | AMENDED | §6 farming rule → rec. 3; §3b role-default fallback becomes the spawn-table default; §5a's species field is §4.4. |
| `npc-spawning-ai.md` (+ `plan:` copy) | SUPERSEDED | Chunk-based; harvest its registry shape (name / hp / armor / behavior / spawn biome / loot table). Its out-of-scope "faction system" and "respawning" are exactly this plan. |
| `death-respawn.md` | SUPERSEDED | Already by defeat-scenarios; Option C "hop to next in roster" is not species. |
| `defeat-scenarios.md` / `-delivery.md` | UNTOUCHED | The loss loop. Its unwritten System 2 (mobs respawn, the world shifts when a boss falls) *is* pieces 1–2. Delivery #1's "wererat gang" is spawn-table row one. Worn gear survives defeat (its ruling 3) holds. |
| `give-action-and-disposition.md` | AMENDED | Adds the faction tier above per-NPC disposition (L73 excluded it). Per-NPC bribery and flips unchanged. |
| `stealth-perception-and-thieve.md` | AMENDED | Species sets `allegiance` / `fsmState` at spawn via the faction tier; `cannotPerceive` joins the perception rules. Clean-theft rulings unchanged. |
| `the-fence.md` | AMENDED | Heat rides items into the account stash. |
| `remembrance-rings.md` | AMENDED | "strictly more permanent" scoped to authored placements (rec. 4); rings stay per-character; the rat-form save edge case (L242) is a species precedent. |
| `quest-journal.md` | AMENDED | Availability lives in the world, not the journal; no markers (L47/L84 hold); open q4 per-creature perspectives is now real. |
| `game-feel.md` | AMENDED | §1B/§1C beats become data (piece 4). |
| `sewer-npc-skeleton.md` | AMENDED | `sealed` rooms are layer precedent; edge case 7's "spawn fresh items on a timer" is the respawn clock, enemies only. |
| `economy-merchants.md` | already SUPERSEDED | Its Q6 (creature-specific prices) is a species-table concern for later. |
| `zone-identity.md`, `zone-room-sketches.md`, `plan:plans/world-structure.md` | UNTOUCHED | Layers place only registered tiles and props; the map graph is the base. |
| `demo-readiness.md` | AMENDED | The chapter seam is where the quest graph takes over. (P2 deleted the orphaned `_endChapterOne()` on 2026-09-25; the bridge cutscene is the seam.) |
| `plan:plans/bestiary.md` | AMENDED | Design source for the registry; migrate to `dev` before piece 1. |
| `plan:plans/next-session-open-work.md` | AMENDED | A3 load-bearing; A4/B1 tiering answered by the registry. |
| `roadmap-2026-09.md` | AMENDED | Points here as a lane; next session unchanged. |
| `ROADMAP.md` (root) | stale | Phase 4 "creature hopping" was this idea's ancestor. Already marked REWRITE by the adventure plan; still owed. |
| `GAME_STUDIO_PLAN.md`, `architecture-and-game-feel.md` | UNTOUCHED | Process and vanilla-JS rulings bind as ever. |

## 8. Open questions (real ones)
- Piece 1 before or after H1? (SA-11 leaves the next session alone.)
- Recommendations 1–5 above.
- Which species ship after the Wererat, and which zone boss carries each token.
- What the character menu looks like (origin-stories L7 is the seed; needs its own design pass).
- Does heat ever decay (the-fence open question) — matters more once a stash exists.
