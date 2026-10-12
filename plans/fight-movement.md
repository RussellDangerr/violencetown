# Free movement in fights, and a start without one

**Status:** built 2026-10-11 on `fix/fight-movement`, merged to `dev` (`f18ff9c`), not yet released.

## Why

Caelan, 2026-10-11: when a fight starts the player is locked in place, which reads as the game
having broken. Moving in a fight must work exactly as it does outside one (click, tap, held key),
even if that means whoever follows lands a few blows on your back as you walk away. And the game
should not open on a fight: Knuckles, near the start, chased you on sight. That was there to test
the fight button, and it now does more harm than good.

## What changes

1. **Reverse trim 3e** (`plans/trim.md`). It stopped a held or clicked walk when a fight started or
   someone noticed you, and in a fight made every step need a fresh press. A click-to-walk in a fight
   was dropped before its first step, so a click did nothing at all; a held key moved one tile. Now
   `_onStepSettled` walks the same in and out of a fight. The only stops left are the old ones:
   walls, a hostile in the way, a chest, a hazard.
2. **Knuckles starts neutral** (`"behavior": ["IDLE"]` in `town-map.json`). He keeps his low mood,
   his weapons and his lines; he just stands in the plaza. A fight with him starts when you start
   it: hit him (the wheel confirms hitting someone who isn't hostile), or taunt him in conversation
   until his mood drops past -40. Talking him down still makes him an ally.

## Verify

`npm test` (the 3e tests now pin the reverse: a held key, a buffered press and a click path all
step in a fight); balance; naming; the autoplay (stage scores unchanged; the end fingerprint moves
because Knuckles ends the run neutral). In the real game: walk right past Knuckles with no fight,
then provoke him and walk away with a held key and a click while he follows.

## As built

| | |
| --- | --- |
| Reproduced (before) | In a fight a 1.5 s held key moved one tile and a click moved none |
| After | A 2 s held key walked 9 tiles while Knuckles chased and hit (100 -> 92 HP); walking past him at game start starts nothing |
| Tests | 1933 -> 1932 / 350 / 0 (nine 3e tests out, five in; `tests/fight-movement.test.js` +3, mutation-checked) |
| Autoplay | stage scores identical; fingerprints `a37d7d01` -> `1d68579f` (quest), `b13490f7` -> `fd933939` (sneak) |
