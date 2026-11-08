# fx25 — Drop puts the item on the ground under you, and says so

## Goal
The bag's Drop button used to empty the slot and the item was simply gone, with no log.
Now the whole stack in that slot lands on the tile you are standing on, through the
existing runtime drop record (`_recordDrop`, drops.js), and one plain mechanical log line
names what was dropped.

## Acceptance
- Drop moves the slot's whole stack onto the player's tile, one ground item per unit. It can
  be picked up again by stepping off and back on, and it survives leaving the zone and
  coming back (and a save/reload, through the drop record).
- A log line names what was dropped, in the style of the pickup line: `[Dropped <name>]`,
  with ` x<n>` when the stack is more than one. The wording is a placeholder-grade
  mechanical line and is flagged for Caelan's eye.
- A test drives Drop through the bag's real key handler (`_deviceKey`), not the resolver alone.
- Evidence: 3440x1440 frames before and after a drop.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## How it behaves
- Drop costs no world turn, as before.
- Pickup only runs when the player walks onto a tile, so a drop under your feet is not
  instantly re-collected; it is taken when you step off and back on. A pickup never starts
  a loot reel (the reel belongs to the kill burst).
- If the tile held an authored item of the same kind that you had already picked up
  (so its "collected" marker would hide the dropped copy on reload), the marker is lifted
  and that unit stands in for one dropped unit, so no copy is lost and none is doubled.
- Quest items keep the protection they have: the bag offers them no Drop at all.

## Rulings and picks
None block this. The log line is the only player-facing text; it is the loop's own wording,
flagged for review.

## Out of scope
- Any art for a dropped pile, and any change to how ground items are drawn.
- Dropping from equipment, the quick bar or the trade grid.
- NPCs picking dropped items up (npc.js already treats every ground item alike).
