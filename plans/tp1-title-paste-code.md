# TP1: paste a save code from the title screen

## Goal
A player on a new device can bring their save in without first starting a game: the title gets a
third button under CONTINUE that opens a paste box, takes a save code, and enters the game.

## Acceptance
- The title shows a paste button; its label is a `[TEXT]` placeholder until it is worded.
- A valid code loads (`importSaveCode`), is written to disk as the Options paste does
  (`writeSave`), and enters the game as CONTINUE does (splash gone, game shown, canvas fitted).
- With a save already on disk it asks first with the exact line RESTART and GAME START use.
  Cancel leaves the title and the save untouched.
- A code that will not read leaves the player on the title, the save untouched, with a `[TEXT]`
  status line (the existing refusal lines from `save.js`).
- Space on the title still yields to the focused box and buttons (FX65).
- `tests/title-paste-code.test.js` drives the real title handlers with a valid code, a bad code
  and a save on disk.

## Rulings
- TPR1 (a): a third button under CONTINUE opens a paste box on the title.
- GS1R1 (a): replacing a save asks first with RESTART's confirm line, reused verbatim.
- A code that will not read shows a `[TEXT]` status line.

## Out of scope
Final wording of every label and line, any `style.css` change, and the Options paste path itself.
