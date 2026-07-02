# Equipment, Weapons & the Carnival — Plan

_Branch target: `plan` branch (planning only). Date: 2026-07-02. Author: lead design pass off five research reports, grounded against the `feature/equipment-armor` / `feature/hud-overhaul` working tree._

---

## 1. Status & scope

This is a **plan, not an implementation** — per the developer's instruction ("You don't have to worry about fully implementing the equipment, but get it down in the Plan"). It is written to be executed directly next: exact slots, item defs, placement coords, effect hooks, and function-level insertion points are all named.

Critical grounding fact: **the body-zone equipment/armor SYSTEM already shipped** (the `feature/equipment-armor` work). The six equipment slots (`weapon, top, bottom, front, back, sides`) exist and are live (`game/main.js` equipment init; `game/layout.js:102-109` for HUD labels), `useType:'equip'` armor pieces already work end-to-end (equip moves the item into `equipment[slot]` and out of the hotbar — `game/main.js:2061`; `resolveEquip` — `game/items.js:223-232`), and there are **three MVP test pieces already in the game** (`tin_helm`/`gutter_boots`/`bin_lid`, `game/items.js:79-111`) explicitly marked as throwaway plumbing (`game/items.js:76-78`).

So this plan is **mostly content on top of shipped plumbing**, plus **three genuinely new mechanics**:
1. A **sludge-immunity** hook (armor that blocks a hazard — armor today only carries a flat `armor:` number).
2. A **FEARED status** + enemy **flee** behavior (no flee/panic/retreat state exists anywhere today — verified).
3. A **weapon on-hit effect** hook (weapons are pure `damage` today — `combatAttack` never inspects the weapon).

The Carnival question (section 5) is a factual + routing decision, no new content required.

**Out of scope this pass** is listed in section 9 (alien boss / Ray Gun drop source, full weapon balancing, per-zone hit-location armor).

---

## 2. Low-level SEWER armor set

A full **one-piece-per-body-zone set**, sourced entirely from the Sewer. These five pieces **SUPERSEDE the three MVP test pieces** — delete `tin_helm`, `gutter_boots`, `bin_lid` (`game/items.js:79-111`) in the same pass, or the Sewer will contain both the placeholder and the real piece for `top`/`bottom`/`sides`.

### 2.1 The set (table)

| Piece | Body-zone slot | HUD label | Armor | Special effect | Flavor |
|---|---|---|---|---|---|
| **Foil Hat** | `top` | HEAD | 2 | — | Tin-foil, triple-layered. "They can't read you now." |
| **Cardboard Cuirass** | `front` | TORSO | 4 | — (biggest coverage) | A refrigerator box, arm-holes torn out, FRAGILE stencilled on both sides. |
| **Latex Gloves** | `sides` | ARMS | 1 | — (flavor: sludge-grip) | Powder-blue, one size too big, snapped at the wrist. Surgical, in the loosest sense. |
| **Red Cape** | `back` | BACK | 1 | — (its value is the pickup beat + future FEAR-set synergy) | A tattered red cape, torn from something that left in a hurry. |
| **Shoe Bags** | `bottom` | FEET | 2 | **SLUDGE immunity** — never gets sludged while worn | Garbage-bag socks, double-knotted at the shin. The Sewer stays out of your socks. |

Total soak across the 5 slots ≈ **10** armor. Combat floors every hit at a minimum of 1 damage regardless of armor (`applyDamageToPlayer`, order: Guard-halve → subtract flat armor → `Math.max(1, …)`, `game/main.js:2848-2852`), so this set matters against the Sewer's 4–12 damage enemies without trivializing them. Keep values modest.

### 2.2 Exact `items.js` def shape

Each piece is a drop-in `ITEMS` entry — **no new engine code for the four plain-armor pieces**; they ride the existing `armor` stat summed in `_playerArmor()` across `top/bottom/front/back/sides` (`game/main.js:2838-2846`). No `ITEM_SPRITES` entry required — they render via `fallbackColor` like the existing armor (sprites optional polish later).

```js
// ── Armor (persistent equips — the Sewer set) ────────────────────────────
foil_hat: {
    id: 'foil_hat', name: '[Foil Hat]',
    description: 'Tin-foil, triple-layered. They can\'t read you now.',
    equipSlot: 'top', useType: 'equip', armor: 2, consumable: false,
    fallbackColor: '#c8c8d0', baseValue: 10,
},
cardboard_cuirass: {
    id: 'cardboard_cuirass', name: '[Cardboard Cuirass]',
    description: 'A refrigerator box with the arm-holes torn out. FRAGILE, stencilled on both sides. It is not wrong.',
    equipSlot: 'front', useType: 'equip', armor: 4, consumable: false,
    fallbackColor: '#b58a56', baseValue: 14,
},
latex_gloves: {
    id: 'latex_gloves', name: '[Latex Gloves]',
    description: 'Powder-blue, one size too big, snapped at the wrist. Surgical, in the loosest sense.',
    equipSlot: 'sides', useType: 'equip', armor: 1, consumable: false,
    fallbackColor: '#9fc7e8', baseValue: 8,
},
red_cape: {
    id: 'red_cape', name: '[Red Cape]',
    description: 'Torn from something that left in a hurry. Snags on everything. Makes you feel taller.',
    equipSlot: 'back', useType: 'equip', armor: 1, consumable: false,
    fallbackColor: '#c03030', baseValue: 10,
},
shoe_bags: {
    id: 'shoe_bags', name: '[Shoe Bags]',
    description: 'Garbage-bag socks, double-knotted at the shin. The Sewer stays out of your socks.',
    equipSlot: 'bottom', useType: 'equip', armor: 2, sludgeImmune: true, consumable: false,
    fallbackColor: '#3a3a3a', baseValue: 10,
},
```

`soap` (temp equip, `back`) and `bandage` (temp equip, `front`) are **duration** equips — they share slots with Red Cape / Cardboard Cuirass the same way any temp buff shares with worn armor; no structural collision.

### 2.3 Placement — five concrete sewer coords

Placed as ground-item spawns (schema: `{"type":"<id>","x":N,"y":N}` in the map's top-level `items` array, `game/sewer-map.json`, spawned `game/main.js:445-450`) — **except the Red Cape** (grate examinable, §2.5). All coords verified walkable (floor id 1 / sludge id 2). Spread NW → N-center → NE → center → SE, no clustering.

| Piece | Coord `(x,y)` | Tile | Why here |
|---|---|---|---|
| **Shoe Bags** (`bottom`) | `(7, 9)` | floor at lip of the north SLUDGE pool | Diegetic teach — sits at the edge of the sludge it protects against; pick it up before you wade. |
| **Latex Gloves** (`sides`) | `(3, 3)` | floor, upper-left lobe | Far NW grimy alcove, diagonal-opposite the boss. (Use `(2,3)` if avoiding the `mystery_meat` tile.) |
| **Foil Hat** (`top`) | `(15, 4)` | floor, NE lobe | "Someone stashed gear up here" pocket near the bandage cluster. |
| **Cardboard Cuirass** (`front`) | `(16, 12)` | floor, SE lobe on the boss approach | Loot-before-the-Wererat-boss beat, co-located with the existing `mystery_meat`. |
| **Red Cape** (`back`) | grate at `(11, 5)`, player stands `(11, 6)` | GRATE (§2.5) | Central-north spine, wedged in the bars — see below. |

Save/load: the four ground-item pieces are **zero-cost** to persist — they serialize via `groundItems` and rehydrate by re-resolving `def` from `ITEMS`; once taken, the `map|x|y|type` key lands in `_collectedItems` so a taken piece stays taken across reload (`game/save.js:83-86, 252-257`). Requires only that each `type` is a valid `ITEMS` key.

### 2.4 Shoe Bags → sludge protection (exact hook + pseudocode)

Sludge is applied on **step-in** as a 3-turn debuff (`game/main.js:1641-1643`, verified), and does `SLUDGE_DOT = 5`/turn as a **raw HP subtraction that does NOT route through armor** (`game/main.js:2457-2461`) — so generic `armor:` can never reduce sludge. Shoe Bags need a dedicated hook. Design choice: **immunity at the application site** (prevention over cure — garbage-bag socks keep the sludge off, cleaner fiction than "gets sludged, takes 0").

**Add a small helper** near `_playerArmor()` (`game/main.js:~2846`) — iterate all slots so any future piece can grant it:
```js
_hasSludgeImmunity() {
    const eq = this.equipment || {};
    return ['top','bottom','front','back','sides'].some(k => eq[k] && eq[k].sludgeImmune);
}
```

**Guard the application site** (`game/main.js:1641`):
```js
if (tileDef.hazard === 'sludge' && !this.hasBuff('sludge') && !this._hasSludgeImmunity()) {
    this.addBuff('sludge', 'Sludge', SLUDGE_DURATION, 'debuff');
    this._log('[Stepped in sludge — 3 turns]');
} else if (tileDef.hazard === 'sludge' && this._hasSludgeImmunity()) {
    this._log('[The sludge slides right off your bagged feet.]'); // throttle if noisy
}
```

**Recommended second guard** on the DoT (`game/main.js:2458`) so the boots feel unconditionally protective even if you equip them while already sludged:
```js
if (this.hasBuff('sludge') && !this._hasSludgeImmunity()) { /* ...existing DoT... */ }
```
Edge case to note: equipping Shoe Bags mid-sludge won't retroactively clear an already-applied buff unless you also `removeBuff('sludge')` on equip. Cheap; recommend doing it for feel.

### 2.5 Red Cape "stuck in a grate" — reuse-first, no new art

The requirement ("MUST be shown STUCK IN A GRATE") is best served by an **examinable on a GRATE tile that grants the cape** — cleanest, uses only shipped systems, **no new art needed**:
- A **GRATE tile already exists with art** — `data.js:12` (id 4, `walkable:false`) + a rendered iron-bar sprite (`game/sprites.js:151`). Free visual.
- The **examinable system exists** (`game/examine.js:14-35`; per-map `examinables` array loaded at `game/main.js:479`; the town car uses it) — exactly the "inspect the thing you're facing" verb.
- A raw ground item **can't** sit on a grate (id 4 unwalkable → pickup unreachable), and a container reads as a chest, not "cape wedged in bars." So the examinable is the right fit.

**Build:**
1. **Tile edit** — set `(11,5)` in the sewer `tiles` grid from `0` (WALL) to `4` (GRATE). Player stands on the floor at `(11,6)` facing up into it. (The sewer has no `examinables` array yet — the loader defaults it to `[]`; add one.)
2. **Examinable:**
   ```json
   { "id": "cape_grate", "x": 11, "y": 5,
     "text": "[A tattered red cape, snagged and half-sucked through the bars of a storm grate. Somebody left in a hurry. You work it free.]" }
   ```
3. **Grant hook (~5 new lines)** — `doExamine` logs + emits `examine {targetId:'cape_grate'}` but does not grant. Wire a one-time listener where game events are consumed (`main.js`): on `examine` with `targetId==='cape_grate'`, `this._addToInventory(ITEMS.red_cape)`, log `[+ Red Cape]`, and add a synthetic key like `sewer|11|5|red_cape` to the `_collectedItems` Set so it fires once and survives reload. **This one-time flag is the only save-state consideration the whole feature introduces** beyond the free-riding ground items.

_Future-real-estate note:_ the north wall is shared with the (draft, unbuilt) Crat quest room (`plan:plans/sewer-crat-quest.md`), which would attach north behind its own transition. Keep that transition off a different north-wall tile than `(11,5)`, or shift the cape-grate a column — trivial. No collision today.

---

## 3. Weapons & the Armory

### 3.1 The four weapons (table)

| Weapon | Source zone | Damage feel | Special |
|---|---|---|---|
| **Fearmur** (leg-bone club/sword) | GRAVEYARD | `damage:14`, mid-heavy | **Fear proc** — fears an enemy hit twice in a row (§4.3) |
| **Gator Tail** (dehydrated gator club) | SEWER | `damage:16`, heavy swing | — (implies **sewer gators** as new bestiary — flag §8) |
| **Ray Gun** | FACTORY (alien-boss drop) | `damage:22`, `damageType:'energy'` | Boss/drop **deferred** — no source yet (§9) |
| **Lion Whip** | CARNIVAL | `damage:12`, light/fast | `reach:2` desired but **needs aim-range work** — ship adjacent for 1.0 (flag §8) |

### 3.2 Weapon def shape

Weapons live in the small `WEAPONS` table (`game/main.js:94-98`, verified — only `wooden_sword` today), resolved by id ahead of `ITEMS` in `_resolveItemDef`. The weapon slot is **permanent and never emptied** (`unequipItem` hard-refuses `weapon`, `game/items.js:238-239`), because the three Melee verbs read `equipment.weapon.damage` (Hit full; Cleave ×2/3; Spin ×2/5 — `game/main.js:2307/2313/2321`). New weapons in `WEAPONS` are safe across death/new-game resets (`game/main.js:2953, 3013`).

```js
const WEAPONS = {
    wooden_sword: { id:'wooden_sword', name:'[Wooden Sword]', damage:10, equipSlot:'weapon', icon:'sword' },
    fearmur:    { id:'fearmur',    name:'[Fearmur]',     damage:14, equipSlot:'weapon', icon:'bone',
                  onHit:'fearOnRepeat' },      // §4.3 double-hit fear proc
    gator_tail: { id:'gator_tail', name:'[Gator Tail]',  damage:16, equipSlot:'weapon', icon:'gator' },
    ray_gun:    { id:'ray_gun',    name:'[Ray Gun]',     damage:22, equipSlot:'weapon', icon:'raygun',
                  damageType:'energy' },        // typed splat only, no status yet
    lion_whip:  { id:'lion_whip',  name:'[Lion Whip]',   damage:12, equipSlot:'weapon', icon:'whip' },
                  // reach:2 deferred — see §8
};
```
`icon` is a renderer key, not damage-relevant; new weapons can start on `fallbackColor` and get sprite icons later. Save/load needs **no changes** — new weapon ids resolve automatically through `_resolveItemDef` (`game/main.js:627-631`; `game/save.js:234-248`).

### 3.3 How a weapon carries an on-hit effect (new hook)

Verified: **no weapon carries an on-hit effect today.** `combatAttack(enemyObj, damage, opts)` (`game/main.js:2669`) never inspects `equipment.weapon` — it's the single choke-point every player hit passes through, but effects (e.g. thrown-item `damageType`, verb-applied debuffs) are attached by the *item/verb*, not the weapon. So Fearmur needs a **new weapon-effect field** (`onHit:'fearOnRepeat'`) and a **branch that reads it**. The right insertion point is the single-target Melee-Hit path in `_fireWheel`'s `case 'combatAttack'` (`game/main.js:2305-2309`) — see §4.3. This is the generic seam for any future elemental/status weapon.

### 3.4 Sourcing (data, not code)

Drop each as a map-JSON ground item / tag-drop:
- **Fearmur → `graveyard-map.json`** (bone weapon from the bone-strewn zone — material fits; theme tension flagged §8).
- **Gator Tail → `sewer-map.json`** (implies adding **sewer-gator** enemies — new bestiary, flag §8).
- **Ray Gun → Factory alien-boss drop** — model on the Wererat converter tag-drop pattern (`game/main.js:2746`), but the **boss is unbuilt** → deferred (§9).
- **Lion Whip → `circus-map.json`** (CARNIVAL).

---

## 4. The FEAR system

Fear is a new mechanic with **no precedent in combat code** (verified: zero matches for flee/afraid/scared/panic/retreat). But every piece can reuse shipped substrate — the missing code is small and has clean single insertion points.

### 4.1 The FEARED status (enemies flee)

Represent fear with the **existing per-enemy buff system** (`game/enemies.js:146-159`), which already ticks down and auto-expires — you get "Feared for N turns" and its ending for free. Add via a helper:
```js
_applyFear(enemyObj, turns) {
    if (enemyObj._ally) return;                              // don't fear allies (decision §8)
    enemyObj.addBuff('feared', 'Feared', turns, 'debuff');   // refresh re-sets timer
    enemyObj.state = 'fleeing';                              // drops out of _inCombat (see below)
    // reuse the overhead-emote pipe for a '!' bark
}
```

**Flee behavior must be built** (does not exist), but the pathing primitive does — inverted. `getGreedyStep` minimizes Chebyshev distance to a target; the `returning` state already does "greedy-step toward a non-player tile." Build a `fleeStep(game, enemy)` that picks the 8-neighbor tile **maximizing** distance from the player (mirror the "sort candidates by farthest-from-hostiles" idiom already in `autoAimTile`'s Run logic, `game/wheel-model.js:266-272`). Do **not** reuse `returning` verbatim — fleeing *home* is wrong when home is behind the player.

**Hook the flee override** in `resolveEnemyTurns`, **right after `enemy.tickBuffs()`** (`game/enemies.js:219`) and before the FSM/legacy branch:
```js
if (enemy.hasBuff('feared')) {
    const away = fleeStep(game, enemy);
    if (away) stepEntity(enemy, away.x, away.y, game._MOVE_MS);
    continue;   // skip chase/attack — the adjacent-attack block never runs
}
```
When the buff expires, the enemy falls through to normal logic and re-acquires `chasing` if it still has LOS (`game/enemies.js:253-263`) — fear is a clean temporary interrupt.

**Combat-clarity interaction (design choice — flag §8):** `_inCombat()` returns true only for `state==='chasing'` (`game/main.js:2531-2536`). Setting a feared enemy to `'fleeing'` drops it out of combat and releases the timer freeze — probably desirable (fear disperses the fight), but decide whether the world should keep advancing while enemies scatter.

### 4.2 "Boo!" — the MP AoE-fear Trick

Design: fear everyone around the player, spend MP, deal **no damage**. MP substrate is live (`playerMp/playerMaxMp`, `PLAYER_MAX_MP=100` `game/data.js:71`; `MP_REGEN=2`/turn `game/main.js:102, 2467-2469`; spells already spend it).

**Recommended implementation: a spell in `SPELLS` with a new no-damage `castBoo` resolver** (reusing `castSpell` won't work — it always subtracts MP then calls `_aoeStrike(tiles, spell.damage)`, i.e. damage). This inherits MP gating, `knownSpells`, and the `affectedTiles` preview highlight for free. (The developer called it a "Trick"; the Trick ring currently holds only non-MP social verbs — Defend/Bribe/Give/Trade — so filing an MP ability there mixes the ring. Placement is a flag, §8. Mechanically it's a spell.)

1. **`game/spells.js`** — add:
   ```js
   boo: { id:'boo', name:'Boo!', mpCost:8, range:0, aoe:{ shape:'self', radius:2 }, fear:3 },
   ```
2. **`game/wheel-model.js`** — extend `affectedTiles` (`~107-111`) so `aoe.shape==='self'` returns `burstTiles({x:px,y:py}, radius)` (the ring around the player, same idiom Spin uses). Add a Magic (or Trick) child node with `resolver:'castBoo'`, `aimType:'none'` (fires immediately, no reticle — correct for a self-burst), gated `available:(g)=> (g.playerMp||0) >= SPELLS.boo.mpCost`. Keep `castBoo` **out** of `OFFENSIVE_RESOLVERS` so it doesn't nag the friendly-confirm on bystanders (fear is non-lethal).
3. **`game/main.js`** — new `case 'castBoo'` near `castSpell` (`~2327`): gate/spend MP, iterate `affectedTiles(w, this)`, `_applyFear(enemy, sp.fear)` on each occupying enemy, log `[BOO! N flee in terror!]` (or `[Boo! ...nobody's around.]`), then `_advanceWorld()`. The player's own tile is in the burst but holds no enemy, so no self-fear.

**MP economy:** `mpCost:8` against a 100 pool with `MP_REGEN:2`/turn means Boo! is repeatable but not spammable (~4 turns to recoup) — leaves room for the two real spells (Fireball, Cone of Cold) to compete for the same pool.

### 4.3 Fearmur — "hit the same enemy twice in a row"

Needs a per-Game "last melee target" tracker (none exists). Add `this._lastMeleeTargetId`, updated **only on the single-target Melee-Hit path** so "in a row" is precise (hitting a different enemy overwrites it and breaks the chain; a kill resets it). In `_fireWheel`'s `case 'combatAttack'` (`game/main.js:2305-2309`):
```js
const w = this.equipment.weapon;
const isRepeat = (w.onHit === 'fearOnRepeat') && this._lastMeleeTargetId === enemy.id;
this.combatAttack(enemy, w.damage);
if (enemy.entity.isAlive() && isRepeat) {
    this._applyFear(enemy, 3);
    this._log('[The Fearmur cracks bone — it recoils in terror!]', 'combat');
}
this._lastMeleeTargetId = enemy.entity.isAlive() ? enemy.id : null;
```
Guarding on `w.onHit === 'fearOnRepeat'` means **only Fearmur** procs. **Cleave and Spin should reset `_lastMeleeTargetId = null`** in their cases (`game/main.js:2311/2319`) so an AoE never counts as one of the two consecutive taps. `enemy.id` is the stable identity (`game/enemies.js:80`).

---

## 5. The Carnival/Circus & level ordering

### 5.1 Factual verdict (from reports 1, 3, 4, 5 — all agree)

**The Carnival was never removed. It is live, fully wired, and reachable from Town right now.** The map is `game/circus-map.json` with `"zoneName": "CARNIVAL"` (line 5, verified). The confusion is purely a **filename-vs-label split**: the *file* is still `circus-map.json` and code comments/sprites still say "Circus," while the *zone label* and all in-fiction text say CARNIVAL. Reachability (verified):
- **Town → Carnival:** three south-edge transitions at `(14/16/18, 24)` → `circus-map.json` toX:4, toY:2, label `"[South — out to the edge of town: the CARNIVAL]"` (`game/town-map.json:77-79`).
- **Carnival → Town** (north, `(4,0)`) and **Carnival → Graveyard** (south, `(52,20)`) (`game/circus-map.json:40-43`).
- It has content — a Carnival Clown (`clown1`), hot_dog + bandage loot, a game-booth examinable — and themed, rendered tiles (ids 30–33). It just **feels empty** (1 enemy, 2 items, 1 examinable across a 58×22 map), which is why a playtest passes through in seconds.

Git confirms only additive/rework commits, never a deletion: the Circus was renamed to Carnival and re-laid (`cd2556d` introduced the CARNIVAL string; `96f182b` did the 4× scale). It was never fleshed out — not removed.

### 5.2 Canonical zone themes

- **Sewer** — sludge/fungus/Wererat (weapon-source: Gator Tail).
- **Carnival/Circus** — Americana carnival / cryptid menagerie, tiles 30–39 (weapon-source: Lion Whip; native enemy: Carnival Clown; boss lore: Bigfoot).
- **Factory** — Oddworld-coded industrial, **alien-occupied**, tiles 40–49; canon boss is the **"Alien Invasion"** encounter (little green men + enslaved greys), not one discrete "Alien Boss" (weapon-source: Ray Gun).
- **Graveyard** — surfer-deity cemetery, Death element, bone hazards (weapon-source: Fearmur).

### 5.3 Recommendation on "Carnival before Factory / offshoot of Factory"

**Current topology is hub-and-spoke** (verified): Factory is Town's **WEST** dead-end spur (`game/town-map.json:71-73`; Factory returns only to Town at `(28,14)`, `game/factory-map.json:47`); the **southern arm** is Town → Carnival → Graveyard → Wilderness. Carnival and Factory are **parallel siblings off Town, not sequenced.** But **narrative canon** (the `plan`-branch zone docs) already wants Carnival *before* Factory in story order (Circus = "Tests & Allies," Factory = "The Ordeal"). The developer's instinct matches canon.

**All of this is data-only edits to `*-map.json` `transitions` — no engine changes** (the transition system is fully generic: `_loadMap(t.toMap, …)` loads whatever `toMap` names, `game/main.js:2473-2494`).

**Recommended — Option A: chain them (Carnival gates the Factory).** Honors canon act order, smallest change, and sets up the natural **Lion Whip (Carnival) → Ray Gun (Factory alien-boss) difficulty ramp** — clear the carnival, then push into the smokestacks for the boss.
- In **`circus-map.json`:** add a transition on the unused far-**east** edge (~`x:56, y:10/11` — currently just border wall) → `factory-map.json`, landing at the Factory's existing entry `toX:26, toY:14`.
- In **`factory-map.json`:** repoint its single return (currently `(28,14)` → `town-map.json`) → `circus-map.json`, landing near that new Carnival east door.
- **Decision:** keep the Town→Factory west link (`town-map.json:71-73`) as a scenic shortcut, or **delete it** to force strict Carnival-first order. Deleting it = the cleaner "Carnival gates Factory" read (this is Option B's essence — Factory as a side-tent off the Carnival).
- Net: the Carnival becomes a **fork** (south → Graveyard, east → Factory). Reads well ("the carnival sprawls; one way to the boneyard, the other to the smokestacks").
- **Optional clean-line variant** for the exact canon act order (Town→Carnival→Factory→Graveyard→Wilderness): also give Factory a second transition → Graveyard and repoint Graveyard's north transition (`game/graveyard-map.json:45`) from `circus-map.json` to `factory-map.json`.

**Cleanup worth doing regardless:** rename `circus-map.json` → `carnival-map.json` and update the ~6 `toMap` references (town + graveyard JSON + any string literals) so the filename stops contradicting the CARNIVAL zone name — this is the root cause of the "did we get rid of it?" confusion. Purely mechanical; sprite/renderer comments can be swept in the same pass or left.

_Note the lore tension flagged in §8: `plans/decision-trees.md` states a "Sequential unlock: Sewer → Factory → Town → Circus → Graveyard," which puts Factory before Circus — the opposite. Re-wiring Carnival→Factory contradicts that particular doc and the parallel-spokes model; decide explicitly whether to supersede it or just thematically link the two zones._

---

## 6. Integration & save/load impact

| Module | Change |
|---|---|
| `game/items.js` | Delete `tin_helm`/`gutter_boots`/`bin_lid` (79-111); add 5 armor pieces incl. `shoe_bags.sludgeImmune`. |
| `game/main.js` | `_hasSludgeImmunity()` helper; guard sludge application (1641) + DoT (2458); `WEAPONS` entries + `onHit`; `_lastMeleeTargetId` + Fearmur proc (2305-2309); `_applyFear` helper; `castBoo` case (~2327); cape-grant listener on `examine`. |
| `game/enemies.js` | Flee override after `tickBuffs()` (219); reuse `addBuff('feared')`. |
| `game/pathing.js` | New `fleeStep` (invert-distance greedy step). |
| `game/spells.js` | Add `boo` spell (self shape, `fear`, no damage). |
| `game/wheel-model.js` | `affectedTiles` handles `aoe.shape==='self'`; new Boo! node (`resolver:'castBoo'`, `aimType:'none'`); keep out of `OFFENSIVE_RESOLVERS`. |
| `game/sewer-map.json` | 4 ground-item armor spawns; GRATE tile edit at `(11,5)`; `examinables` array w/ `cape_grate`; Gator Tail drop (+ sewer-gator enemies if approved). |
| `game/graveyard-map.json` | Fearmur drop. |
| `game/circus-map.json` | Lion Whip drop; (optional) east-edge → Factory transition. |
| `game/factory-map.json` | Ray Gun tag-drop (deferred boss); (optional) repointed return transition. |
| `game/save.js` | **No schema change.** |

**Save-compat notes:**
- New armor + weapon ids and any new buff id (`feared`, `sludge`) **round-trip automatically** by id through `_resolveItemDef` / buff spread (`game/save.js:234-248`) — verified. Ground items and equipped armor already persist.
- **Removing** the three MVP pieces: any pre-existing save that had them equipped/in-bag silently drops them on load (`R(id)` returns null). Acceptable pre-1.0; note it.
- **Red Cape** is the only piece needing a bespoke "already taken" flag (reuse `_collectedItems` with a synthetic `sewer|11|5|red_cape` key).
- The GRATE tile edit is baked into the map JSON, not a runtime `setTile`, so it doesn't touch `tileDiffs`.

---

## 7. Build sequence (suggested — bite-sized, execute one at a time)

Armor first (reuses shipped plumbing, lowest risk), then the new mechanics, then content.

1. **Armor set — defs.** Delete the 3 MVP pieces; add the 5 new `ITEMS` entries (§2.2). Verify equip/unequip in-game.
2. **Armor set — placement.** Add the 4 ground-item spawns to `sewer-map.json` (§2.3). Verify pickup + equip + save/reload persistence.
3. **Red Cape grate.** GRATE tile edit at `(11,5)`; `examinables` array + `cape_grate`; the ~5-line grant-on-examine + one-time `_collectedItems` flag (§2.5).
4. **Shoe Bags sludge immunity.** `_hasSludgeImmunity()` + guard sludge application (and DoT). Verify wading the north pool takes no damage while worn (§2.4).
5. **FEARED status core.** `fleeStep` in pathing.js + `_applyFear` helper + the post-`tickBuffs` flee override in `resolveEnemyTurns` (§4.1). Test by stamping `feared` on an enemy via console.
6. **Boo! trick.** `boo` spell + `affectedTiles` self-shape + wheel node + `castBoo` case (§4.2). Verify MP spend, radius preview, mass-flee.
7. **Fearmur.** `WEAPONS.fearmur` + `_lastMeleeTargetId` proc + Cleave/Spin resets (§4.3). Drop it in the Graveyard; verify the double-tap fear + that other weapons don't proc.
8. **Weapons per zone.** Gator Tail → Sewer (decide sewer-gator enemies, §8); Lion Whip → Carnival.
9. **Carnival→Factory routing** (§5.3) — the map-transition edits + optional file rename.
10. **Ray Gun / alien boss — LAST / deferred** (§9). Ray Gun has no drop source until the Factory boss exists.

---

## 8. Open decisions & lore flags (developer's call — do NOT decide unilaterally)

1. **Carnival vs Circus naming.** The codebase deliberately mixes both — *place/zone* = "Circus" (folder, tiles, comments), *attraction/enemy flavor* = "Carnival" (Carnival Clown, "traveling carnival that never left"). Recommendation: keep **Circus** as the canonical identifier and use **Carnival** as flavor — but confirm, and decide whether to rename the file to `carnival-map.json` to kill the confusion.
2. **Where does Boo! live — Trick or Fight→Magic?** It costs MP (a Magic trait) but the developer framed it a Trick. Trick today holds only non-MP social verbs. Pick: (a) Magic spell (cleanest, recommended mechanically), or (b) make Trick hold MP abilities (truer to the "it's a trick" framing, but mixes the ring).
3. **Sewer gators — canon?** Gator Tail *implies* them, but no reptile is in Sewer canon, and the Loch Ness "Lonny" already owns the "big thing in the water" niche. Choose: (a) add gators as a new low-tier Sewer enemy (real drop source), (b) keep the "not sure where it came from" mystery and add **no** creature (lore-safe), or (c) reconcile with Lonny (gators as its little cousins / pet-flush legend). Standing rule says ask first — **this is the main one.**
4. **Graveyard theme fit for a FEAR weapon.** The zone's boss is a laid-back **surfer Deity** (beach-zen, not spooky). A bone *material* fits; a *fear* enchantment is tonally orthogonal — not a hard conflict (the undead are scary regardless), but worth a conscious yes. Tighter alternative fear-source: the Circus (Mothman/Bunny Man dread).
5. **"Alien Boss" naming.** Canon names the Factory boss the **"Alien Invasion"** encounter, not a single "Alien Boss." Source the Ray Gun from a Little Green Man commander's blaster so the name matches.
6. **Fear drops enemies out of combat?** Setting feared enemies to `state:'fleeing'` releases the `_inCombat` timer freeze. Desirable (fear disperses the fight) or should the world keep the fight "live" while they scatter?
7. **Do allies/ambient NPCs get feared?** Recommend guarding `_applyFear` with `if (enemyObj._ally) return;` — confirm.
8. **Lion Whip reach.** Melee-Hit is hard-locked to `aimType:'adjacent'` (range 1). A range-2 whip needs new aim-range work — ship adjacent for 1.0, or scope the reach work?
9. **Level-ordering canon conflict.** Re-wiring Carnival→Factory contradicts `plans/decision-trees.md`'s "Sewer → Factory → … → Circus" unlock order and the parallel-spokes topology. Decide: supersede that doc, or just thematically link the zones without changing traversal?
10. **Town→Factory shortcut.** If chaining Carnival→Factory, keep the west shortcut (two routes) or delete it (strict Carnival-first)?

---

## 9. Out of scope (this pass)

- **Alien boss + Ray Gun drop source.** The Factory boss is unbuilt; model it later on the Wererat tag-drop pattern (`game/main.js:2746`). Ray Gun stays a def with no live source until then.
- **Full weapon balancing.** Damage numbers here are first-pass feel, not tuned.
- **Per-zone hit-location armor** (directional soak by body zone) — armor stays a flat sum.
- **Lion Whip reach-2** aim-range extension (ship adjacent for 1.0).
- **Cone-of-Cold-style slow/freeze status** and other combat statuses beyond Feared.
- **Sprite/icon art** for the new armor and weapons — all render via `fallbackColor` until a polish pass.
- **The Crat-quest north sewer room** — draft only; this plan just avoids stepping on its future real estate.
