# rs1: RESTART starts a clean log and fresh hint pacing

Goal: a new game after RESTART shows only its own lines. The [L] log history, the dock strip,
the fight's combat feed (which reads the same history) and the log scroll all start empty, and
the hint cooldown counts from the new game's turn 0 instead of the old run's late turn.

Acceptance
- After RESTART the history and strip hold only the new game's lines.
- The combat feed after RESTART starts empty (it is derived from the history).
- After a late-turn hint, RESTART lets the first unseen hint show on the new game's schedule.
- A test drives RESTART through the real menu-sheet handler with confirm stubbed to accept.
- npm test, balance:check, naming grep and autoplay:check pass.

Rulings: none; approved by the loop under the standing delegation.

Out of scope: settings and hintsSeen deliberately survive RESTART and are untouched. No words
or numbers change.
