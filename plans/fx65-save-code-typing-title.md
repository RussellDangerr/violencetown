# FX65: typing in the save-code box no longer starts the game

Goal: on the title, Space typed into the save-code box (or pressed on COPY CODE / PASTE CODE)
must not start or continue the game, and a key typed into a text box must not skip the intro.

Fix: the title's Space handler and the intro skip use the same typing-target guard other key
handlers in main.js already use (INPUT / TEXTAREA; the title Space also yields to a focused BUTTON).
The stale "no inputs exist today" comment is corrected.

Acceptance: Space in a focused text box leaves the title untouched; Space on a focused button is
not swallowed; Space with nothing focused still starts or continues; the intro skip ignores
typing. Test fires real keydown events at a text box and at the page.

Rulings: none (scout defect). Out of scope: any other handler, any copy or layout change.
