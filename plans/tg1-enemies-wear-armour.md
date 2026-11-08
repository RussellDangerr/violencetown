# TG1 - enemies whose kit lists armour wear one piece, and that piece is all their armour

## Goal

Thieve's Gear branch is lit only when an enemy declares worn gear, and almost
none do, so the branch is nearly always grey. This slice gives it something to
take: at spawn, an enemy whose kit lists armour puts on one piece of it, and
that piece's number is the only armour it has.

- Armour here means an item with an armour value and no wear timer (Foil Hat,
  Cardboard Cuirass, Latex Gloves, Shoe Bags, Red Cape). Bandage and Soap have
  armour only while a timer runs, so they are not clothes. A weapon is never worn.
- The piece worn is the heaviest by Thieve's own `gearWeight`, ties broken by
  authored order. Never random. (The loop's call, flagged on the card.)
- It moves from the kit to `equipped`. The enemy's own authored armour goes to 0
  and the piece's number is its armour: lifting the piece leaves it at 0.
- An enemy with no armour in its kit keeps its number exactly as it is, negative
  softness numbers included. (The loop's reading, flagged on the card.)
- Everyone wears, bosses included. A boss's authored number gives way to its
  piece, which is a retune and shows in the autoplay golden.
- Worn gear does not drop when the enemy dies; it is gone with them. The rest of
  the kit drops as before. (`main.js` drops the kit only, so no change is needed
  there; a test pins it.)
- The target panel shows the armour number and what they wear. The labels are
  placeholders, `[TEXT]`.
- Thieve's Gear takes the worn piece, as it already does.
- The balance check keeps reading an enemy's authored armour in the map and the
  registry, not what it wears, so it adds no new flags.

## Acceptance

1. An enemy whose kit lists armour spawns wearing its heaviest piece, and its
   armour on the target panel is that piece's number and nothing else; bosses
   included.
2. An enemy with no armour in its kit keeps today's number.
3. Gear is lit on them and takes the worn piece, leaving them at armour 0.
4. Killing a wearer drops the rest of its kit but not the worn piece.
5. Re-entering the zone or reloading does not put on a second piece, and a piece
   you stole stays stolen (it stands at armour 0, and no next-heaviest piece goes
   on in its place).
6. The balance check reads authored armour, so it adds no new flags.
7. `tests/ramp-route-gold.test.js` stops requiring that the fighter's Sewer haul
   covers the alcohol, in its own commit citing TG1R5. The alcohol stays 23 GP.
8. All three autoplay runs still finish quest 1; the drift is reported for the
   loop to accept citing TG1R4.
9. A test thieves Gear off a Greedy Green through the wheel with real keys.
10. Evidence: 3440x1440 frames of the target panel and of the Thieve wheel with
    Gear lit.
11. `npm test`, the naming grep and the guard pass; `balance:check` and
    `autoplay:check` pass once the loop has written the goldens.

## Rulings this rests on

- TGR1, picked (a): enemies whose kit lists armour wear one piece of it.
- TG1R1, picked (b): everyone wears, bosses too, with a retune.
- TG1R2, picked (b): worn gear does not drop; it is gone with them.
- TG1R3, picked (a): the balance check reads authored armour, not what is worn.
- TG1R4, picked (b): their own armour goes to 0, so the piece is all they have.
- TG1R5, picked (a): the alcohol stays 23 GP; a fighter finds the rest elsewhere,
  so the test that the Sewer alone pays for it stops covering the fighter.

## Rivals (Nemesis)

A rival's kit gets your items added after the piece is chosen, so a rival never
wears what it took from you: it stays in the kit, Thieve's Kit can lift it, and
a kill drops it back as before.

## Out of scope

- New names, copy or tuning numbers. The panel labels are `[TEXT]`.
- Authoring `equipped` on any spawn by hand.
- Writing the autoplay or balance goldens (the loop does, citing TG1R4).
