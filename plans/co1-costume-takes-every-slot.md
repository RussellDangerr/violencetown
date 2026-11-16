# CO1 — A costume takes every slot and brings its own kit

## Goal
One test costume proves the system. Put it on and every equipment slot holds the costume's kit
with its fixed stats; take it off and your own gear comes back exactly as it was. Putting it on
(and taking it off) is a use of the item and so costs a turn, like any equip.

## How
- `game/costumes.js` holds the costume table (kit by slot, its own skill ranks) and pure
  functions: `wearCostume`, `removeCostume`, `toggleCostume`, `dropCostume`, and the save helpers.
- A costume item (`useType: 'costume'`) lives in the bag. Using it toggles: wearing stashes the
  player's equipment and skill record in `game.costume` and replaces both with the costume's;
  using it again restores the stash.
- Equipping or unequipping a piece is refused while one is worn (`resolveEquip`, `unequipItem`
  in `game/items.js`); a refused piece goes back to the bag.
- `game/save.js` persists `game.costume` (left out while none, so old saves are unchanged).
- `game/main.js`: the two use paths route a costume item to the toggle and spend the turn; death
  and a new game drop the costume.

## Acceptance
- Wearing the test costume fills every equipment slot with its kit and its fixed stats.
- Taking it off brings back your own gear exactly as it was.
- Changing a piece, and skill ranks, follow the rulings.
- Wearing it survives a save and load.
- 3440x1440 screenshot of the equipment panel before and after.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on
- COR1 a: a costume is a second kind of wearable; it takes every slot and brings its own kit.
- COR2 a: no changing a piece while worn; to change it, take the whole costume off.
- COR3 a: it has its own skill ranks; yours rest while worn and come back when it comes off.

## Placeholders
Name `[Test Costume]`, description `[TEXT]`, bag icon a flat fallback colour, the kit is today's
existing pieces, and its skill ranks are a single placeholder entry.

## Out of scope
Where costumes are found, more costumes, a distinct body sprite, a take-off button on the gear
panel, and what a temporary equip (soap) does across a costume change.
