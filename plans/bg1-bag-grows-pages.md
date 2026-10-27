# The bag grows another page whenever it runs out

## Goal

Nothing is ever refused for a full bag. Today the bag is 50 slots: a SAFE row of 10 (kept on
defeat) and a PACK of 40 (at risk), and once every slot is taken a pickup is refused. After this
slice, a pickup that finds the PACK full opens a new page of 40 PACK slots and lands there. The
SAFE row stays 10 slots. The bag screen pages through the PACK; the SAFE row shows on every page.

## Acceptance

- Picking something up with a full PACK adds a page instead of refusing. The same holds for
  every other way an item enters the bag: a grant from a spot you examine, a quest gift, a theft,
  moving an item out of SAFE, and taking or buying on the trade screen (its "bag is full" blocker
  goes away).
- The bag screen shows which page you are on (`1/2`) and moves between pages with the keyboard
  and with a tap on an arrow either side of the PACK grid. With one page, nothing new is drawn.
- The trade screen lists every item on every page; its existing scroll reaches them all.
- A save with several pages reloads them; a one-page save is unchanged on disk.
- Defeat rules are unchanged: SAFE (slots 0 to 9) and quest items are kept, every PACK page is
  at risk.
- `tests/bag-pages.test.js` pins the model, the paging, the save round trip and the defeat
  split. Evidence frames of page 1 and page 2 at 3440x1440 and on a phone (scratchpad only).
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

- **FX3R2, pick (a):** with auto-loot on, the bag never fills: it grows another page whenever it
  runs out. Its stated cost is that the bag and trade screens learn to page.

## Choices this slice makes (flagged for review)

- A full PACK opens a new page rather than spilling into a free SAFE slot. SAFE stays something
  you fill on purpose. (Before, with no growth, a full PACK spilled into SAFE.)
- Page keys in the bag: `,` / `.` and PageUp / PageDown. Arrow taps sit left and right of the
  PACK grid. The label is a plain `1/2`.
- The bag opens on page 1. Empty pages are kept until a new game.
- The trade screen is a scrolling list of your items, not a grid of slots, so it has no pages of
  its own: page 2's items are simply further down the list.

## Out of scope

- Auto-loot itself (FX3), which builds on this.
- Sorting, or pulling items across pages.
- Any copy, names or tuning.
