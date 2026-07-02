# Violencetown — Bestiary (design catalog)

A living roster of creatures, grouped by zone. **How enemies work today:** they're defined per-map in
each `*-map.json` `enemies[]` array — `{ id, type, name?, x, y, hp, damage, sightRange, behavior[],
disposition?, bribeable?, vendor?, tag?, dialogueId?, barks?, ... }` — with the sprite chosen by `type`
in `sprites.js`. There is no central bestiary *file*; this doc is the **design source of truth** for
what each creature is, how it behaves, and which need new engine mechanics. Started 2026-07-02.

**Legend:** 🆕 = needs a new mechanic (flagged in "New mechanics" below). 🤝 = friendly / non-hostile.

---

## Cave  (NEW zone — south of the Sewer, through a hole in the wall)

Dark, claustrophobic (Wilderness `_drawDarkness` treatment). Haunted by the Weredigo; the Bear is
hiding here.

| Creature | Role | Notes |
|---|---|---|
| **Weredigo** 🆕 | Boss / haunt | A wendigo. **Turns invisible for 3 turns** — while invisible you can't see it and must **fight it blind**: throw and swing at *guessed* tiles. The cave's resident terror. |
| **Bug** | Hostile | Skittering cave bug. Low HP, swarms. |
| **Bat** | Hostile | Erratic/flitting flyer. Fast, low HP. |
| **Bear** 🤝🆕 | Friendly NPC / quest-giver | A **white bear, bleached by sunblock chemicals**, who fled downtown through the sewers underground and now lives in the cave. He **used to work downtown**. The Weredigo is bothering him — he's the way into a "deal with the haunt" quest. Non-hostile; disposition/ally + dialogue. |

**Lore hook:** the Bear ties the Cave to Downtown (he's an ex-downtown worker) — a thread between the
two new zones.

---

## Carnival  (existing zone — south of Town; `circus-map.json`, `zoneName:"CARNIVAL"`)

The Americana carnival that never left. (Existing resident: the **Carnival Clown**.)

| Creature | Role | Notes |
|---|---|---|
| **Mascot** | Hostile | A costumed carnival mascot — off, uncanny. |
| **Duck** | Hostile | A carnival-game duck (shooting-gallery / rubber-duck energy), turned mean. |
| **Operator** | Hostile | The ride operators — **scraggly, nasty carnies**. |

Weapon source already here: the **Lion Whip** (Phase 4 armory work).

---

## Park  (NEW zone — west, between Town and the Factory)

A city park you pass through on the way to the Factory.

| Creature | Role | Notes |
|---|---|---|
| **Goose** | Hostile | An aggressive park goose (geese are the natural predator of the peaceful stroll). |
| **Ruffian** 🆕 | Hostile / thief | A **little-kid street-youth burglar** — tries to **take your money and run**. Steal-and-flee. |

---

## Factory  (existing zone — west, to sit behind Park; "Oddworld-coded industrial, alien-occupied")

| Creature | Role | Notes |
|---|---|---|
| **Robit** | Hostile | A malfunctioning factory robot (the misspelling is the joke). |
| **Rat** | Hostile | Factory rat (the Wererat's smaller cousins). |
| **Human Resources** | Hostile | Corporate-horror enforcer — the department made flesh. |

(Existing lore boss: the **Alien Invasion** / little-green-men, source of the deferred Ray Gun.)

---

## New mechanics to build (flagged for later phases)

- **Invisibility + blind combat (Weredigo)** 🆕 — a new enemy status (mirror the Feared/buff pattern):
  `invisible` for N turns. While invisible, the renderer hides its sprite (maybe a faint shimmer / dust
  tell), `_inCombat` still holds, and the player attacks/throws at *tiles* without a highlighted target.
  Reveal on a landed hit (you guessed right) or when the timer expires. Reuses the per-enemy buff timer
  + `affectedTiles`/throw targeting.
- **Steal-and-flee (Ruffian)** 🆕 — on reaching the player, **grabs gold and bolts**. Beautifully reuses
  two things already built: **`transferGold`** (the Phase-1 transaction spine — the theft is just a
  player→NPC gold transfer) and **`fleeStep`** (the Fear system's retreat pathing — after the grab, the
  Ruffian flees exactly like a Feared enemy). Kill/catch it to get the gold back (drop on death).
- **Friendly creature NPC + quest (Bear)** 🆕 — a non-hostile creature with a dialogue + a task
  (deal with the Weredigo). Reuses the disposition/ally system + the multi-path quest archetype
  (Pike's grappling hook) — talk/help/etc.

These three tie directly back to the **systems-cohesion** goal: the Ruffian *is* the transaction spine +
the flee pathing in a new coat; the Weredigo *is* the buff/status system; the Bear *is* the
disposition/quest substrate. New content, old rails.

## Open questions

1. **Goose vs. Ruffian** — captured as **two** enemies (a goose + a kid burglar). If you meant one
   "Goose Ruffian," say so.
2. **Weredigo** — a single Cave boss, or a recurring type? (Assumed: one signature boss-haunt.)
3. **Bear's quest** — what's the task / reward? (e.g., drive off or kill the Weredigo → he opens a
   shortcut / gives a downtown keepsake / becomes a follower.)
4. **Duck / Mascot / Operator / Robit / HR** — any special mechanics, or standard chase-and-hit for now?
5. **Sprites** — which Kenney cells for each new type (no art teased-but-missing); Claude can propose.
