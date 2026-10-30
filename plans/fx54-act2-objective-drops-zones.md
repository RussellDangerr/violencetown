# FX54 — After Act 1, the objective and Map drop each Act 2 zone once you hold its item

## Goal

AE2's `to_act2` row always rings the Carnival, Factory and Graveyard. Once a zone's required
item is in the bag, that zone is done with, so it leaves the objective line and the Map's rings.
If the item leaves the bag, the zone comes back. With all three held, the objective moves on to
the bank's vault in Downtown.

## How

- A zone's item is read from its boss slot: the zone `CARNIVAL` owns slot `carnival.boss`, and
  `SLOTS[...].requiredDrop` (game/slots.js) names the item. No item id is written into the quest
  table, so renaming an item changes nothing here. The frozen area's slot is not in the list of
  Act 2 zones, so its ice cone never counts.
- The `to_act2` row keeps its static `objective` and `targetZones` (the full three), so anything
  reading the row as plain data still sees today's values. It gains a `narrow(qe)` function that
  returns the objective and zones for the zones still missing; `getHudText` and `getTargetZones`
  use it. The objective reuses the same words with fewer names, joined "A, B and C", "A and B", "A".
- A new row `to_downtown`, listed before `to_act2`: when the delivery is done and all three items
  are held, the objective is `[TEXT]` and the Map rings `DOWNTOWN` only.
- Rows still read only saved state (completed list, bag), so a reload shows the right row.

## Acceptance

- After the delivery with no required items: objective and Map read as they do today.
- One or two items held: those zones leave the objective and the Map's rings; drop one and it returns.
- All three held: objective is `[TEXT]`, Map rings Downtown only.
- The ice cone alone changes nothing.
- Evidence: 3440x1440 frames of the Map and objective with one item and with all three.
- `npm test`, `balance:check`, naming grep, `autoplay:check` pass.

## Rulings

None block it. It was approved by the loop on Caelan's Tweak it. The only new text is the `[TEXT]`
placeholder and the shorter joins of words already in the objective.

## Out of scope

- The real Downtown objective line (his to write).
- Retiring the row when Act 2's quests exist (AB3), or Act 3's row.
- Zones whose item is held but whose boss is unbeaten in some other way: holding is the test.
