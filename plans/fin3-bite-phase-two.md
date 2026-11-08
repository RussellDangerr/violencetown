# FIN3 — The Bite, the cowering, and phase 2 against Monstrous Sun Man

**Parent:** `plans/cosmology-and-arc.md` ("The Final Arc": the Bite, the Coaching, phase 2),
`plans/fin2-financier-fight.md` (phase 1, whose "Sun Man leaves" moment this slice replaces).

## Goal

After this slice the finale plays out to its end. Sun Man fights beside you for three turns as
before. After his third turn the Financier bites him, once. Sun Man throws his sun cloak over his
face, goes to a corner of the vault and cowers there, taking no turns while he changes. You finish
off the weakened Financier alone, and then Sun Man rises as Monstrous Sun Man. Phase 2 is you
against him, and it is winnable: he screams now and then, and a scream is the window in which he
can be hurt. The coaching cue says so. Beat him and the game records that it is over, for the
credits slice (FIN4) to read. Every line the player reads is `[TEXT]`.

## The shape

- **`game/finale-setpiece.js`** (new, in the sewer set-piece pattern: plain functions that take
  the game, called from thin methods in `main.js`). It owns every phase-2 name and number:
  `FINALE_PHASE2` (tags, the flag, the beast's block, the scream rhythm) and the functions
  `biteSunMan`, `riseSunMan`, `finaleTick`, `blocksCowerHit`, `restoreFinale`, `resetBeast`.
- **The Bite** replaces "Sun Man leaves". When his summon timer ends, `biteSunMan` runs instead:
  a `[TEXT]` line, the Financier still gets `weakened` (FINR7 b), Sun Man is no longer a summon
  (so the timer's cleanup keeps him), goes to the nearest free corner of the room and faces the
  wall. The event `sun_man_leaves` becomes `sun_man_bitten` (nothing else read it).
- **Cowering** is derived, not stored: Sun Man (his tag), still an ally, no longer a summon. That
  survives a save and a reload with no change to the enemy save shape. A cowering Sun Man takes no
  turn (`_allyTakeTurn` returns at once), cannot be struck (a blow at him is refused with a line),
  and can be talked to (the existing `sun_man` stub).
- **The rise** (FINR8 a): when the Financier falls, phase 1 is won as before; then, if Sun Man is
  there (cowering, or, if the Financier fell before the third turn ended, still a summon, who is
  bitten in the same breath), he is replaced where he stands by Monstrous Sun Man: a hostile
  boss, the stand-in boss block copied from the Financier's entry with its kit emptied, wearing a
  borrowed existing picture. The coaching cue is shown (log and overhead). Event
  `monstrous_sun_man_rises`.
- **Phase 2's one trick**: he is wrapped in sunlight (a big defence rider, so ordinary blows do
  one point). Every few turns he screams: for a few turns the sunlight is down (the shield goes,
  a `weakened` drop comes on, shown as the red W) and he loses his attack. Hitting him then is the
  game. The rhythm is a pure function of the turn number, so it survives a reload with nothing
  stored. A hook at the end of each world turn (`_finaleTick`) keeps it in step.
- **Winning phase 2**: the quest flag `finalePhase2 === 'won'` (saved with the quest state) and
  the one-shot event `finale_phase2_won`, plus a `[TEXT]` line for the absorbing. FIN4 reads these.
- **Losing**: the boss retry sends Monstrous Sun Man back to his corner at full health, calm.
  Losing in phase 1 after the Bite restarts phase 1 as before (Sun Man is removed with the rest).
- **Leaving the vault**: doors keep working. If phase 1 is won and phase 2 is not, entering the
  vault finds Monstrous Sun Man waiting in his corner, and the Financier does not come back (FIN2
  left that call to this slice). Once phase 2 is won the Financier stays gone.

## The hook FIN4 uses

`questEngine.state.flags.finalePhase2 === 'won'` plus the one-shot game event `finale_phase2_won`.
Phase 1's `finalePhase1` and `finale_phase1_won` are unchanged.

## Placeholders (all listed for Caelan)

- Monstrous Sun Man's HP, armour and damage are the Financier's stand-in boss block; the scream
  rhythm, the shield and the exposed drop are stand-ins tuned only so the weakest gear wins.
- His look is the existing placeholder boss picture; the cowering pose is Sun Man facing the
  wall in the corner. No new art.
- Every line is `[TEXT]`.

## Tests

`tests/finale-phase2.test.js` plays the real fight with the real keys: the Bite after turn 3,
the cowering, the rise, the scream window, the win and the flag, the lost fight, and the
winnability table for every weapon at 0, 5 and 10 armour. The FIN2 tests that asserted Sun Man
leaves are updated in their own commit, because the acceptance changes that behaviour.

## Out of scope

Credits (FIN4), the costume (FINR1), real lines, names, numbers or art, a new sprite, the Sunpyre
and New Game+, taking the three items from the bag, the bank's placeholder Financier.

## Rulings it rests on

- **FIN2 (merged)**: the vault fight; the Bite replaces the moment Sun Man leaves.
- **FINR1 (a)**: Sun Man as a costume you wear; arc context only, nothing built here.
- **FINR8 (a)**: Sun Man rises as the beast when you finish off the weakened Financier alone.
- Caelan's notes, 2026-10-22 and 2026-10-25: the Bite comes after Sun Man's third turn, not at a
  health threshold; he cowers under his cloak while he turns; the coaching is "hit him when he
  screams".
