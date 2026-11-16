# FX64: a bare right hand survives a save

Goal: a save made with nothing in the right hand reloads with the right hand still empty (fists),
and the left hand keeps what it held.

Cause: the save writes an empty right hand as null, and the load treated null like "no entry" and
fell back to the weapon the game already held.

Fix (game/save.js only): an explicit null right hand loads as bare. A save with no right-hand
entry at all still loads with the default weapon.

Acceptance:
- Bare right hand plus a one-hander in the left reloads bare, left unchanged.
- A weapon in the right hand reloads as before.
- A save with no right-hand entry loads with the default weapon.
- tests/save-bare-hand.test.js round-trips all three through the real serialize and loadInto.
- npm test, balance:check, naming grep, autoplay:check pass.

Rulings: none; scout defect on top of LH1 (bare hand fights with fists).
Out of scope: any change to how fists fight, save version bump, other slots.
