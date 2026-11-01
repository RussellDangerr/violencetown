# fx41 - the newest dock message wraps instead of being cut

## Goal

The dock's log shows its message feed one line per message, each cut with a `~` when it runs
long. The longest messages are the ones that matter: quest 1's finale line explains why the car
cannot make the ramp, and the cut hides exactly that part.

The newest message now wraps onto as many lines as the feed has room for. Older messages keep
one line each, cut as today.

## How

- The feed has a line budget it already owns: `hud.log.lines` (3 on the dock, 4 on the fight
  face, 2 on the corner layout). The panel's height is laid out for exactly that many feed
  lines, so wrapping must stay inside the budget; nothing in `layout.js` moves.
- The newest message is word-wrapped to the panel's inner width (`wrapToWidth`, already in
  `renderer.js`). If it needs more lines than the budget, it takes the whole budget and the last
  line is cut with `~` as before.
- Whatever budget is left after the newest message goes to the older messages, one line each,
  newest first. So a message that wraps pushes the oldest visible line out, rather than
  growing the panel.
- Feed rows stay bottom-anchored, so nothing collides with the header or the objective line:
  the first feed row can never start above the line after the objective.
- A message that fits on one line draws exactly as before.

## Acceptance

- Quest 1's finale line (the car roars but cannot make the ramp) reads in full in the dock at
  3440x1440 and on a phone-sized screen.
- Older messages still take one line each.
- A test drives `_drawQuestLog` itself (not just the helper) at 3440x1440 and a phone width,
  and checks every drawn row stays inside the panel and rows do not overlap.
- Before and after crops of the dock.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings

None. Standing delegation; no copy, names or numbers are added.

## Out of scope

- Any change to `layout.js` or panel sizes. If a phone could not fit the finale inside the
  existing budget this would be a ruling; it does.
- The [L] history modal (it already wraps).
- Rewording any message.
