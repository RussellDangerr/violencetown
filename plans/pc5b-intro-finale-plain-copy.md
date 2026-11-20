# PC5b: the intro and finale stand-ins say plainly what is happening

## Goal
No `[TEXT]` is left in `game/finale-setpiece.js` or `game/tv-intro.js`. Each moment of the
finale (the bite, the cloak, a refused blow, he rises, the coaching cue, the scream, the essence,
the costume) gets its own plain line, and the title card gets two plain lines.

## Rulings
- PCR1 (a), Caelan: plain, deadpan lines that say what the thing is, what it does and what the
  player should do. No jokes, no character voice, no story prose. `[TEXT]` never reaches a player.
- PC5R1 (b): this card takes the intro and finale; away/credits/bones/save belong to PC5.

## Acceptance
- The lines live in one exported table in each file (`FINALE_LINES`, `CARD.lines`) so tests pin them.
- Tests that pinned or counted `[TEXT]` in finale-phase1 / finale-phase2 / tv-intro assert the new
  lines instead, in their own commit.
- New `tests/pc5b-intro-finale-plain-copy.test.js`: no `[TEXT]` in either file, every moment has a
  distinct non-empty line.
- npm test, balance:check, naming grep, autoplay:check pass.

## Out of scope
- Sun Man's arrival line (`summonLine` in main.js) and the Financier/Sun Man dialogue in
  dialogue.js: other files, other cards. The phase 1 test that counts that one arrival `[TEXT]`
  stays as it is.
