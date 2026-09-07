# Roadmap — September 2026

**Compiled 2026-09-07, at the close of the visual/animation/zone-identity sessions.** This is the
**entry point** for picking up work. It consolidates and *verifies against `dev`* every open item
from: `plan:plans/next-session-open-work.md` (2026-07-25), `plan:plans/undeveloped-backlog.md`
(2026-07-23), `plans/systems-audit-2026-08.md` §7, `plans/demo-readiness.md` §2, ROADMAP.md's
pending decisions, and the three passes that landed this week.

> **Why this exists (Caelan, 2026-09-07):** *"my lack of visibility into what we're working on next
> makes it hard for me to visualize what features and plans build on each other. Most of this is in
> my head."* So this document's job is the **dependency graph**, not the list. The lanes below are
> ordered by what unblocks what.

> **Supersedes** `next-session-open-work.md` and `undeveloped-backlog.md` as the starting point.
> Both were accurate when written; **seven of their items have since shipped** and are listed in
> §6 so nobody re-does them. The `plan` branch itself is six weeks stale — see §5.

**State right now:** `dev` @ `13c61ea`, pushed. `main` @ `38a44c2` (v0.21.0), **24 commits behind,
deliberately** — nothing from this week is on the live site. Suite 1179 / 213 / 0 failures.

---

## 0. The dependency graph

Read this before the lanes. An arrow means "left must land before right is buildable."

```mermaid
flowchart LR
    classDef ruling fill:#f3d9a4,stroke:#8a5a2c,color:#2a1f06
    classDef ready fill:#cfe8c9,stroke:#3a6b35,color:#0f2a0d
    classDef design fill:#d9d4ee,stroke:#5a4a8a,color:#1f1a33
    classDef later fill:#e6e6e6,stroke:#777,color:#333
    classDef now fill:#f7c8b8,stroke:#a33a1e,color:#3a0f05

    SHIP["Ship v0.22.0 to main<br/>24-commit fast-forward"]:::now
    GY["Zone §3 graveyard props<br/>(reverted — redo)"]:::now
    INT["Zone §1 interiors"]:::now
    R_INT["RULING: vendor Interior Pack?<br/>proxy vault + slots?"]:::ruling
    R_INT --> INT
    GY -->|"proves the prop system"| LAMP["Streetlights as 2-cell props"]:::later

    A1["RULING A1: −15 armor band"]:::ruling
    A4["RULING A4: _boss tag"]:::ruling
    PIKE["Author Pike's kit"]:::ready
    BOSS["B1: first real boss<br/>Law 5 executes"]:::ready
    ZBOSS["Zone bosses: Financier,<br/>Bigfoot, Alien, Deity"]:::later
    A1 --> PIKE
    A1 --> BOSS
    A4 --> BOSS
    BOSS --> ZBOSS

    B2["B2: enemies EAT their kits"]:::ready
    A3["RULING A3: does the bag<br/>cost a turn?"]:::ruling
    A3 -.->|"Law 7 stays true"| B2

    TAG["Tag layer on items /<br/>enemies / tiles"]:::ready
    MATRIX["Affordance matrix<br/>(verbs × tags)"]:::design
    FREEZE["Freeze the verb list"]:::design
    TAG --> MATRIX --> FREEZE

    RINGS["RULING: rings —<br/>author to ~12 or cut"]:::ruling
    DZ["RULING: TheDangerrZone —<br/>freeze at a tag or delete"]:::ruling

    LANT["Light + Lantern"]:::later
    WILD["Wilderness explorable"]:::later
    LANT --> WILD

    EX["Layered examine"]:::ready
    GRAP["Grapple-hook swing"]:::ready
    RAY["Ray Gun pickup +<br/>carnival rename"]:::ready
```

Three things the graph makes visible that the lists did not:

1. **Two cheap rulings (A1, A4) gate the entire boss line**, which gates the four zone bosses.
   Nothing about a boss can be built until the −15 band has a Law 4 row.
2. **`B2` (enemies eat their kits) depends on nothing.** The machinery exists. It is the single
   highest-leverage build on the board and has been sitting unblocked since July.
3. **The zone-identity work and the combat work do not touch each other.** They can proceed in
   parallel sessions without file collisions — zone work lives in `sprites.js` / map JSON, combat
   work in `npc.js` / `combat.js` / `enemies.js`.

---

## 1. NOW — in flight on `dev`

| Item | State | Size | Doc | Blocked by |
|---|---|---|---|---|
| **Ship v0.22.0 to `main`** | Caelan's call; deliberately held. A clean fast-forward + version bump in 3 files + annotated tag. The demo-readiness doc's own headline: *"nothing else is worth as much."* | S | `plans/demo-readiness.md` §0 | nothing |
| **Zone §3 — graveyard graves as props, circus tents** | **Started and REVERTED** (agent died mid-edit; left 96 props with no `PROP_SPRITES` entries — graveyard would have rendered empty). Art is generated and registered. **Define `PROP_SPRITES` first, then edit the map.** | M | `plans/zone-identity.md` §3 | nothing |
| **Zone §1 — interiors get a vocabulary** | Blocked on two rulings (§2). Floors already solved via `rlOutlined_packed.png`. **No interior wall exists in any bundled sheet.** | M | `plans/zone-identity.md` §1 | Z1, Z2 |

---

## 2. RULINGS CAELAN OWES — cheap, and each one gates something

Ordered by how much each unblocks.

| # | Ruling | What it gates | Source |
|---|---|---|---|
| **A1** | **The −15 armor band has no Law 4 row.** Is `bruiser` 15–40 GP right, or does −15 fold into fodder / standard? | Pike's kit, the Borgir boss, **the entire boss line** | `next-session-open-work` A1 |
| **A4** | **Boss band derivation.** The Wererat lints as *standard*. A `_boss` tag overriding armor→band is the obvious shape. | B1 first boss | A4 |
| **A3** | **Does opening the REMOTICON cost a world turn?** Load-bearing now DoTs are live — a bag-open would cost a poison tick, undoing Law 7's "reading your bag is free." Proposed (systems-audit §6): *free out of combat, costed in combat.* | Whether Law 7 is true; B2's feel | A3 |
| **A2** | **Poison-flip direction.** The downward mirror of the ally-flip was chosen, not derived. Confirm or replace. | Nothing to build; a correctness question | A2 |
| **Z1** | **Vendor `Roguelike Interior Pack`?** CC0, same pattern as RPG Urban, and *the only source anywhere with a counter.* | Zone §1 interiors | `zone-identity` §1 |
| **Z2** | **No slot machine or vault door exists in any pack.** Ship a boxy-cabinet proxy, or leave them text-only? (A cabinet-as-vault is the same class of compromise as the hooded-figure-as-rat.) | Zone §1 interiors | `zone-identity` §1 |
| **B3** | **Cone of Cold** — 1.40 dmg/MP against a 1.50 floor. **Still the lone balance-lint flag** (re-verified 2026-09-07). Retune or widen the band; a permanent flag trains everyone to ignore the lint. | Lint credibility | B3 |
| **R** | **Rings: author to ~12, or cut.** Five exist. | Whether the ring system is a feature or a fossil | systems-audit §3.1 |
| **DZ** | **TheDangerrZone — freeze at a tag or delete.** Eight `*-TheDangerrZone.*` files still ship in `game/`, unreachable from `index.html`. | Repo clarity | systems-audit §3.3 |
| **D1** | **`feature/diagonal-prototype`** — 517 commits behind dev; its diff *deletes* rings, xmb, the balance harness. Delete, or label as archive. | Branch hygiene | D1 |
| **P1** | **Phone tap targets render at 0.62× designed size** — nothing clears Apple's 44pt. Options: fewer logical px on narrow viewports / a touch layout / accept phone as secondary. *A design decision, not a bug.* | Mobile demo viability | `demo-readiness` §2.1 |
| **P2** | **"End of Chapter One" does not exist.** `_endChapterOne()` is called from nowhere; the bridge drops you into Chapter Two. Delete the orphan, or give the demo a curtain. | Demo has a stopping point | `demo-readiness` §2.2 |
| **V1** | **Theft-aiming volume** — aiming a theft puts all nine town cones back. Correct information, possibly too much. Scope to the theft's range if so. | Feel | `visual-pass.md` |
| **V2** | **`Lire` has no lion.** Allowlisted unsprited rather than given a bad pick. | One sprite | `visual-pass.md` |
| **V3** | **Canvas rung spacing — shipped as accepted.** A small window loses up to ~47%. The real fix (adaptive backing store) is its own session. Reversible. | Small-window play | `visual-pass.md` |
| **AU** | **Audio discoverability.** Ships muted (ruled, correctly). Nobody discovers audio exists. Wants a visible speaker glyph — *not* autoplay. | Demo polish | `demo-readiness` §2.3 |

---

## 3. READY TO BUILD — design settled, a plan exists

| Item | Size | Blocked by | Doc | Where the doc lives |
|---|---|---|---|---|
| **B2 — enemies eat their own kits** | M | nothing | `resolveLoadout` hands back real defs; kits drop on death; **no AI ever spends one.** Only wallet-spend is `healPurchase`, which burns *gold* rather than eating the bread it holds. Diegetic, visible, drains the nameplate pips — the payoff they were built for. | `enemy-kits-and-dots-design.md` (dev) |
| **B1 — first real boss, Law 5 executes** | L | **A1, A4** | Roster has no elite or boss. `ROLE_BANDS` defines both. Law 5 (bosses break the band by *spending*) never implemented; the wallet machinery it needs now exists. | `gold-standard-design.md` (dev) |
| **Layered examine** | M | nothing | Examine never dead-ends: one `resolveExamine` ladder (instance → creature → item → tile → generic). Full brainstorm + 3-task TDD plan. **Not built** (re-verified). | `layered-examine.md` (dev) |
| **Grapple-hook swing** | M | nothing | The hook is already earned three ways and the canyon exit is gated on it. Replaces the placeholder `requires:grappling_hook` transition with an anchor-to-anchor swing. **Not built.** | `grapple-swing.md` (**plan branch only**) |
| **Ray Gun pickup + carnival rename** | S | nothing | Ray Gun is fully defined and **unobtainable** — no map places it. `circus-map.json` → `carnival-map.json` to match its zone label. **Neither done.** | `ray-gun-and-carnival.md` (**plan branch only**) |
| **T1 — Tag layer** on items / enemies / tiles | M | nothing | Not built. Prerequisite for the affordance matrix. | systems-audit §5.4 |
| **C1 — seven unreachable `Escape` branches** + the dead `ITEM_THROW_DIR` mode | S | nothing | Shadowed by an earlier guard in `main.js`. | C1 |
| **C3 — input asymmetries** | M | nothing | REMOTICON item/gear/ring actions are pointer-only; aiming, turn-in-place and the 1–9 hotbar are keyboard-only. Documented honestly; still gaps. | C3 |
| **C4 — `mystery_meat` can't heal on the throw path** | S | nothing | `combatAttack`'s `Math.max(1, raw − armor)` clamps a would-be heal to 1 damage. Cheapest fix: make it a 1-turn health poition instead of flat damage. | C4 |
| **Zone §2 residual** | S | nothing | `BOSS_FLOOR` (6) and `FACTORY_FLOOR` (40) *still* share `tinyDungeon (9,4)` — 2 cells in the sewer boss room. Missed when Sewer moved off that sheet. | `zone-identity.md` §2 |
| **Housekeeping** | S | nothing | Prune two stale worktrees (`great-wing`, `objective-volhard`, both clean at v0.19.0); ~60 local branches whose remotes are `gone`. Migrate or archive the 24 `plan`-only docs (§5). | this doc |

---

## 4. NEEDS A DESIGN PASS before it is buildable

| Item | Open questions | Size | Doc | Blocked by |
|---|---|---|---|---|
| **Affordance matrix** — verbs (~20 wheel leaves) × tags | The discipline: *a blank cell is a decision, not an oversight.* Second job is diagnostic — a proposed element with zero edges is caught at design time. Needs the tag layer first. | M | systems-audit §9 | T1 |
| **Directional frames for every NPC, retire the chevron** | Violencians face their travel now. Extending to guards makes the overlay's facing chevron redundant — the stealth read becomes native to the art. Needs the other rpgUrban rows assigned. | M | `animation-pass.md` §4 | nothing |
| **"The Crat"** — sewer diplomacy talk-quest | How ambiguous the tell is; father-flip vs. "you are not the mother"; player as arbiter vs. bribeable; reward. Reconcile with the shipped sewer canon first. | M | `sewer-crat-quest.md` (**plan only**) | nothing |
| **Bestiary** — Cave + Weredigo (invisibility / blind-combat boss), Park + Ruffian (steal-and-flee via `transferGold` + `fleeStep`), Bear (friendly quest-giver), content enemies | Special mechanics? Which Kenney cells? Ruffian cleanly reuses two shipped systems and is the best first piece. | S–M each | `bestiary.md` (**plan only**) | nothing |
| **Elemental coverage matrix** | `fire` and `poison` joined `sludge` / `cold` / `energy` / `fear` with no weakness table to sit in. | S | E | nothing |
| **5-Zone Body reconciliation** | Survives as the positional layer (Back = backstab ×1.5), not split HP pools. Needs a ruling before the bible states it as law. | S | E | nothing |
| **Canvas adaptive backing store** | The real fix for V3: let the backing store follow the window so every size is exact. Touches the renderer's boot path. | M | `visual-pass.md` | nothing |

---

## 5. POST-1.0 — big threads, scoped, none started

| Thread | One line | Size | Blocked by |
|---|---|---|---|
| **Zone deep content / bosses** | Financier (Street — a literal `dialogue.js` placeholder), Bigfoot (Carnival), Alien Invasion (Factory — where the Ray Gun should ultimately drop), The Deity (Graveyard). **Gated on B1.** | L, zone by zone | B1 |
| **Element meters** | Per-zone accumulating meters (Boredom / Fun / Goo / Death). Only Sludge exists, as a hazard DoT. | M | nothing |
| **Light + Lantern** | A purchasable light from Puck that makes the dark Wilderness explorable. `_drawDarkness` exists; no item. | S–M | nothing |
| **Party / creature recruitment** | Wererat / Clown / Robot / Skeleton as party members. Only the ally-flip primitive and the Lire summon exist. | M–L | nothing |
| **Gold-economy depth** | Gold Card tiers, gold-as-liability, travel tolls, an early time-boxed debt. GP is a pill today. | M | nothing |
| **Trade Slice 2** | Drag-to-swap barter, NPC loadouts, NPC gold. | M | nothing |
| **Enemy buys YOUR gear** / **AI reads your wallet** | Law 6 open hook; bribe demands scaling to visible wealth. *Very Violencetown.* Deferred, not rejected. | M | nothing |

**The `plan` branch problem.** 24 plan docs exist *only* on `plan`, which is six weeks stale and
badly diverged from `dev`. Three of the "ready to build" items above have their only spec there.
CLAUDE.md's rule is that active work lives on `dev`; parked work on `plan`. **Anything in §3 or §4
should have its doc migrated to `dev` before work starts** — `git show plan:plans/<file>` and commit.

**ROADMAP.md's seven ABC decisions** are listed as pending and are mostly *de facto settled by
shipped code* (turn-based movement, REMOTICON inventory, 32px scale). ROADMAP.md itself has not been
updated since 2026-04-01 and should be, or retired in favour of this document.

---

## 6. DONE — do NOT re-implement

Verified against `dev` @ `13c61ea` on 2026-09-07. All of these appear as *open* in at least one
parked document.

| Parked as open in | Item | Shipped as |
|---|---|---|
| `next-session-open-work` C2 | No modifier-key guard | `ctrlKey`/`metaKey` are checked in `game/` |
| " D2 | Naming gate false positive | Exclusion is in CLAUDE.md's documented command |
| " D3 | "CLAUDE.md says MP is inert" | Reads "MP is live" |
| systems-audit §7.1 | Fix fight length | `feature/fight-length` merged |
| systems-audit §7.6 | Place the first `puzzleWall` | `Sludge Bloom`, `sewer-map.json` |
| demo-readiness §2.4 | The depth was invisible | `hints.js` — situational one-shots, paced |
| demo-readiness §2.3 | Autoplay | Ruled: ships muted. Do not flip without asking. |
| `undeveloped-backlog` §4 | Everything in that section | Still accurate — wheel overhauls, movement-feel, world-structure, road-to-1.0 all built |
| this week | Threat overlay always-on; canvas fractional resampling; 9 red-box NPCs; rats as hooded figures; townsfolk as the player; ASCII awareness pips; lockstep idle bob; `reduceMotion` ignored by the bob; Sewer/Factory sharing cells; tile placement unguarded | `visual-pass.md`, `animation-pass.md`, `zone-identity.md` §0/§2/§4 |

---

## 7. Suggested next three sessions

Not a mandate — a reading of the graph.

1. **Rulings session.** Clear A1–A4, Z1–Z2, R, DZ in one sitting. None needs code. Every one of
   them is cheap and every one of them gates something. Then ship v0.22.0 — the demo is 24 commits
   stale and the whole visual pass is invisible until it moves.
2. **Combat-feel session.** B2 (enemies eat their kits) — unblocked, high-leverage, diegetic. Then
   B1 if A1/A4 are ruled. This is the session where fights start to *read*.
3. **Zone-identity session.** Redo §3 graveyard (props first, then map). Then §1 interiors once
   Z1/Z2 are ruled. Then the streetlights-as-props follow-on the graveyard proves out.

Sessions 2 and 3 are **file-disjoint** and can run as parallel branches without conflict.
