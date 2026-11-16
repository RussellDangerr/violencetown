# LH1: a bare right hand fights with fists

## Goal
Holding a two-hander and picking a one-hander for the left hand leaves that one-hander in the
left hand and the right hand bare (the equip rule already does this). Every place that reads the
right hand for a swing used to assume a weapon and crashed on null. A bare right hand now fights
with fists.

## Rulings it rests on
- LH1R1 (b): the one-hander stays in the left hand, the right hand is bare, and every attack path
  learns a fists weapon with a name and damage.
- LH1R2 (a): fists do 5, half the Wooden Sword's 10.

## Build
- `game/weapons.js` exports `FISTS` (a frozen def, a fallback only, never a bag item or an ITEMS
  entry) and `handWeapon(eq)`: the right hand's weapon, or FISTS when it is bare.
- `game/main.js`: the tap-hit, the wheel Hit, Cleave and Spin read `handWeapon`.
- `game/renderer.js`: the HUD weapon line shows the fists' name and damage.
- The plain-unequip rule in `game/items.js` that refuses to bare the right hand stays; the
  left-hand equip path is what bares it.
- The left-hand weapon still does nothing in a fight, so fists land even with a sword in the left.

## Acceptance
1. Pick a one-hander for the left hand while holding a two-hander: it stays left, right is bare.
2. A bare-right-hand attack hits for 5 and the turn runs.
3. The HUD weapon line shows the placeholder name `[Fists]`.
4. The test drives real keys and fails on the old crash.
5. Evidence: 3440x1440 frames of GEAR and of a fist hit.
6. npm test, balance:check, naming grep, autoplay:check pass.

## Out of scope
- The fists' real name (placeholder `[Fists]`), art, and sounds.
- Giving the left-hand weapon a combat role.
- Loading a save with a bare right hand (save.js is outside this slice).
