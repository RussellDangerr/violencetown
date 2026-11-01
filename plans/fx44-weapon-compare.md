# FX44 - comparing weapons

## Goal

You get a drop, or see a sword in a shop, and today the game says one thing about it: "16 dmg".
It does not say what you are holding, so you cannot tell if it is better, and it does not
say how many hands it takes, what class it is, or that it grants a skill (Fearmur's Boo!, the
Ray Gun's Ray Blast, the Lion Whip's Hire Lire and its reach and pull).

One compare block, built in one place (`game/inspector.js`) and shown in the three places a
player meets a weapon:

1. the bag: select a weapon and the inspector panel shows the block;
2. examine: looking at a weapon on the ground shows the same block in the examine panel;
3. the shop: the description strip of the offer screen shows the same block for the
   highlighted row, whether it is theirs or yours.

## The block

Plain mechanical lines, built from the weapon's own data and nothing written new:

- damage, with its type when it is not physical, and the difference from the weapon in the
  right hand (the hand a plain Equip fills), e.g. `16 dmg (+4 vs Wooden Sword)`;
- hands and class, e.g. `1 hand, hammer`;
- reach and pull, when the weapon has them;
- the skills it grants while held, by the names the skill tables already carry, with their cost.

A weapon that is already the one in hand says so instead of a difference. With nothing in
the hand there is no difference to show, so only the damage is given.

## Acceptance

- Selecting a weapon in the bag shows damage, the difference from what you hold, hands, class
  and granted skills.
- Examining one on the ground, and highlighting one in a shop, show the same block.
- The test opens the bag with real key events through the game's own input handler, and drives
  examine (E) and the shop the same way, then reads what the renderer draws.
- Evidence: frames at 3440x1440 of the bag, examine and shop.
- npm test, balance:check, the naming grep and autoplay:check pass.

## Rulings

None. The loop tweaked and approved the card. The wording of the fixed words in the block
(`dmg`, `hand`, `hands`, `reach`, `pulls`, `Grants:`, `vs`, `same as`) is a plain placeholder
listed for the owner's eye.

## Out of scope

- Armor and other gear (the gear chooser already shows its armor delta).
- Weapon perks, attack kinds, and `onHit` effects such as the Fearmur's fear on a repeat hit.
- Comparing against the left hand.
- Any change to damage numbers, the shop's layout rects, or `main.js`.
