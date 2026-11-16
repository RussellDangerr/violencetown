# OP1: a key opens Options

Goal: a keyboard player can reach Options without the mouse.

Ruling OPR1, pick (a): the O key opens Options. It works in play and from the pause
screen. Esc closes Options as it does today.

Acceptance:
- O opens Options from play and from the pause screen.
- O does nothing while typing in a text box, on the title, with a browser chord
  (Ctrl/Alt/Meta), on key repeat, or when Options, Help or the key screen is already up.
- Help's "Other" list names the key, as short as its neighbours (placeholder wording).
- A test lifts the real listener and fires real key events at it.
- npm test, balance:check, naming grep, autoplay:check pass.

Built as a small capture-phase listener (`_bindOptionsKey`), leaving `_bindInput`,
FX67's gate and FX65's title Space guard untouched.

Out of scope: rebinding keys, a touch equivalent, any other Help copy.
