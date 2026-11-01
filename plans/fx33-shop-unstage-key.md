# fx33: in the shop, the keyboard can take an item back out of your offer

## Goal

On the offer screen (the shop, a chest, a bribe) a keyboard player can stage an item with Space
but cannot take one back: unstaging is a tap on a tray slot. The only keyboard way out of a
mistake is Esc, which throws away the whole basket. This slice gives the keyboard an unstage key
that takes ONE unit of the row under the cursor back out of its tray, and prints the key in the
screen's footer.

## How

- The key is Backspace, not a second press of Space. Space on a staged row has to keep staging
  another unit (a vendor's stock is infinite, a bag stack holds several), and the existing
  Carrion shop test already stages two bars with two Space presses. So the undo gets its own key.
- Backspace on a row finds that row's entry in its tray and routes through `_offerActivate` on
  the tray slot, the same path a tap takes, so pointer and keys cannot drift. A row with nothing
  staged is left alone. The gold is re-settled as for any unstage.
- The footer legend gains one entry, `BKSP UNSTAGE`, beside `SPACE STAGE`. It is a plain
  mechanical key label, flagged for Caelan's eye.

## Acceptance

- With the keyboard you can stage an item and take it back out one unit at a time.
- The footer lists the key.
- The test drives the shop with real keys through the real input listeners.
- Evidence: 3440x1440 frames staging and unstaging.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings

None. The card was approved by the loop under the standing delegation. The one deviation from
the card's note (Space toggling) is the key choice above, and it is listed for review.

## Out of scope

- A key for the gold chip (still tap only).
- Changing how the pointer unstages, the tray layout or any prices.
