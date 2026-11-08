# fx60: a long-press on an enemy opens the options without hitting first

## Goal

On a touch screen, pressing and holding on a hostile is meant to open the full options list
(the Target List). Today the press fires the default Hit the instant the finger lands, and the
list opens about 450 ms later, so "long-press for options" costs a turn (a foe at 100 HP is at 90
by the time the list shows).

The fix: on touch, a press on a hostile does not hit on the way down. The Hit waits for the
finger to lift. If the finger is still down at 450 ms the list opens and the Hit never happens.
A quick tap still hits, just at the release instead of the landing.

## Acceptance checks

1. A touch long-press on a hostile opens the options list and spends no turn (foe HP unchanged).
   A quick touch tap on a hostile still hits.
2. Mouse is unchanged: a left click still hits on press, and right-click still opens the list.
3. A test drives a long-press and a tap through the game's own pointer listeners (pointerdown,
   pointerup, with the 450 ms timer advanced) with `pointerType` 'touch' and 'mouse'.
4. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass. The autoplay uses
   no touch events, so its score does not move.

## Design

- Only `pointerType === 'touch'` on a verb whose key is `hit` is deferred. Every other verb
  (take, talk, trade, examine, open, shove) and every mouse or pen press behaves as before.
- `_armLongPress` takes an optional deferred action. Releasing before the timer fires runs it;
  a drag past the existing 10 px, a cancel or a leave drops it; the timer firing drops it and
  opens the list instead. The 450 ms threshold is untouched.
- To let a test reach the game class without a browser, `main.js` exports `Game` and only boots
  when a `document` exists. Nothing changes in the browser.

## Rulings

None. No player-visible copy, numbers or art.

## Out of scope

- Key handling, including the double-tap Space path (another slice).
- Deferring any verb other than Hit, and pen input.
- The 450 ms threshold.
