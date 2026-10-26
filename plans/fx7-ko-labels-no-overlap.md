# FX7 — KO labels under fallen enemies never overlap

## Goal

Every fallen enemy gets a `[KO] NAME` tag centred under its body. The tag is wider than a tile,
so when bodies lie side by side (the sewer after the rat waves) the tags print on top of each
other and none of them can be read. After this change, no two KO tags on screen overlap: a tag
that would overlap one already placed is left out, and tags are placed nearest to the player
first, so the bodies closest to you keep theirs.

## How

- A pure function in `game/renderer.js` takes the frame's candidate tags (a box for each:
  centre x, top y, width, height, distance to the player) and returns the ones to draw. It sorts
  by distance (ties keep the order given) and skips any box that overlaps a box already kept.
- `_drawActors` collects the candidate tags of every fallen enemy on screen before it draws,
  asks that function which to keep, and `_drawEnemySprite` draws only the kept ones. The tag is
  still drawn at the same moment in the depth sort as today, so layering against other sprites
  does not change.
- `_drawEnemySprite` called on its own (outside `_drawActors`, as some tests do) still draws its
  tag, as before.

## Acceptance checks

- After the sewer rat waves, every KO tag on screen reads cleanly; none overlap.
- `tests/ko-labels.test.js` pins that no two drawn KO tags overlap, that the nearest body keeps
  its tag, and that bodies far enough apart all keep theirs.
- Before and after frames at 3440x1440.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

None. The tag's text, colour and position are unchanged; only which tags are drawn changes.

## Out of scope

- Allies' overhead markers covering a KO tag (seen by the scout) — a different overlap.
- Any other label kind (the bump telegraph, nameplates, hit splats).
- Moving or restacking tags to fit them all in; a tag that would overlap is simply skipped.
