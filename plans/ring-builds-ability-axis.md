# Feature: Ring Builds — the slot-limited ability axis (Package A, sub-project 1)

**Phase:** Progression / build system — the first sub-project of the "toolkit" package in `plans/cross-game-study.md`.
**Priority:** High (highest creative upside from the study).
**Status:** Design (approved 2026-07-11).
**Source:** study items **PD-8** (persisted learned-skill axis) + **NH-1** (NetHack `struct prop` intrinsic/extrinsic/blocked spec) + **NH-2** (reversible suppression). The item-verb half of "Package A" (**PD-7/OL-6**) is a SEPARATE follow-on sub-project — out of scope here.

> **Decisions (Caelan):** progression model = **slot-limited** (a learned *pool* + a capped *equipped* subset — swapping the loadout IS the build). Capacity = **fixed but generous**. Loadout surface = **the Remoticon's GEAR tab**. MVF learning source = **a "tome" consumable**.

---

## Gate 1: Research

- **Genre References:** NetHack's `struct prop { intrinsic; extrinsic; blocked; }` — a property is active if intrinsic OR extrinsic, and NOT blocked; the store keeps *sources* separate and unions at read (the exact spec here). Pixel Dungeon's learned-vs-equipped skill split. The loadout-crafting of any class-build RPG (equip a capped set of many-owned abilities).
- **Player Experience Goal:** *"My wheel is a build I assemble — I collect abilities over a run and choose which to slot into my rings, and swapping that loadout is a real, satisfying decision (never a punishment)."*
- **Technical Feasibility — current state (verified 2026-07-11):**
  - Abilities are **gear-derived and clobbering**: `main.js _refreshGrantedSkills` (≈:3645) sets `knownSpells = [...BASE_SPELLS, ...weapon.grantsSpells]` and `grantedTricks = weapon.grantsTricks` from the *equipped weapon only*, overwriting on every equip. Called at init (:192), equip change (:2372), throw-of-equipped (:3334, PD-2), and reset (:3818/:3879). **Nothing is persisted; there is no player-chosen layer.**
  - `BASE_SPELLS = ['fireball','coneOfCold']` (:118); ctor seeds `knownSpells=[...BASE_SPELLS]` (:157), `grantedTricks=[]` (:158).
  - Weapons carry `grantsTricks`/`grantsSpells` (`game/weapons.js`, e.g. `ray_gun→ray_blast`, `fearmur→boo`, `lion_whip→hire_lion`).
  - The **wheel already reads** `knownSpells`/`grantedTricks` to build its Magic/Trick ring leaves; cast paths check membership (e.g. `castTrick`: `grantedTricks.includes(node.trickId)`, ≈:2971). So the wheel needs almost no change — we change *what populates those lists*.
  - The **Remoticon** GEAR tab already renders equipped gear + tap-to-unequip (`deviceEquipLayout` / `_tapDevice`).
  - `save.js` uses a four-site add-a-field pattern (serialize / migrate / validate / loadInto) + defensive clamps.
- **Scope (MVF):** the two-tier store (`learned*` pool + `equipped*` subset) + the source-merge + a `hasSkill` accessor + the GEAR-tab loadout UI + a `_learnSkill` hook with ONE source (a tome item) + save. NH-2's suppression clause is **hooked but has no live source** this pass.
- **Out of Scope:** the item-verb grammar (PD-7/OL-6 — its own sub-project); a live "silence"/suppression mechanic (hook only); growable slot capacity (fixed this pass); un-learning/respec (the pool is append-only); authored learning sources beyond the one tome (trainers, quests, milestones come with content); any wheel-ring visual redesign.
- **Risks:**
  1. **Regression in the existing gear-grant path.** → the merge is a superset of today (`gear` still unions in); with empty `learned/equipped` (old saves, fresh game) behavior is byte-identical. Verify: unequip still clears gear grants; base spells always present.
  2. **Save incompatibility.** → new fields default to empty in `migrate`; `validate` clamps `equipped ≤ capacity` + drops ids not in `learned`; old saves load as "gear+base only" (identical to today).
  3. **"Slot-limited" reading as taking-away (buffs-feel-given).** → capacity is generous; a newly-learned skill **auto-slots if a slot is free**; gear grants never consume a slot; you never *lose* a learned skill.

---

## Gate 2: Design

### System Design — the store (NetHack `struct prop`, sized to VT)

Per-`Game` fields (player only):
| Field | Kind | Meaning | Persisted |
|---|---|---|---|
| `learnedTricks` / `learnedSpells` | `Set<id>` | the **pool** — every skill learned this run (append-only) | yes |
| `equippedTricks` / `equippedSpells` | `id[]` (len ≤ capacity) | the **slotted** subset that's active | yes |
| `suppressedSkills` | `Set<id>` | NH-2 `blocked` — transiently denied | no (transient) |

Constant: `SKILL_SLOTS = { trick: 6, spell: 6 }` (tunable; "generous" — tune toward the ring's visual leaf capacity).

**Active-set computation** — `_refreshGrantedSkills` changes from clobber to merge (called on equip AND re-slot AND learn):
```js
const gs = (w && w.grantsSpells) || [];
const gt = (w && w.grantsTricks) || [];
this.knownSpells   = [...new Set([...BASE_SPELLS, ...this.equippedSpells, ...gs])];
this.grantedTricks = [...new Set([...this.equippedTricks, ...gt])];
```
`knownSpells`/`grantedTricks` remain the wheel's inputs (unchanged consumers). Suppression is applied at READ, not here.

**One accessor** (the single gate cast + availability route through):
```js
hasSpell(id) { return this.knownSpells.includes(id)   && !this.suppressedSkills.has(id); }
hasTrick(id) { return this.grantedTricks.includes(id) && !this.suppressedSkills.has(id); }
```
Point the existing membership checks (`castTrick` ≈:2971, spell cast ≈:2957, the wheel leaf `available`/`verbApplies` predicates) at these. A suppressed skill greys on the wheel and can't fire; unsuppressing restores it — by construction.

### Learning — `_learnSkill(id, type)`
```js
_learnSkill(id, type) {           // type: 'trick' | 'spell'
  const pool = type === 'trick' ? this.learnedTricks : this.learnedSpells;
  if (pool.has(id)) return;       // idempotent
  pool.add(id);
  const equipped = type === 'trick' ? this.equippedTricks : this.equippedSpells;
  const cap = SKILL_SLOTS[type];
  if (equipped.length < cap) equipped.push(id);   // generous: auto-slot if room (buffs-feel-given)
  this._refreshGrantedSkills();
  this._log(`[Learned ${labelFor(id)}!]`, 'transition');
}
```
Sources are data-driven/authored. **MVF source = a "tome" consumable:** a `game/items.js` def `{ id:'tome_<skill>', name:'[Tome of X]', useType:'learn', learns:'<skillId>', learnType:'trick'|'spell', consumable:true }`; `resolveUse` gains a `case 'learn': return game._learnSkill(def.learns, def.learnType), consuming the tome`. (Real trainer/quest/milestone sources arrive with content — same hook.)

### The loadout surface — Remoticon GEAR tab
Extend the GEAR tab (soft-pausing device) to show, beneath equipment, the **learned pool** grouped by ring (Tricks / Spells), each entry marked slotted or not, with an `N/6` slot counter per ring. Tap a learned skill → toggle slot/unslot (calls `_equipSkill`/`_unequipSkill` → `_refreshGrantedSkills`); tapping when full bumps with a "swap one out" hint. Re-slot anytime the device is open — the existing soft-pause already blocks mid-combat-turn abuse. Reuse the tap-hit-test pattern from `_tapDevice`/`deviceEquipLayout`. *(If GEAR gets visually crowded, the fallback is a new SKILLS tab — implementation call.)*

### Integration Map
- **`main.js`** — the four new fields (ctor + init), `SKILL_SLOTS`, `_refreshGrantedSkills` (merge), `hasSpell`/`hasTrick` + repoint the membership checks, `_learnSkill`, `_equipSkill`/`_unequipSkill`, the GEAR-tab tap routing.
- **`renderer.js`** — the GEAR-tab loadout list (pool + slot state), reusing `deviceEquipLayout`'s idiom.
- **`game/items.js`** — the tome def(s) + `resolveUse` `case 'learn'`.
- **`game/save.js`** — the four-touch for `learnedTricks/Spells` + `equippedTricks/Spells`.
- **`game/weapons.js`** — unchanged (still the extrinsic grant source).
- **`wheel-model.js`** — leaf `available`/`verbApplies` predicates read `hasTrick`/`hasSpell` (minimal).

### Data Schema
New `Game` fields above. New item field group on tome defs (`useType:'learn'`, `learns`, `learnType`). No enemy/tile/map schema change.

### Save/Load Impact
- **serialize:** `learnedTricks/Spells` (Sets → arrays), `equippedTricks/Spells`.
- **migrate:** absent → `[]` (old saves).
- **validate:** coerce to arrays; `equipped` = filter to ids present in `learned` (or gear/base), clamp length ≤ capacity.
- **loadInto:** rebuild the Sets/arrays, then `_refreshGrantedSkills()`.
- `suppressedSkills` not serialized. Old saves ⇒ empty pool ⇒ "gear+base only" ⇒ identical to today.

### Edge Cases
1. Learn with a free slot → auto-equipped + usable immediately. Learn when full → enters the pool, not auto-slotted (player slots it in GEAR).
2. A weapon grants a skill you also learned+equipped → deduped (Set union); unequip the weapon → the learned+equipped copy stays (the whole point — merge-not-clobber).
3. Slot a skill the current weapon already grants → allowed (deduped, harmless) — no special-case.
4. Suppress an active skill → greys + un-castable; clear → returns.
5. Old save (no fields) → empty pool/equipped → behaves exactly as today.
6. Learn the same skill twice → idempotent (Set).
7. `validate` on a tampered save with `equipped` ids not in `learned` or over capacity → dropped/clamped, no crash.

### Done When
Pick up + use a Tome of (some trick) → "[Learned …]" + it auto-slots (a free slot) → it appears on the wheel's Trick ring and casts (spends GP) → learn more than 6 → the extras sit in the GEAR pool un-slotted → open GEAR, swap the loadout → the wheel updates → equip/unequip weapons and the learned+slotted skills never vanish → save/reload preserves pool + loadout → (debug) add an id to `suppressedSkills` → that leaf greys + won't fire, remove it → returns. Console clean; old saves load unchanged.

---

## Gate 3 / 4 (filled during implementation)
- **Branch:** `feature/ring-builds` off `dev`.
- **Verification:** in-browser (`dev-server.py 3001` + `window.__game`, no local node) — drive `_learnSkill`/`_equipSkill`/`_refreshGrantedSkills` + the merge + a save round-trip + a suppression toggle; node unit tests for the store (merge, hasSkill, learn-auto-slot, save round-trip incl. old-save). Full smoke: learn→slot→cast→gear-swap→save/load with zero console errors.
- **Sequencing (impl-plan):** likely (1) store + merge + `hasSkill` + repoint checks (behavior-preserving with empty pool) → (2) `_learnSkill` + tome + save → (3) GEAR-tab loadout UI → (4) NH-2 suppression clause. Verify after each.
