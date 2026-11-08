# HP1 — Rest to heal fully

## Goal
Face a bench, press E, and rest: out of a fight your HP and MP go to full and a few hours pass.
In a fight the rest is refused and nothing heals.

## Acceptance
- Facing a rest spot out of a fight, E heals HP (and MP) to full and pays the cost HPR3 picks.
- In a fight, E on it refuses and nothing heals.
- The over-head label shows the rest verb before the press.
- A test walks to a bench and presses E with real keys.
- Evidence: 3440x1440 frames before and after a rest.
- npm test, balance:check, naming grep and autoplay:check all pass.

## Rulings it rests on
- HPR1 b: facing a rest spot, E rests; a new verb in the default-verb table so the label telegraphs it.
- HPR2 a: any bench is a rest spot (Town has four); benches added later work too.
- HPR3 b: the cost is a few hours passing, the same day-clock jump the defeat path uses
  (`_skipTime('hours')`). No new number.
- HP1R1 a: touches widened to wheel-model.js, renderer.js and the affordance-matrix test.

## How
- `wheel-model.js`: a `rest` verb; `defaultVerb` picks it for a rest-spot target.
- `affordances.js`: the matrix row for the new verb (no tag edges).
- `main.js`: `_restSpotAt` (a bench tile), `_targetAt` returns it, the `rest` resolver heals,
  skips time and autosaves, or refuses in a fight.
- `renderer.js`: the faced bench gets the same over-head label an NPC does.
- Walking into a bench does not rest; only E, F and the target list do.
- The pinned verb count in the matrix test goes 26 to 27 in its own commit.

## Out of scope
Final label word and refusal line (placeholders), non-bench rest spots, sleeping through the
night, any cost beyond the time skip.
