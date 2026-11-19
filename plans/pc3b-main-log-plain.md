# pc3b-main-log-plain: the log lines in main.js say plainly what happened

## Goal

Every line a player reads that `game/main.js` writes (the `_log` lines, labels, the cutscene
and dialog lines) is plain, flat, bracket-free and true to what the code does. No `[TEXT]`, no
whole-line brackets such as `[Dropped Rock x2]`.

## Acceptance checks

1. No player-visible `_log` line, label or cutscene line in `main.js` carries square brackets.
   This covers the fight-join line, Sun Man's summonLine, the continue line, the zoom line, the
   save-key dialog, and the whole-line log brackets.
2. Flavoured lines become factual. Shove lines say what moved and which way it now faces
   ("You shove the Carnival Clown 1 tile. It now faces away from you."). The door jam, sludge and
   goo on bagged feet, the rock, the Fearmur, rat form, the ring slots and the summon whistle say
   what happened, checked against the code first.
3. "Drive north over the bridge" says alcohol in the tank is needed, as the bridge cutscene code
   requires. Confirmed by reading the code before writing it.
4. Every line is true to the code; each one is checked against the effect it describes.
5. Old tests that pin these lines are re-pinned exactly, in their own commit, never looser.
6. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.
7. Evidence: 3440x1440 frames of three changed log lines.

## Rulings it rests on

PCR3 (Caelan, 11-17): AI-written creative lines become deadpan facts; every name stays; his
quoted lines and the design facts in `plans/` stay; no square brackets on player text; every line
matches the code.

## Left as it is on purpose

`unnestBrackets` (in `_log`) and the overhead bark strip's call stay. Bark data still carries
brackets until PC2b merges, and PC12 removes them. Once log lines carry no brackets,
`unnestBrackets` has nothing to do on log text, and that is harmless.

## Out of scope

Bark data, dialogue files, item text, anything outside `game/main.js`.

## Status

Blocked before the build: the copy rule says to grep `tests/` first, and many tests outside this
slice's touches pin the lines to be changed (`combat-log`, `bag-drop`, `spell-log`,
`save-unreadable-kept`, `grapple`, `restart-clears-log` and many more). The touches need widening
to cover them.
