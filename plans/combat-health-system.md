# Feature: Combat & Health System
**Phase:** Phase 2 — Life in the City
**Priority:** Critical
**Status:** Research — PARTIALLY SUPERSEDED (2026-03-30)

> **Design Evolution Note (2026-03-30):**
> The 5-Zone Body System (Top/Front/Back/Sides/Bottom) is CONFIRMED and now maps 1:1 to equipment slots. Flat 100 HP is superseded. Positioning-based targeting survives.
>
> **What changed:** The time model is under reconsideration (ABC Decision Matrix Cat. 1). If the game moves from tick-based to Pixel Dungeon hybrid, combat pacing changes fundamentally — actions resolve per-move instead of per-tick. The combat math (flat armor, no missing, deterministic damage) still applies.
>
> **What's new:** "Looney Tunes combat" — slapstick environmental interaction (shoving dumpsters, throwing frying pans) is now a core combat verb, not a Phase 3 addition. No shields. Possibly all two-handed weapons.
>
> **Depends on:** ABC Decision Matrix Category 1 (Time Model), Category 2 (Inventory/Equipment).
> **See:** `plans/abc-decision-matrix.md`

---

## Gate 1: Research & Discovery

### Genre References

1. **Cataclysm: Dark Days Ahead** — Turn-based roguelike with transparent combat math. Every hit connects, damage is deterministic based on weapon/armor values. Players can mentally model outcomes before committing. The transparency builds trust and rewards system mastery.

2. **Brogue** — Minimal stat roguelike where combat is lethal and readable. No stat bloat — HP is low, damage is clear, armor is flat reduction. Every encounter is a meaningful decision because the numbers are small enough to reason about.

3. **Dwarf Fortress (Adventure Mode)** — Everything in the world uses the same combat system. A rat biting cheese and a warrior swinging a sword resolve through identical mechanics. Universal rules create emergent stories.

4. **Caves of Qud** — Tick-based combat where action economy matters more than raw stats. Missing is possible but rare; the drama comes from what you choose to do with limited actions, not RNG rolls.

5. **Into the Breach** — Perfect information combat. The player always knows exactly what will happen. No hidden rolls. This creates puzzle-like tactical depth from simple rules.

### Player Experience Goal

"Every hit lands, every number makes sense, and the player can do the math in their head — combat feels like chess, not slot machines."

### Technical Feasibility

**Affected Modules:**
- `player.js` — Needs HP (already has hp/maxHp stub), armor stat, `takeDamage()` method, attack action type in the queue
- `data.js` — Weapon damage values already exist on item definitions (pipe: 8, knife: 12, crowbar: 10). Need armor values on NPC definitions (not yet created)
- `map.js` — NPCs will exist on tiles; combat needs to check adjacent tiles for targets. Ground item drops on death
- `ui.js` — Damage numbers in the text log. Potentially floating damage on canvas (stretch goal). HP bar already rendered in status panel
- `main.js` — Tick resolution needs to process combat actions alongside movement. Action queue already supports one action per tick

**Known Constraints:**
- 10-second tick system means combat is slow and deliberate — every action is precious. This is a feature, not a bug, but it means "missing" would feel terrible (validates the no-miss design)
- Single action per tick: player must choose between moving and attacking. No attack-of-opportunity or multi-action turns
- Seeded RNG (Mulberry32) must be used for any damage variance to maintain determinism

**What Already Exists:**
- Player has `hp` and `maxHp` fields (player.js)
- Items have `damage` values in data.js (pipe: 8, knife: 12, crowbar: 10)
- Action queue system processes one action per tick
- Text log can display combat messages
- Status panel shows HP

### Scope — Minimum Viable Feature

**In scope:**
- Universal 100 HP for all entities (player and NPCs)
- Flat armor as damage reduction: `actual = max(1, raw - armor)`
- Player attack action: queue "attack [direction]" like movement
- Melee combat only (adjacent tiles)
- Damage sourced from equipped weapon (or fists fallback: 5-8 damage, creature-dependent — see `plans/fists-fallback-weapon.md`)
- Combat messages in text log ("You hit the Rat for 7 damage. The Rat has 43 HP.")
- NPC death: remove from map, drop loot on tile
- Player taking damage from NPCs (resolved on NPC's tick action)

**Out of scope for this pass:**
- Ranged combat
- Critical hits or damage variance beyond weapon range
- Status effects (poison, bleed, stun)
- Armor degradation
- Environmental damage from hazard tiles (sludge/radiation) — separate feature
- Combat AI beyond "attack adjacent player" — that's the NPC AI brief's territory
- Floating damage numbers on canvas (text log only for MVF)
- Weapon durability

### Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Combat feels too slow at 10s ticks** | High | The tick timer already has urgency flash at 2s. Combat log messages should be punchy and dramatic to make each tick feel weighty. If needed, tick speed could be a future tuning knob, but don't optimize prematurely. |
| **NPC system dependency** | High | Combat requires NPCs to exist on the map. This feature MUST be developed after or alongside NPC Spawning. Define the combat interface (takeDamage, getArmor, isDead) so both features can develop against the contract. |
| **Action queue complexity** | Medium | Currently the queue handles move/wait/pickup. Adding "attack" is straightforward, but resolving attack vs. move when an NPC is on an adjacent tile needs clear priority rules. Design: if player moves into an occupied tile, it becomes an attack. Simple, discoverable. |

---

## Design Decisions — LOCKED

These were decided in earlier design sessions and are not open for debate:

- **No missing.** Every attack connects. Variance is in damage amount, not hit chance.
- **Flat armor per zone.** `actual_damage = max(1, raw_damage - zone_armor)`. One line. Done.
- **Damage as single numbers.** You hit for 7. Clean, readable, no dice notation.

## Design Decision — UPDATED (2026-03-24)

**The flat 100 HP universal system is superseded by the 5-Zone Body System.**

See `plans/game-research-findings.md` for full spec. Summary:

All characters have 5 hit zones: **Top** (head), **Front** (chest), **Back** (accessories/capes), **Sides** (arms), **Bottom** (legs).

- Zone hit is determined by **attacker's tile position** relative to target — no attack menus.
- Front/Back/Sides = common (standard NESW positioning).
- Top/Bottom = rare and powerful (limited verticality makes these special).
  - Top hit: daze + extra damage (only from above — rooftops, ladders)
  - Bottom hit: movement cripple (only from below — sewer grates, floor holes)
- Each zone has its own HP and armor value. A chest armor protects Front, not Back.
- Prosthetics (Glow-zone tech) can replace damaged zones and exceed organic performance.
- Non-human creatures use the same 5 zones mapped to their anatomy.

## Open Questions (For Gate 2)

- What are the per-zone HP values? Equal splits from a total pool, or zone-specific?
- ~~Bare hands damage: fixed 1, or 1-3 range?~~ → **RESOLVED.** Fists are 5-8 damage, creature-dependent. See `plans/fists-fallback-weapon.md`.
- Do different weapons target different zones by default, or is it always position-based?
- Can armor degrade? (Fits Phase 3 bag damage / item durability)
- Do environmental hazards use this same damage formula?
- How does this scale into Phase 5 taxi-mounted weapons?
- How does the 5-zone system interact with NPCs that have faction-specific gear (Clown armor, Bandit cloaks)?
