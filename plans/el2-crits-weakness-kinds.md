# EL2: weakness x1.5, crits from two kinds, knockouts from three

## Goal

Today a weakness doubles a hit (x2), a backstab is x1.5, and nothing is ever a crit: the gold-ring
crit splat exists but no hit sets it. This slice puts Caelan's crit rule into the one damage
pipeline (`game/combat.js` + `combatAttack` in `game/main.js`):

- Every weakness is **x1.5**, and weaknesses of different kinds **multiply**.
- A hit counts its weakness **kinds**. There are three:
  - **element**: the hit's damage type is one the target is weak to;
  - **direction**: a backstab (the tile directly behind the target's last step);
  - **state**: the target is feared or poisoned.
  Being both feared and poisoned is still one kind: the state kind.
- **Two kinds is a crit** (x2.25): the hit wears the gold-ring crit splat.
- **Three kinds is a knockout** on anything that is not a boss: the hit takes all of its health.
  A boss takes the plain product instead (x3.375).

The Sludge Bloom follows the weakness chart (`game/elements.js`): sludge is earth, and wood opens
earth, so it is weak to **energy and soap (clean)**, and no longer to fire. Its health drops from
100 to 60 so its keys still open it in a few turns at x1.5.

The balance harness reads the new multiplier, so its "informed" column (a reference hit on a
weakness) is 20 x 1.5 = 30 a turn instead of 40. That moves the balance golden on every row, so
the build stops and asks before the golden is rewritten.

## Acceptance checks

- `elementalMult` gives x1.5 on a weakness; resist (x0.5) and immune (x0) are unchanged.
- A hit with two weakness kinds deals x2.25 and sets the crit splat; one kind is not a crit.
- A hit with three kinds empties a non-boss's health whatever its armour; a boss takes x3.375
  and is not knocked out.
- Feared and poisoned each give the state kind; both at once still count once.
- The Sludge Bloom is weak to energy and clean, not fire, and has 60 health; steel still floors to
  1 a turn; the Ray Gun opens it in a handful of turns; soap still opens it in one use.
- The tests that pinned x2 (and the Bloom's fire weakness and 100 health) change in their own
  commit, which says the behaviour changed.
- New tests in `tests/crit-kinds.test.js` pin the kinds, the crit, the knockout, and the
  `combatAttack` wiring.
- `npm test`, the naming grep, the limezu grep and `autoplay:check` pass; `balance:check` passes
  once Caelan accepts the new balance golden. Until then the golden test is the one expected red.

## Rulings and picks it rests on

- **The crit rule (Caelan, 2026-10-06, written down in `plans/el1-weakness-chart-data.md`):**
  x1.5 per weakness kind, multiplied; three kinds is a knockout on a non-boss; a crit marker
  shows; enemies crit you too.
- **Which chart:** Wu Xing by the five climates (`game/elements.js`, EL1).
- **Does the Bloom stay weak to fire?** No: soap and energy are its keys.
- **How does the Bloom still open at x1.5?** Lower its health from 100 to 60.
- **Which states count?** Feared, plus poisoned.
- **Where a hit comes from:** the back is x1.5, everything else x1 (no flanks).

## Calls this slice makes (flagged for his eye)

- A puzzle wall is exempt from the Hundred (Law 0) in the harness lint, as it already is from the
  armour cap, because the Bloom's 60 is his ruling, not a data error.
- "Boss" means an enemy with `boss: true` or a tag ending `_boss`, the two ways the game already
  marks one.

## Out of scope

- Enemies critting the player (the player has no weakness lists or states that count yet).
- The crit **preview** marker on a target before you swing (a renderer change), hit-stop, and any
  log word or splat word for a crit or a knockout: those need copy and art picks.
- Grounded fliers, spun and soaked as states: they count when they are built.
- Wiring the chart into every enemy's lists. Only the Bloom has a weakness today.
- Changing the Law 4 role bands' target numbers; only the derived tables are recomputed.
- Rewriting the balance golden or the autoplay golden.
