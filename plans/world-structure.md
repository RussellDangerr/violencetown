# World Structure Re-layout — Implementation Plan
**Phase:** World-building (structural pass — "build out the world" at structure depth)
**Status:** Development (Gate 3)
**Branch:** `feature/world-structure` (off `dev` — independent of the wheel/feel-pass; maps don't touch combat code).

> **Built inline**, verified in-browser via `window.__game` (no Node test runner; the headless splash start is audio-gated, so force `state='idle'` and drive moves/transitions directly). All 5 zones ALREADY EXIST as authored maps wired in the OLD radial layout (Graveyard N, Circus E, Sewer S, Factory W) — this is a **re-layout + entrance fixes + 1 new zone + a long-carnival re-author + Puck**, not a from-scratch build.

**Goal:** Re-lay the world to Caelan's new directional map, fix the confusing/incoherent entrances, add a blacked-out Wilderness border, make the Carnival long, and place Puck (inert merchant teaser) in the Factory. Deep content — bosses, element meters, party, the WORKING trade system — stays for later features.

## Target layout (confirmed via the world-map mockup)
```
                 [ NORTH BRIDGE ] — blocked, in-zone, the visible objective (needs the car)
                        | (N, no transition)
   FACTORY ──W── [ THE STREET ] ──E── SEWER (converter)
                        | (S)
                   CARNIVAL  (re-themed Circus, re-authored LONG / horizontal)
                        | (S)
                   GRAVEYARD
                        | (S)
                   WILDERNESS  (new; blacked-out; "too dangerous" turn-back border)
```

## Tile ids (from data.js) — for hand-authoring
Town/street: 10 TOWN_WALL(x) · 11 SIDEWALK · 12 ROAD · 13 GRASS · 14 BUILDING(x) · 15 DOOR · 16 SEWER_ENTRY · 17 FENCE(x) · 18 STREETLIGHT(x) · 19 CAR(x) · 20 BENCH(x) · 21 TRASHCAN(x). Set-piece: 22 PORTCULLIS(x) · 23 BARRICADE(x). Carnival: 30 CIRCUS_GROUND · 31 TENT_STRIPE(x) · 32 CONFETTI · 33 SAWDUST. Factory: 40 FLOOR · 41 WALL(x) · 42 GOO_VISUAL · 43 CONVEYOR_VIS. Graveyard: 50 GRAVE_DIRT · 51 GRAVESTONE(x) · 52 DEAD_GRASS · 53 IRON_FENCE(x). Sewer: 0 WALL(x) · 1 FLOOR · 2 SLUDGE(haz) · 5 DRAIN. ((x) = unwalkable.)

## Tasks (build in this order; verify each)
- [ ] **1. Town keystone** (`town-map.json`): E edge (16, 5–7) → `sewer-map.json`, landing on the sewer's WEST edge (coherent: walk east in town → arrive at the west side of the sewer, which continues east). S edge (7–9, 12) → `circus-map.json` (Carnival), landing on the carnival's NORTH edge. W edge (0, 5–7) → `factory-map.json` (keep). N edge (7–9, 0): **remove the graveyard transition**; make it a **blocked bridge** (e.g. a row of an unwalkable bridge/wall tile across the gap) + an **examinable objective** ("the bridge out of town — the car needs to run first"). Fix the sewer-entrance geometry as part of the E move.
- [ ] **2. Sewer return** (`sewer-map.json`): repoint its town-return transition so the sewer's WEST-edge exit lands the player back at the town's EAST entrance (coherent round-trip). (Sewer interior unchanged.)
- [ ] **3. Carnival re-author** (`circus-map.json`): rebuild as a LONG horizontal map (~29×11), themed carnival (CIRCUS_GROUND/CONFETTI/SAWDUST/TENT_STRIPE). Enter from the NORTH edge (from town's south); exit the SOUTH edge → `graveyard-map.json`. Keep the existing clown enemy + bandage, repositioned. zoneName → "CARNIVAL".
- [ ] **4. Graveyard rewire** (`graveyard-map.json`): N edge → `circus-map.json` (Carnival, land on its south end); S edge → `wilderness-map.json`. (Was: bottom→town.) Keep skeleton + soap.
- [ ] **5. Wilderness** (`wilderness-map.json`, NEW): small, all-dark map; N edge → `graveyard-map.json`; an entry message "[The wilderness swallows the light — too dangerous with no car, no lantern.]". + renderer **blackout** when `zoneName === 'WILDERNESS'`: heavy near-black overlay over the world with only a small dim radius around the player (you can barely see — the "no light" point). Honors reduce-motion (static, no flicker needed).
- [ ] **6. Puck** (`factory-map.json`): add a friendly, non-hostile, named NPC **Puck** (behavior `[IDLE]` like Carrion — not a combat target), examinable / a bark, a merchant-ish fallback sprite, placed somewhere readable in the factory. Inert for now; the working shop is the NEXT feature.
- [ ] **7. Entrance clarity:** at each town exit, an examinable/sign or marker so it's obvious you walk INTO the edge to travel (e.g. "→ EAST: the sewer" near the east gate). Keep the existing transition `label` logs.
- [ ] **8. Music (optional):** map `zoneName` → music in `main.js _loadMap` if non-town tracks exist; else leave the town default. Low priority.

## Verify (in-browser)
Force `state='idle'`; for each town edge, step the player onto the transition tile and run the world-advance, asserting the new `zoneName` + a coherent landing position; assert the north bridge tile is unwalkable and has no transition; enter the Wilderness and assert the blackout renders + the warning logs; assert Puck exists, is non-hostile (not in `_adjacentHostiles`), and is examinable. Confirm clean boot, no console errors.

## Out of scope (later features)
Working trade/vendor system + Puck's shop (NEXT feature — see economy-merchants.md + the captured refinements); bosses, element meters (Boredom/Sludge/Fun/Goo/Death), party/creature system; viewport widening (keeping VIEW_TILES=19). Deep per-zone content.
