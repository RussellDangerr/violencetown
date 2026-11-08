# FX10 — the label over the enemy you face sits clear of its alert icon

## Goal

Face a character and a label appears over its head: its name and what bumping it will do
("GOON · HIT"). A character that has noticed you also wears an awareness icon over its head
(the question mark, exclamation or alert balloon from the threat overlay). Both are drawn in
the same rows above the head, so on a hunting enemy beside you the icon sits on top of the
label and hides part of it.

When the faced character is wearing an awareness icon, the label moves up so its box sits
wholly above the icon. When there is no icon, the label stays exactly where it is today.

## Acceptance

- With a hunting enemy beside you, its name-and-verb label reads in full above the alert icon.
- A test pins that the two boxes don't overlap (`tests/intent-label.test.js`), for each
  awareness state that draws an icon, and pins that the label does not move when no icon shows.
- Before and after shots at 3440x1440.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## How

`game/renderer.js` gets two small exported helpers so the label and the icon agree on where
the icon is:

- `awarenessMarkRect(sx, sy)` — the box the awareness icon is drawn in, used by the threat
  overlay's draw.
- `showsAwarenessMark(e)` — whether that icon is up for a character (a watcher with eyes,
  not an ally, in a state that has an icon).
- `intentLabelRect(px, py, tw, raised)` — the label's backing box and text position; when
  `raised`, the box's bottom edge sits one pixel above the icon's top edge.

The label draw asks `showsAwarenessMark(e)` and raises itself when it is true.

## Rulings it rests on

None. The card itself asks for the label to rise above the icon when both show.

## Out of scope

- The mood-face disc and buff badges, which also share rows over the head.
- Any change to the icon itself, its art, or when it shows.
- The ambient chatter balloon (it already stands down while an awareness icon is up).
