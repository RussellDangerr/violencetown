# AA1: the game tells you when a shop sells armour you are missing

## Goal

Since the armour move, 5 of the 10 armour points are bought, not found: Latex Gloves from the
Corner Merchant in Downtown and the Cardboard Cuirass from Puck in the Factory. Nothing says so,
and the Act 2 zones are free-order, so a player can finish without opening either shelf.

Walking into a zone now puts one line in the log if that zone's shop has an armour piece you do
not own.

## Ruling this rests on

AA1R1, "How should the game tell you a shop sells armour you are missing?" Caelan picked (a):
a line in the log when you walk in, once per visit to Downtown or the Factory, while its shop has
a piece you lack. (A Map mark and a shopkeeper bark were not picked.)

## Acceptance

1. Walking through a door into a zone whose vendor stocks a body-slot armour piece you do not own
   logs one line, once per visit.
2. Once you own every such piece that shop sells, it stops. "Own" counts a piece worn or in the
   bag, so buying it is enough; you need not wear it.
3. A test drives the player through a real door with the arrow keys, sees the line, buys the
   piece through the shop with keys, and sees the line stop on the next visit.
4. Every word is the placeholder `[TEXT]`; the real words are Caelan's.
5. Evidence: a 3440x1440 frame of it showing.
6. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## How it is built

The zone-change block in `_advanceWorldOnce` moves unchanged into `_runPendingTransition()` so a
test can drive the real path. After `[Entered <zone>]`, `_armourShopNotice()` looks at the vendors
now in the zone and their `stock` (data, not a hard-coded zone list). Tests are
`tests/armour-shop-notice.test.js`.

## Out of scope

- The wording of the line (placeholder only).
- A Map mark, a shopkeeper bark, a quest or objective line.
- Any change to prices, stock or armour numbers.
