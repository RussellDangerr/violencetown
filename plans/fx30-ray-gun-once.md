# FX30 - the Ray Gun comes once

## Goal
The Alien Invasion carries the Ray Gun in his kit (plans/ab2-alien-boss-fight.md moved it
off the Factory floor), and beating him hands it over. A save made before that move may
already hold the gun from the old floor spot, so the kill gave a second one. He now leaves
the gun out of his drop when the player already has it.

## "Already has it" means either of
- the save remembers the old floor gun as collected (its `_collectedItems` key,
  `factory-map.json|3|2|ray_gun`, the spot it used to lie), or
- the player holds a Ray Gun right now. This uses the game's `hasItem` lens, which walks the
  bag, the equipped gear and temp-equips, so a gun worn in the weapon slot counts too.

Everything else in his kit still drops as before. A fresh game has neither, so it still
gets the gun from him.

## Acceptance
- Floor gun already collected, or a Ray Gun in the bag or on the player: beating the Alien
  gives no Ray Gun (nothing in the bag, nothing on the floor, no burst icon for it).
- A fresh game still gets the Ray Gun from him.
- npm test, balance:check, the naming grep and autoplay:check pass.

## Rulings
None. No copy, names or numbers change.

## Out of scope
- Any other boss item or any other weapon in a kit.
- A gun the player once held and then sold or lost is not tracked beyond the key above; if
  the key is absent and nothing is held, he gives one.
- Changing the Alien's loadout or the map.
