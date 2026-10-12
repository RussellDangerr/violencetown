# SR — the slot registry

**Date:** 2026-10-12
**Status:** SPEC — building on `feature/slot-registry`
**Parent:** `plans/spine.md` §2 (the slot rules SL-1…SL-7) and §6 step 2. Roadmap row `SR`.

## Goal

A beat binds to a **slot**, and a slot holds a **pool** of entries. At a new game one entry per
slot is picked from the seed, saved, and placed on the map. The first and only slot is
`sewer.boss`, whose pool is the Were-Rat alone, and **the Converter belongs to the slot**.

Nothing a player can see changes. What changes is that a second Sewer boss becomes one registry
entry plus one pool row — no edit to the quest, the map or the death handler.

## The shape

**The map says *where*; the registry says *who*.**

- `game/slots.js` (new) — one module, one dict per job (cross-game-study G-14):
  - `ENTRIES` — the registry. An entry is the stat block a map spawn used to carry: type, hp,
    armor, damage, kit, gold, barks, tag, flags. `wererat` moves here from `sewer-map.json`.
  - `SLOTS` — `{ 'sewer.boss': { kind: 'boss', map: 'sewer-map.json', requiredDrop:
    'catalytic_converter', pool: [{ entry: 'wererat', weight: 1 }] } }`.
  - `pickSlots(seed)` → `{ slotId: entryId }`, weighted, from `new RNG((seed ^ SLOT_SALT) >>> 0)`.
  - `defaultPicks()` → the first entry of every pool (today's content).
  - `resolveSpawn(spawn, picks)` → a spawn with a `slot` becomes the picked entry's stat block,
    with the spawn's own `id`, `x`, `y`, `facing` and `slot` on top. A spawn without one passes
    through untouched.
  - `requiredDropFor(enemy, mapSpawns)` → the item a slot guarantees, or null. Reads `enemy.slot`,
    and falls back to the map spawn with the same `id`, so a save written before this branch (its
    Were-Rat has no `slot` field) still drops the Converter.
- `sewer-map.json` — the Were-Rat spawn shrinks to `{ "id": "wererat", "slot": "sewer.boss", "x": 17, "y": 10 }`.
- `Enemy` gains `slot` (ctor + `toSave`, written only when set, so every other enemy's save is
  byte-identical).

## The seed and the save

- The game never kept its seed, only the stream's position. It now draws one at a new game
  (constructor and `_fullReset`, which already takes the autoplay's seed), seeds `game.rng` with it
  exactly as before, and computes `game.slots = pickSlots(seed)`.
- **SL-2:** the picks come from their own stream. `game.rng`'s state after a new game is identical
  to before this branch — a test pins it, so no combat roll can move.
- The save carries `slots`. A save without it loads `defaultPicks()`. `loadInto` restores
  `slots` **before** `_loadMap`, which is where spawns resolve. A save keeps its picks even if a
  pool later grows.

## The death

`_handleEnemyDeath` drops `requiredDropFor(enemy, this.map.enemySpawns)` instead of testing
`tag === 'wererat_boss'`. Same ground drop, same log line, same `_recordDrop`. The Were-Rat's fur
(the remembrance) is the entry's own, so it stays keyed on its tag until drop tables arrive (RV).

## Everything else that read the Were-Rat from the map

- **The autoplay** kills by slot: route `{ kill: { slot: 'sewer.boss' } }`, and the view gives each
  enemy its `slot`. Otherwise a second Sewer boss would leave the autoplay hunting a tag that
  isn't there.
- **The balance harness** resolves map spawns with `defaultPicks()`, and lints **every** registry
  entry, picked or not (a pool entry that would fail the bands must fail the check).
- **Tests** that pull the Were-Rat out of `sewer-map.json` resolve the spawn first.
- **`content-validate.js`**: every `slot` on a map names a real slot; every pool entry is a real
  entry; every boss slot is placed exactly once, on its own map; every `requiredDrop` is a real
  item.

## Tests

- **SL-4:** for every slot with a `requiredDrop`, every pool entry, spawned through
  `resolveSpawn` + `spawnEnemy` and handed to `requiredDropFor`, yields that item. Mutation-checked:
  removing `requiredDrop`, or a spawn losing its `slot`, fails it.
- Picks are deterministic per seed and spread across a weighted pool (a two-entry fixture pool).
- `game.rng` state after a seeded new game equals `new RNG(seed)` untouched.
- Save round-trip keeps `slots`; a save without `slots` gets the defaults; an old-shape saved
  Were-Rat (no `slot`) still resolves the Converter.

## Gates

- `npm test` green; `npm run balance:check` no drift; naming grep zero lines.
- **Autoplay:** every stage score and turn count identical to `tools/autoplay-golden.json`. The
  fingerprint hashes the whole save, so the new `slots` field moves it; the proof that nothing
  else moved is that stripping `slots` from the end state gives back the old fingerprint. Only
  then `npm run autoplay:write`, with that proof in the commit message.
- **The game runs:** `python dev-server.py 3001`, console clean, into the Sewer, the Were-Rat
  stands at (17,10) with its barks, kill it, the Converter drops; save, reload, still there.

## Not in this branch

Spawn tables for mobs and per-entry drop tables (they arrive with the rats, RV); the respawn clock
(needs species-adventures rec. 3/4 ruled); the randomizer mode; any second entry in any pool.
`isBoss` stays tag-based (`*_boss`), so a future boss entry carries a `_boss` tag and `boss: true`.
