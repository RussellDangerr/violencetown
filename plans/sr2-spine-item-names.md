# SR2 — the spine records the item names and that quests may open new areas

**Date:** 2026-10-31
**Branch:** `feature/sr2-spine-item-names`
**Touches:** `plans/spine.md` only. No code, nothing on screen.

## Goal

`CLAUDE.md` says a change to a Locked row of the spine needs Caelan's ruling, recorded in
`plans/spine.md` with its date, naming what it replaces. Caelan has now ruled twice on the Act 2
items and once on gates. This slice writes those rulings into the spine and nothing else.

## What is recorded

1. **The three Act 2 required items are named** (Caelan, 2026-10-30):
   - Carnival: a stuffed animal you win.
   - Graveyard: a soul crystal.
   - Factory: the flux capacitor.
2. **Who gives, takes and earns** (ruling SP1R1, option a, "swap them"):
   - The Factory gives its item: you are given the flux capacitor at the end of the Factory.
   - The Graveyard takes: you take the soul crystal in the Graveyard.
   - The Carnival's stays earned: you win the stuffed animal.
   - This **replaces** the 2026-10-25 entry (Graveyard given, Factory taken, Carnival earned).
3. **The gate rule** (Caelan, 2026-10-30): the main map stays open, and a new quest may open new
   areas beyond it, RuneScape-style. This **replaces** the spine's SA-6 line, *"The three Act 2
   zones stay open ... The one gate in the game is the finale's, and it asks only for the three
   items."* The three Act 2 zones still stay open and the finale is still gated by the three
   items; what changes is the claim that the finale is the only gate. A quest may now gate a new
   area beyond the main map.

## Acceptance checks

- Spine §9 has a dated entry naming the three items and which zone gives, takes and earns.
- Spine §9 has a dated entry for the gate rule, naming the SA-6 line it replaces.
- Spine §1, §3 and §8 no longer call the names open, and the SA-6 line in §1 reads the same as
  the new entry.
- Nothing outside `plans/spine.md` changes.
- `npm test` and the naming grep pass.

## Rulings this rests on

- SP1R1, picked (a): swap them. Factory gives, Graveyard takes, Carnival earns.
- Caelan's item names, 2026-10-30.
- Caelan's quest-gates answer, 2026-10-30.

## Out of scope

- Any item id, item stats, descriptions or art. The names above are the ones he gave; ids and
  copy are separate work.
- The quests themselves, how each zone's quest plays, and the interim boss drops (unchanged).
- Everything else about those items. This file records only the three names, who gives, takes
  and earns, and the gate rule.
- The same SA-6 line in `species-adventures.md`; that file is outside this slice's touches.
