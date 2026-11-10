# PK1 — copy your save as a code, paste it back in

## Goal
Two entries in the Options panel: one copies the current game as a text code, the other
pastes a code back in and restores the game. No network; the code only leaves the browser
through the player's own clipboard.

## How
- `game/save.js` gains `encodeSaveCode(game)`, `decodeSaveCode(text)` and
  `importSaveCode(game, text)`.
- A code is `VT1.<checksum>.<base64url of the save JSON>`. The checksum catches a garble that
  still decodes to valid JSON.
- A pasted code is decoded, then goes through the existing `migrate` + `validate` (via
  `loadInto`). Anything that is not a code, fails the checksum, is not JSON, or comes from a
  newer save version is refused with a `[TEXT]` message.
- If `loadInto` throws part-way, the pre-import state is serialized first and loaded back, so a
  bad code cannot leave a half-loaded game.
- `game/main.js` and `game/index.html`: two buttons and a text box in the Options modal. Copy
  tries the clipboard and always fills the box so the player can copy by hand; Paste reads the
  clipboard and falls back to the box.

## Acceptance
- Copy then paste restores the exact same game (proved by serialize equality after a round
  trip through the real encode/decode/loadInto).
- A garbled or old-format code is refused with a `[TEXT]` message; the current game is untouched.
- Screenshot at 3440x1440 of the two entries.
- npm test, balance:check, naming grep, autoplay:check pass.

## Rulings
None. Labels and refusal messages are `[TEXT]` placeholders; copy is Caelan's.

## Out of scope
Final wording, a confirm step before overwriting, file export, any network sharing,
styling in style.css.
