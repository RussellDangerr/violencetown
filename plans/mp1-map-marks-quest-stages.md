# MP1 — the Map marks where every quest stage wants you

## Goal

The Remoticon's MAP tab already rings the active quest's zone in red and writes "» GO" under it,
but only when the current quest stage names a `targetZone`. Today only the burger delivery does.
On "Get your converter back from the sewer" the Map marks nothing, so the one screen meant to
answer "where do I go?" is silent on the main quest.

This slice gives every quest stage that has a place a `targetZone`, and makes content-validate
insist on it: every stage either names a zone or says outright that it has none
(`targetZone: null`). A new stage that forgets cannot slip in unnoticed.

## Each stage's zone, read from the maps

| Quest / stage | Zone | Where the objective is |
|---|---|---|
| fix_car / examine_car | TOWN | the `car` examinable, town-map.json |
| fix_car / recover_converter | SEWER | the converter drops from the `sewer.boss` slot, sewer-map.json |
| fix_car / escape_sewer | SEWER | the barricade set-piece runs inside the sewer |
| fix_car / return_to_car | TOWN | the car, town-map.json |
| canyon_escape / find_way_out | CANYON | Pike and the grapple anchor, canyon-map.json |
| deliver_burger / get_burger | DOWNTOWN | already authored (the Diner sits inside Downtown) |
| deliver_burger / handoff | DOWNTOWN | already authored (`dt-recipient`, downtown-map.json) |

No stage today is without a place, so none uses `null` yet; the check accepts it for the day one
does.

## Acceptance

- On "get your converter back", opening the Remoticon and its Map tab with real keys rings the
  Sewer in red with "» GO" under it.
- Every stage of every quest names a zone or `null`; content-validate reports a stage with neither,
  and a stage naming a zone that is not on the map.
- A node test drives the real key listeners (Tab, then M) and reads what the Map draws.
- Screenshots at 3440×1440 of the Map on the first two fix_car stages (scratchpad only).
- npm test, balance:check, the naming grep and autoplay:check all pass.

## Rulings and picks it rests on

None. The ring and "» GO" are already drawn; no words, names or numbers are added.

## Out of scope

- Any change to how the Map draws (when you stand in the target zone the box shows YOU, ringed red).
- Interiors as targets: the Map has boxes only for overworld zones.
- New quest text, locations or descriptions for the Journal.
