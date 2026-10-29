# The delivery order includes the ice cone

## Goal

Quest 2 (`deliver_burger`, "Special Delivery") stops being burger-only. The order is the burger
and fries plus a Tiger's Blood Ice Cone (the item from IC1), and the hand-off to the traveler
only finishes once both have been handed over. Quest 1 is not touched.

## Acceptance

- After picking up the burger, the quest sends you for the cone, pointing at the Factory, where
  both of the cone's sources start.
- The hand-off needs both items. Handing over one, by talking or through the satchel, leaves
  the quest on the hand-off and does not finish it.
- A save made part-way keeps what you have picked up and what you have already handed over.
- A GIF at 3440x1440 of getting the cone and handing over the order (scratchpad only).
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass, and the autoplay
  does not move (it only plays quest 1).

## Rulings it rests on

- **The cone (IC1, merged):** `tigers_blood_ice_cone` exists. It is not a quest item and its
  value is 0.
- **The Factory bill (IC6, merged):** pay the Factory manager's bill, use the part on the
  diner's machine, and the machine makes one cone.
- **Where the cone comes from (ICR1, his answer):** more than one way. Beating the tiger snowman
  in the frozen area also gives one, once that is built. This slice keys on the cone itself, not
  on where it came from, so the frozen area counts the moment it drops one.

## How it works

- **A stage that needs several items.** A quest stage waiting on `item_given` may list
  `items: [...]` instead of one `match.item`. Each listed item handed to the matching NPC is
  recorded in the quest's saved counters (`<stage>/<item>`); the stage advances only when every
  listed item has been handed over. An item not on the list, or one already handed over, does
  nothing.
- **The satchel give** asks `expectsDelivery(item, npc)` before it lets a quest item go. For a
  stage with `items` it says yes only for a listed item not yet handed over.
- **The dialogue hand-off** asks the quest engine what is still owed (`owedItems()`), offers the
  `deliver` choice only while you hold all of it (`holdsOwed()`), and hands it all over in one
  pick (`handOver(npc)`), emitting the same `item_given` event per item that the satchel does.
- **The quest data.** A new stage, `get_cone`, sits between `get_burger` and `handoff`. It
  advances on picking up the cone, and is already satisfied if the cone is in the bag (the same
  rule `get_burger` uses), so getting the cone before the burger still works. Its target zone is
  the Factory. The hand-off lists both items.
- **A lost cone.** The cone is not a quest item, so it can be lost, and the machine makes only
  one. While the delivery still needs a cone, the machine is fixed, and none is in the bag, the
  diner cook hands over another. Without that, losing the cone would stall the quest until the
  frozen area exists.
- **Old saves.** A save on the old hand-off (stage 1) loads on `get_cone`, which is already done
  if the cone is held, so it carries on correctly.
- **Text.** Every new or changed line (the new stage's objective, location and description, the
  hand-off's, the cook's new choice) is `[TEXT]`.

## Out of scope

- The frozen area and the tiger snowman.
- Any real copy, any change to the reward, any rename of the traveler.
- Eating the cone, ants, or the cone melting.
