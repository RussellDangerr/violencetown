# MP3: the Map draws unvisited zones clearly fainter

## Goal
On the Map tab, a zone the player has never entered draws half-faded: its box (fill, outline) and
its name at 0.5 alpha, in the same colours a visited zone uses. Today it differs only by a dim
text and outline colour (MP2), which is easy to miss.

## Acceptance
- Unvisited zones draw at alpha 0.5; visited zones at 1. Clearly different at 3440x1440.
- The zone you are in and a quest target keep their current look (the target keeps its red ring
  and its GO tag), drawn at full alpha even if never entered.
- A test reads the alpha used for a visited and an unvisited zone and finds 1 versus 0.5.
- Evidence: 3440x1440 Map frames at a new game and after the Sewer.
- npm test, balance:check, naming grep and autoplay:check pass.

## Rests on
MP3R1, pick (a): "Half-faded: the whole zone box and its name at about half brightness", one alpha
value, 0.5. Builds on MP2 (the visited-zones record), which is unchanged.

## Out of scope
The visited record, saves, the connector lines, any other tab, and the dim text colour elsewhere.
Existing MP2 assertions that pinned the old dim colour change, because MP3R1 (a) changes the
behaviour.
