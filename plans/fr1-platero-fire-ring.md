# fr1: Platero sets a Fire Ring from Fire Blood

## Goal
Platero's talk gets a second fashion choice beside the Rat Ring one. It takes three Fire Blood
(no gold) and gives the Fire Ring. With the Fire Ring plus the Rat Ring, the Ember Rat fusion
becomes reachable, and the thumb and pinky sockets get a second ring.

## Rulings
- FRR1 a (Caelan): Platero can set a Fire Ring.
- FRR2 c (Caelan): three Fire Blood, no gold.

## Build
- `game/dialogue.js`: a second repeatable choice on `platero`. Its label is a [TEXT] placeholder;
  its reply reuses Platero's existing line.
- `game/main.js`: `_fashionRing(materialId, ringId, count = 1, price = 0)` counts across bag
  stacks, takes exactly `count` and `price` gold only when both are met, otherwise takes nothing
  and logs today's "bring me the material" line. Existing callers behave as before.
- `tests/fire-ring-craft.test.js`: talks to Platero with real keys.

## Acceptance
1. Second choice shown; with 3 Fire Blood it takes 3 and gives the Fire Ring; without, nothing taken.
2. Fire Ring appears on the Hands tab; fire bonus and ignite use existing ring data.
3. Rat Ring + Fire Ring show the fusion and grant the Ember Rat (existing data).
4. Test uses real keys.
5. Evidence frames at 3440x1440.
6. npm test, balance:check, naming grep, autoplay:check pass.

## Out of scope
Choice copy, ring tuning, renderer or ring-data changes, any price in gold.
