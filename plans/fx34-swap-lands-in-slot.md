# FX34 — the weapon you swap out lands in the slot the new one came from

## Goal

Equipping a piece of gear from a bag slot used to put the piece it replaced in the first free
pack slot, which could be far away and left the slot under the cursor empty. Now the piece
swapped out lands in the very slot the new one left.

## How

- The equip leaves its bag slot first, then resolves with that slot named. `resolveUse` takes an
  optional last argument, the bag slot; `resolveEquip` puts the first displaced piece there when
  it is empty.
- If the slot is still occupied (a stack of two) or more than one piece comes out (a two-hander
  pushes out both hands), the rest go to the first free place, as before.
- Three callers pass the slot: the Remoticon bag's Use/Equip action, the GEAR chooser (right
  and left hand and armour plates), and the hotbar Use.

## Acceptance

- Equipping from a bag slot puts the old weapon in that same slot.
- Two-handers and the left hand follow the same rule.
- The test equips through the bag with real keys (the Remoticon's `_deviceKey`).
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings

None. Nothing a player reads or tunes changes; only where an item lands.

## Out of scope

- Same-id swaps (equipping a sword while wielding the same sword) keep today's behaviour.
- Unequip ("Bare") still goes to the first free slot: there is no source slot.
- Temp-equips and non-equip uses.
