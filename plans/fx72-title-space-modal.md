# FX72: Space on the title waits while the help or Options window is open

## Goal
FX67 made game keys stop while the Options window, the help window or the key screen is up, but
left the title's own Space listener (FX23, FX65) alone. So on the title, with the help window
open, Space still continued a save or started a run behind the window. This finishes FX67's rule
on that one listener.

## Acceptance
- Help window open on the title: Space changes nothing; the splash stays, no run starts.
- Options window open on the title: the same.
- No window open: Space still continues a save or starts a run, as before.
- A test drives the title's real Space handler with a window open and with none.
- npm test, balance:check, naming grep and autoplay:check pass.

## Approach
Inline check in the title's Space listener in game/main.js, using the same "element exists and is
not hidden" test as _bindInput. Kept inline (no new import) so lifted-source tests keep working.

## Rulings
None; approved by the loop under the standing delegation.

## Out of scope
The key-once screen on the title, moving FX67's check out of _bindInput, any visible change.
