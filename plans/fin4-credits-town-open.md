# FIN4 — The credits roll, then the town stays open

**Parent:** `plans/spine.md` (SP2, the ending), `plans/fin3-bite-phase-two.md` (the hook this reads).

## Goal

Beating Monstrous Sun Man ends the Final Arc. A short beat after he falls, the credits roll over
a black screen. When they end (or are skipped) you are standing where you were, in the world,
with your quests, bag, gear and the rest exactly as they were. The save remembers that the
ending was seen, and a save that has seen it never rolls the credits again.

Spine ruling (2026-11-03): after the credits the world opens up and the remaining episodes can
still be played. The credits end the arc, not the game.

## The shape

- **`game/credits.js`** (new, plain functions in the sewer set-piece pattern): the placeholder
  card list, the beat and card timings, `endingDue(game)`, and the small roll state
  (`newRoll`, `currentCard`, `stepRoll`).
- **The trigger** is FIN3's hook, read as it stands: the saved quest flag
  `finalePhase2 === 'won'` (set together with the one-shot event `finale_phase2_won`).
  The credits are *due* while that flag is won and the ending has not been seen. Deriving "due"
  from the flag means a save made between the win and the credits still rolls them once.
- **The memory** is a second saved quest flag, `endingSeen`, set when the roll ends. It rides in
  the quest state through the real save path (serialize, JSON, load), so loading never replays
  the credits and a New Game starts without it.
- **`main.js`**: a `CREDITS` game state. `_render` asks `_creditsCheck()`, which starts a short
  timer once the credits are due and the game is idle (no fight, no animation, not paused); when
  the timer fires and it still holds, `_startCredits()` takes the screen. Keys: Enter, Space, E
  or an arrow steps to the next card; Escape skips the lot; a tap steps. The cards also step on
  their own timer. After the last card, `_endCredits()` sets `endingSeen`, saves, and returns to
  `IDLE`.
- **`renderer.js`**: `_drawCredits` fills the screen black and draws the current card's lines
  centred, in the menu box.

## Placeholders (all for Caelan)

Every credits line and the key hint are `[TEXT]`. The number of cards, lines per card, the beat
before the credits (ms) and the time each card holds (ms) are stand-ins, tuned by nothing.

## Acceptance

1. Winning the Final Arc rolls the credits.
2. After the credits you are back in the world, quests and everything else intact.
3. The save remembers the ending was seen; loading such a save does not replay the credits.
4. Screenshot at 3440x1440 of the credits and the world after.
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Tests

`tests/credits.test.js`: the real `beastFell` (the FIN3 win) makes the credits due and fires the
event; the lifted `_creditsCheck` / `_startCredits` / `_endCredits` and the real `_bindInput`
listener take real keys (step, skip); the world is unchanged after; the flag survives the real
`serialize` / `writeSave` / `readSaveRaw` / `loadInto` and a loaded save does not roll again.

## Out of scope

New Game+, "start season two" or anything that resets the world; real credits text, names, art
or music; the Sunpyre and later episodes; any change to FIN3's fight.

## Rulings it rests on

- **FIN3 (merged):** the flag and event above.
- **Spine, 2026-11-03:** credits, then the world stays open; New Game+ is a later feature.
