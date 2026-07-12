# Feature: PD-3 + NH-3 — AI-path consolidation (one FSM; capability / state / allegiance split)

**Phase:** Structural / tech-debt — unblocks Phase-2 NPC-AI behaviors (PD-6 flee/steal/doze) and the parked zone-pursuit.
**Priority:** High (structural).
**Status:** Design (approved 2026-07-11).
**Source:** `plans/cross-game-study.md` items **PD-3** (consolidate the two AI paths into one FSM) + **NH-3** (split immutable capability from mutable state). This spec is the deferred "own plan" that study called for.

> **Scope decision (Caelan):** *structural-only, behavior-preserving.* The game plays identically after this pass; it ships no new enemy behavior. **Approach:** *A — unify under the FSM* (relocate the chase into a `HOSTILE` state; don't rewrite it).

---

## Gate 1: Research

- **Genre References:** NetHack's `AiState` state-object-per-behavior + the `struct prop` intrinsic/extrinsic/blocked model (NH-3); Pixel Dungeon's `Mob.state` single polymorphic pointer (PD-3). VT already half-honors the base/policy split — `pathing.js` primitives (`getGreedyStep`/`hasLineOfSight`/`fleeStep`) are shared by both current paths.
- **Player Experience Goal:** *"The game plays exactly as it does today — but the AI is one legible system, so the next enemy behavior is a capability flag + a small state, not a second code path."* This pass is the enabling refactor; the payoff is future-facing.
- **Technical Feasibility — current state (verified 2026-07-11):**
  - **Two dispatch paths for one concept.** `enemies.js resolveEnemyTurns` (per player-turn) runs the **legacy chase** for `behavior == null` enemies (its `idle/chasing/returning` sub-machine + LOS + leash + the PD-1 last-seen pursuit) and routes only `_ally` behavior-havers to `tickNpcState`; it **skips** all other behavior-havers. `enemies.js resolveAmbientTurns` (heartbeat) routes non-ally behavior-havers to `npc.js tickNpcState` (`switch` over `IDLE/WANDER/WORKING/ALLIED/default` — **no `HOSTILE` case**). This dual-clock (hostile per-turn, ambient per-heartbeat) is deliberate and stays.
  - **`behavior` does triple duty**, mutated at runtime: **ontology** (`null` = born-hostile chaser vs array = ambient townsperson), **ambient-state whitelist** (which of `IDLE/WANDER/WORKING`), and **live allegiance** (rewritten to `['ALLIED']` on flip/summon, to `null` on provoke/ally-revert). `STATE.HOSTILE` is declared in `npc.js` but **dead** — no map data ever contains `'HOSTILE'`; the `.includes('HOSTILE')` half of every gate is dead code, so hostility today ≡ `behavior == null`.
  - **Hostility gate is duplicated at ~9 sites** as `(!e.behavior || e.behavior.includes('HOSTILE')) && !e._ally`, incl. the **two combat-critical** ones: `main.js _adjacentHostiles` and `_isHostileToPlayer`. Also `wheel-model.js` `targetVerbs`/`defaultVerb`, `items.js` thrown-AoE, `main.js` zone-pursuit set + `_onEntityHarmed`.
  - **Allegiance mutation sites:** provoke `_onEntityHarmed` (main.js:3605 — provokes ANY non-hostile non-ally by nulling `behavior`; there is **no** `canTurnHostile` gate today — everything is provokable, incl. Carrion), ally-flip `give-action.js:169` (`behavior=['ALLIED']` + `_ally=true`), summon (`behavior:['ALLIED']` + `_ally`/`_isSummon`), revert `_revertAlly` (main.js:3588 — `_ally=false`, `behavior=null`, `state='chasing'`).
  - **Save:** `behavior`, `_ally`, `fsmState`, `state` all serialize via `Enemy.toSave`/`fromSave` (PD-5). Allegiance is implicit in `behavior`/`_ally` today.
- **Scope (MVF):** behavior-preserving consolidation — (1) parse `behavior` → `capabilities` once at construction; (2) `allegiance` field replaces `behavior`-mutation + `_ally`; (3) one `isHostile(e)` predicate at all gates; (4) `tickNpcState` gains a `HOSTILE` state = the relocated chase, both drivers route by allegiance; (5) serialize `allegiance` + derive it from old-format saves.
- **Out of Scope:** folding hostility into the disposition axis (changes bribe/flip feel — not behavior-preserving); any new behavior (PD-6 flee/steal/doze — the model just makes room); a real `canTurnHostile:false` pacifist capability (everything stays provokable, as today); any map-JSON authoring change (`behavior` array stays the construction input).
- **Risks (top 3):**
  1. **Combat regression via the two critical gates.** → `isHostile(e)` is defined to equal *exactly* today's `!behavior && !_ally` at cutover; the chase moves **verbatim**; verify combat end-to-end in-browser (drive the real resolvers, as this session).
  2. **Save incompatibility** (behavior no longer the runtime source of truth). → `Enemy.fromSave` derives `allegiance`/`capabilities` from old-format fields; round-trip tests for old + new saves.
  3. **The FSM now formally owns combat movement.** → `HOSTILE`'s body IS the current chase relocated as-is (its `idle/chasing/returning` sub-machine intact); the dual-clock is preserved (`resolveEnemyTurns` still ticks hostiles per-turn).

---

## Gate 2: Design

### System Design — the data model

Three fields, parsed **once at construction**, replace `behavior`'s triple duty:

| Field | Kind | Meaning | Source at construction |
|---|---|---|---|
| `capabilities` | immutable `Set<string>` | ambient states this NPC may occupy (`IDLE/WANDER/WORKING`); future `FLEE/STEAL/DOZE` opt-ins | the authored `behavior` array (`null` → empty) |
| `allegiance` | mutable `'hostile'\|'neutral'\|'ally'` | which side the NPC is on right now | `null` behavior → `'hostile'`; else `'neutral'` |
| `fsmState` | mutable (existing) | current FSM node: `HOSTILE/ALLIED/IDLE/WANDER/WORKING/RETURNING` | derived from allegiance + capabilities |

- **`behavior` is demoted to a construction input** — parsed into `capabilities` + initial `allegiance`, then never read or mutated at runtime. Kept on the instance + serialized only for old-save derivation; new code ignores it. (Zero map-JSON churn — the authored format is unchanged.)
- **`isHostile(e)` ≡ `e.allegiance === 'hostile'`** — one exported predicate (home: beside `isCombatActive` in `wheel-model.js`, or a small shared helper; finalize in the impl plan) replaces the ~9 inline `!behavior && !_ally` checks. `_ally` reads become `allegiance === 'ally'`.
- The chase's internal `state` (`idle/chasing/returning`) becomes the **`HOSTILE` fsmState's private sub-machine** — unchanged, just owned by that state.

### The FSM & dispatch

- `npc.js tickNpcState` becomes the **single state dispatcher**; adds a `case HOSTILE` whose body is the **current legacy-chase block relocated verbatim** (LOS + leash + PD-1 last-seen; shares `pathing.js` primitives it already uses). `ALLIED` case unchanged.
- `enemies.js resolveEnemyTurns` (per player-turn): its `if (enemy.behavior) {…}` fork is replaced by routing on `allegiance` — tick hostiles + allies through `tickNpcState`; skip neutrals (heartbeat owns them). The inline chase block is **removed** (it now lives in the `HOSTILE` case).
- `enemies.js resolveAmbientTurns` (heartbeat): route `allegiance === 'neutral'` NPCs to `tickNpcState` (unchanged intent). The dual-clock is preserved by construction.

### Allegiance transitions (set the field, stop hacking `behavior`)

| Trigger | Site | Today | After |
|---|---|---|---|
| Provoke (attack/splash/insult a non-hostile non-ally) | `_onEntityHarmed` | `behavior=null; state='chasing'` | `allegiance='hostile'; fsmState=HOSTILE; state='chasing'` |
| Ally flip (give/bribe/dialogue crosses `flipThreshold`) | `give-action becomeAlly` | `behavior=['ALLIED']; _ally=true` | `allegiance='ally'; fsmState='ALLIED'` |
| Summon | summon ctor | `behavior:['ALLIED']; _ally; _isSummon` | `allegiance:'ally'` (+ summon fields via PD-5) |
| Ally revert (friendly-fire) | `_revertAlly` | `_ally=false; behavior=null; state='chasing'` | `allegiance='hostile'; fsmState=HOSTILE; state='chasing'` (matches today) |

### Integration Map

- **`enemies.js`** — `Enemy` ctor: parse `behavior`→`capabilities`+initial `allegiance`; `resolveEnemyTurns`/`resolveAmbientTurns`: route by `allegiance`, remove the inline chase.
- **`npc.js`** — `tickNpcState`: add `HOSTILE` case (relocated chase); `STATE` gains a live `HOSTILE`.
- **`main.js`** — `_adjacentHostiles`, `_isHostileToPlayer`, `_onEntityHarmed`, `_revertAlly`, summon, zone-pursuit set: use `isHostile()` / set `allegiance`.
- **`wheel-model.js`** — `targetVerbs`/`defaultVerb`: `isHostile()`; likely home of the `isHostile` export.
- **`items.js`** — thrown-AoE friendly filter: `isHostile()`.
- **`save.js` / PD-5 `Enemy.toSave/fromSave`** — serialize `allegiance` (+ `capabilities` or re-derive); `fromSave` derives from old fields.

### Data Schema (Enemy)

New: `capabilities` (Set), `allegiance` (string). Demoted: `behavior` (ctor input + legacy save field). Removed from runtime logic: `_ally` writes (reads → `allegiance==='ally'`).

### Save/Load Impact

- `toSave` adds `allegiance` (and `capabilities` as an array, or omit and re-derive from `behavior` on load — impl-plan call).
- `fromSave` **derives** when `allegiance` absent (old saves): `behavior===['ALLIED']` or `_ally` → `'ally'`; `behavior==null` → `'hostile'`; else `'neutral'`. `capabilities` re-derived from `behavior`. Old saves load identically.
- No `SAVE_VERSION` bump strictly required (derivation is lossless), but note it if the migration scaffold (PD-11) lands first.

### Edge Cases (≥5)

1. Provoke a `WANDER` townsperson mid-wander → flips to `HOSTILE`, chases; its `capabilities` still list `WANDER` but allegiance gates dispatch.
2. Flip a born-hostile (Knuckles) to ally, then friendly-fire → reverts to `HOSTILE` (not back to neutral — matches today).
3. Summon (Hire-a-Lion) → `allegiance:'ally'` + summon countdown (PD-5) survives a save.
4. Save mid-chase (a provoked NPC at `HOSTILE/chasing`) → `allegiance` + chase sub-state round-trip.
5. Load an **old** save (pre-`allegiance`) with a flipped ally + a born-hostile → both derive correctly.
6. A `behavior:['IDLE']`-only NPC (Carrion) struck → provokes to hostile (preserved: no `canTurnHostile` gate today).
7. Zone-pursuit capture set + the `_lastSeen` pursuit continue to work (they read `isHostile` + the relocated chase).

### Done When (play scenario)

Spawn into town: born-hostiles chase (with PD-1 last-seen through a corner); townsfolk wander/work on the heartbeat; strike a vendor → it turns on you; bribe a hostile past threshold → it fights *for* you; friendly-fire the ally → it turns back; save, reload → the provoked NPC is still hostile, the ally still allied, the summon still counting down; **console clean, combat/trade/give all behave exactly as before**. Plus: `grep` finds `isHostile(` at every former gate and zero live `behavior`-mutations.

---

## Gate 3 / 4 (filled during implementation)

- **Branch:** `feature/ai-consolidation` off `dev`.
- **Verification:** in-browser via `dev-server.py 3001` + `window.__game` (no local node) — drive `resolveEnemyTurns`/`tickNpcState` for each transition + a full save round-trip; node unit tests for `isHostile`, each allegiance transition, and derive-from-old-save (run under CI/`npm test`). Full smoke: the game RUNS (combat, provoke, flip, revert, save/load) with zero console errors.
- **Sequencing (impl-plan):** likely (1) data model + `isHostile` + derive-on-load behind the scenes with `behavior` still authoritative → (2) flip gates/transitions to `allegiance` → (3) relocate the chase into `HOSTILE` + reroute dispatch → verify after each. Keep each step leaving the game playable.
