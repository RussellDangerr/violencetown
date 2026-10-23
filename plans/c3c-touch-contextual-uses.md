# C3c: touch can reach "use this on that"

## Goal

An item's contextual uses (soap on sludge, alcohol in the car's tank) live in the
item overlay, and the only way in is a digit key and then Space. A touch player
cannot get there at all. This slice adds one more button to the Remoticon's item
inspector that opens that same overlay. It shows only when the selected item has
a use on something you face or stand beside right now.

## How it works

- `contextualUses(itemDef, game)` (game/item-uses.js) already answers "does this
  item have a use here". The new button shows exactly when that list is not empty
  and the item is not a quest item (the overlay refuses quest items anyway).
- The button sits on the inspector's action row, to the right of Drop. Its rect is
  worked out in `game/inspector.js` from the existing panel and action-row rects,
  so `game/layout.js` is unchanged.
- Pressing it closes the Remoticon, holds the item as a digit key would, and calls
  `_openItemOverlay()`. The list you get is the one Space gives a keyboard player.
  The tap and the keyboard cursor both go through `_deviceActivate`, so keys can
  reach the button too.
- Its label is a placeholder, `[TEXT]`. The label is player-facing copy and has
  not been written.

## Acceptance

- On touch you can reach every contextual use a keyboard player can.
- The button only shows when the item has a use nearby.
- A 3440x1440 screenshot of the button on soap, next to sludge.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

None. The loop chose an inspector button as the way in. The label is copy, so it
stays `[TEXT]` until Caelan writes it.

## Out of scope

- The label's wording.
- Moving or resizing the existing Use / Protect / Drop buttons (that needs
  `game/layout.js`).
- Any new contextual use, and any change to what a use does.
- Pressing Esc in the overlay returns to the held item, as it does today. It does
  not reopen the Remoticon.
