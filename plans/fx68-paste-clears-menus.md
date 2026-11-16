# FX68: pasting a save code closes whatever was open

Goal: after a pasted code loads, no talk, offer, wheel, target pick, throw aim or inspect
panel from the old run stays open; the game is idle as after CONTINUE.

Today `loadInto` only sets the state to idle, and the paste path clears nothing else, so
fields from the old run survive.

Change: `Game._clearTransients()` in main.js resets those fields; `importSaveCode` calls it
after a successful load (not on a refused or rolled-back code). CONTINUE is untouched.

Checks: a test opens a dialogue, an offer and the wheel on a game, pastes a real code through
`importSaveCode`, and reads the state; a paste with nothing open changes nothing; a refused
code leaves things open; npm test, balance:check, naming grep, autoplay:check pass.

Rulings: none (loop-approved). Out of scope: any change to CONTINUE, new copy, new numbers.
