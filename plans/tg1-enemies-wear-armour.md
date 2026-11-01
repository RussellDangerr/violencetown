# TG1 - enemies wear one piece of the armour they carry

## Goal

Thieve's Gear branch is lit only when an enemy declares worn gear, and almost
none do, so the branch is nearly always grey. This slice gives it something to
take: at spawn, an enemy whose kit holds armour puts on one piece of it.

- Armour here means an item with an armour value and no wear timer (Foil Hat,
  Cardboard Cuirass, Latex Gloves, Shoe Bags, Red Cape). Bandage and Soap have
  armour only while a timer runs, so they are not clothes. A weapon is never worn.
- The piece worn is the heaviest by Thieve's own `gearWeight`, ties broken by
  authored order. Never random.
- It moves from the kit to `equipped` and adds its armour to the enemy's
  authored number, clamped into Law 3's band the way `gearTake` clamps.
- The target panel shows what they wear. The label is a placeholder, `[TEXT]`.
- Thieve's Gear takes it, lowering their armour, as it already does.

## Acceptance

1. Those enemies spawn wearing one piece; the panel's armour is the authored
   number plus the piece's.
2. Gear is lit on them and takes the worn piece, lowering their armour.
3. Re-entering the zone or reloading does not put on a second piece, and a piece
   you stole stays stolen (no next-heaviest piece goes on in its place).
4. The balance harness counts the worn piece. Its golden moves, as TGR1 (a)
   accepted; that goes in its own commit.
5. If quest 1's autoplay moves, stop and ask "accept the new golden?".
6. A test thieves Gear off a Greedy Green through the wheel with real keys.
7. Evidence: 3440x1440 frames of the target panel and of the Thieve wheel with
   Gear lit.
8. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings this rests on

- TGR1, picked (a) by Caelan: enemies wear armour they carry, and fights change
  as a result.
- "Heaviest" is the loop's call, flagged on the card.

## Rivals (Nemesis)

A rival's kit gets your items added after the piece is chosen, so a rival never
wears what it took from you: it stays in the kit, Thieve's Kit can lift it, and
a kill drops it back as before.

## Out of scope

- Dropping a worn piece when the enemy dies (that lives in `main.js`).
- New names, copy or tuning numbers. The panel label is `[TEXT]`.
- Authoring `equipped` on any spawn by hand.
