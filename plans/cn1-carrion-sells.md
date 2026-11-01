# cn1 — Carrion sells Soap and Bandages, cheaper once you've bribed her

## Goal

Carrion, in the Sewer's south corridor, has always been written as a merchant: her
`onFlip` is `offerDiscount`, her map entry says she can be bribed, and the flip
promises "I'll work you a deal next time". Nothing behind that promise ever existed:
the flip only set a flag (`_discountMode`) that no code read, and she had no shop.

Now she is a vendor. Facing her and pressing E opens her shop with two things on
the shelf, Soap and Bandages. Her prices come from her disposition through
`trade.js`, the same as every other vendor's, so a bribe that raises her mood moves
her price band and the same items cost less. There is no separate discount number.

## Ruling it rests on

CNR1, pick (a), Caelan's own: "She sells Soap and Bandages, and your bribe makes
them cheaper, as it does with any vendor." Cost he accepted: she becomes a vendor,
with that list as her stock.

## What changes

- `game/sewer-map.json`: Carrion's entry gains `"vendor": true` and
  `"stock": ["soap", "bandage"]`. Nothing else about her moves: same tile, same
  disposition, same flip threshold, same adjacency bark.
- `game/give-action.js`: the `offerDiscount` flip stops writing the dead
  `_discountMode` flag. The case stays (so the flip is still a known mode and does not
  hit the unknown-mode warning), and the flip's log line is unchanged.
- No new price table, no new discount rule: no price arbitrage, prices stay a
  function of disposition only.

## Acceptance

- E facing Carrion opens her shop with Soap and Bandages.
- After a bribe flips her, the same items cost less than before.
- Talking to her still works: her adjacency line still fires once per approach.
- The test bribes her and opens the shop with real keys, through the real key
  listeners and the real offer-screen methods, on the real Sewer map.
- `give-action.test.js` pins that the flip no longer writes `_discountMode` and
  leaves her vendor and stock alone.
- Evidence: 3440x1440 frames of her shop before and after the bribe.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass. Carrion is
  on quest 1's route: if the autoplay golden moves, that is reported, not written.

## Out of scope

- Any new copy, names or tuning numbers. The stock list and the flip line are
  existing or Caelan's; any new line would be a `[TEXT]` placeholder (none are added).
- Carrion's dialogue, her barks, her sprite, her position.
- Other vendors, the band table, and the bribe cost curve.
