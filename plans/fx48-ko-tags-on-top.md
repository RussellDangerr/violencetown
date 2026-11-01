# FX48 — KO tags draw on top, after every body and marker

## Goal

A fallen enemy has a `[KO] NAME` tag under its body. Today each tag draws at the moment its own
body does, in the depth sort. Anything sorted after it then paints over it: the body of whoever
lies one tile south, a prop, or a living ally's overhead markers (HP bar, badges, mood face).
After this change the tags that FX7 keeps are drawn in one pass at the end of the actor pass,
so every one of them reads in full over everything around it.

## How

- `_drawActors` already works out which tags to keep (nearest first, no overlaps). It now draws
  those tags itself, once, after the depth-sorted loop over props, enemies and the player.
- `_drawEnemySprite` no longer draws the tag when it is called from `_drawActors`; called on its
  own (as some tests do) it still draws the tag, as before.
- The tag's text, colour, size and position are unchanged. Which tags are kept is unchanged.

## Acceptance checks

- Every drawn KO tag is painted after every body, prop and marker in the same frame
  (`tests/ko-tags-on-top.test.js`, with a living ally and a prop standing south of a body).
- Before and after frames at 3440x1440 with a body beside other bodies and an ally marker.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

None. Only the order of drawing changes.

## Out of scope

- Which tags are kept (FX7), the tag's wording, colour or placement.
- Any other label (bump telegraph, nameplates, hit splats, the threat overlay).
