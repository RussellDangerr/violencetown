# EW1: the Sewer's fungi carry the chart's earth row

Goal: the Sewer's ordinary foes stop being neutral to everything. The three fungi (Violet,
Red, Ghost; map enemies e1-e5) are earth, like the Sludge Bloom beside them: weak to Energy and
soap (clean), resisting cold and fear. The lists come from `weaknessesOf('sludge')` and
`resistancesOf('sludge')` in game/elements.js (sludge is the earth damage type), the way the
cold foes in game/slots.js take theirs.

Rulings: EWR1 (a), the Sewer's ordinary foes first as a trial, other zones after he has seen
it. EWR2 (a), all three fungi are earth; the Fungus King, the Were-Rat (boss slot) and Carrion
(a vendor) stay as they are.

Acceptance: each fungus carries those lists; a new test (tests/foe-phases.test.js) pins every
covered foe's lists against the chart; Fireball, Cone of Cold or soap meets a weakness or
resistance in the Sewer (energy and soap are weaknesses, cold is resisted); balance and autoplay
drift are put to Caelan as their own questions before any golden is written.

Out of scope: other zones, the boss, the vendor, tuning numbers, golden files.
