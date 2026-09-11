# Armory Loose Ends — Ray Gun Source & Carnival Rename

**Status:** ✅ A and B shipped 2026-09-10 on `feature/ready-builds` (migrated here from the `plan`
branch, where this doc was written 2026-07-23). C untouched, as it says.

> **As built:**
> - **A:** the Ray Gun lies in the back of the Factory's northwest bay, (3,2) — reached only by going
>   past Puck and the goo, away from the east entrance. It draws as a teal lettered box, like every
>   other weapon: **no weapon has ground or inventory art** (a separate item, not this one).
> - **B:** `circus-map.json` → `carnival-map.json`; four exits updated (Town ×3, Graveyard ×1). Also
>   needed and not in the original list: **old saves** store the map by file name, so `save.js`
>   `migrate()` maps the old name to the new one; and the balance golden keys zones by file name, so it
>   was regenerated (two renamed rows, every number identical).
> - **Found while verifying A:** the starting Wooden Sword had no `useType: 'equip'`, so once a player
>   picked up any other weapon the sword could never be wielded again — neither Use nor the GEAR
>   chooser would take it. Fixed; `tests/world-integrity.test.js` now requires every weapon be
>   re-equippable, every weapon obtainable somewhere, and every exit to land on a real, walkable tile.
>
> Original text follows.

Two small, independent cleanups left over from the shipped sewer Armory
(`plans/sewer-armor-weapons-and-carnival.md` §5 and §9). Do them together or separately.

---

## A. Give the Ray Gun a world source (~S)

**Problem (verified):** the Ray Gun is a fully-defined weapon with **no way to obtain it** — dead
content. `game/weapons.js:15` defines `ray_gun` (`damage:22`, `damageType:'energy'`, `equipSlot:'weapon'`,
grants the **Ray Blast** trick while worn), but a grep finds **zero placements** of it in any map or drop
table. Its GP-costed Ray Blast is currently reachable only through the `tome_ray_blast` item.

**Two builds — MVP now, or the real thing later:**

- **MVP (S):** drop a `ray_gun` ground item into the Factory (`factory-map.json` `groundItems`, or a
  boss/chest drop), so the tech-weapon flavor is actually reachable. Verify: pick it up, equip it, Ray
  Blast becomes castable (GP), unequip removes the granted trick.
- **The real intent (L, its own feature):** the Factory **"Alien Invasion"** boss encounter that drops
  the Ray Gun (`sewer-armor-weapons-and-carnival.md` §9, and a roadmap zone-boss thread). That's a whole
  content beat — track it under the roadmap zone-bosses, not here. The MVP pickup is the quick win.

## B. Rename `circus-map.json` → `carnival-map.json` (~S)

**Problem (verified):** the zone's **label is already `CARNIVAL`** everywhere the player sees it (every
`toMap` transition into it reads "…the CARNIVAL"), but the **file is still `circus-map.json`** — the
standing "did we delete the Carnival?" filename-vs-label confusion the original plan documents.

**Scope (real files only — do NOT touch the gitignored `*-TheDangerrZone*` variants):**

1. Rename `game/circus-map.json` → `game/carnival-map.json` (and set its own `zoneName` to `CARNIVAL`
   if not already).
2. Update the `toMap` references that point at it — verified live in:
   - `game/graveyard-map.json:46` (`"toMap":"circus-map.json"` → `carnival-map.json`).
   - `game/town-map.json:79`, `:80`, `:81` (three south exits into the Carnival).
   - Re-grep `git grep -n "circus-map"` after editing to catch any straggler in real (non-DangerrZone)
     files.
3. Leave the `CIRCUS_GROUND` tile key (`data.js:36`, id 30) and its sprite pick as-is unless you also
   want to rename the tile — that's cosmetic and internal; note it but don't let it expand the change.

**Verify:** load the game, walk Town→Carnival and Graveyard→Carnival and back — both transitions resolve
to the renamed map; zone label reads CARNIVAL; 0 console errors. Run `git grep -iE 'violence[ _-]+town'`
(must stay zero excl. docs) before merge.

## C. Note on the routing question (developer's call — do NOT decide unilaterally)

`sewer-armor-weapons-and-carnival.md` §5 also floats a **Carnival→Factory chaining/re-routing**. The
original plan flags this as a contested design decision that conflicts with `decision-trees.md` canon and
says *"developer's call, do NOT decide unilaterally."* Keep the rename (B) purely cosmetic; surface any
routing change to Caelan before touching the world graph.
