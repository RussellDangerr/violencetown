# BP3: every finished quest hands you a boon poition

## Goal
Each quest pays one boon poition, once per game: canyon_escape, deliver_burger and fix_car when
they complete, and each of the three Act 2 items when it is claimed. The quest's other pay
(deliver_burger's 50 GP) is unchanged.

## Rests on
- BP1: the `boon_poition` item exists and raises max MP when drunk.
- BPR2 pick (a): one boon poition for every quest; drinking it asks which kind. No per-quest table.

## How
- A saved flag `boon_<quest id>` (Act 2: `boon_act2_<zone>`) in the quest engine's flags is set when
  the boon is paid, so a forced completion or a reload never pays twice.
- Paid from `QuestEngine._complete` and `act2Claim` through `_grantItem`. The bag adds a page when
  full, so it never refuses and nothing needs to drop at the player's feet.
- One log line per pay. Placeholder text: `[TEXT]`.

## Checks
- Each of the six sources pays exactly one boon.
- Completing again, forcing completion, or save/reload pays nothing more.
- A full bag still receives it.
- npm test, balance:check, naming grep, autoplay:check. Autoplay drift goes to Caelan as its own
  question; the golden is not rewritten here.

## Out of scope
- Choosing the boon kind on drinking (BP-later), the boon's name/description copy, game/main.js changes.
