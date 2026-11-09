# DQ1: story greetings

Goal: a dialogue may list greetings that each carry a condition, read before its fixed greeting.
The diner cook after the burger pickup, and Bartho once the car has opened the north bridge,
open with a new line. Before that, and for every dialogue with no list, nothing changes.

Shape: `greetings: [{ when(game), text }]` on a dialogue; `greetingFor(d, game)` returns the first
that holds, else `greeting`. `_openDialogue` uses it.

Acceptance:
- Cook after pickup and Bartho with the bridge open show their after lines; before, today's.
- A dialogue with no `greetings` behaves as today.
- A test talks to each with real keys before and after.
- 3440x1440 frames of the two after greetings.
- npm test, balance:check, naming grep, autoplay:check pass.

Rulings: none. Every new line is a [TEXT] placeholder.
Out of scope: the traveler (TT1 removes him from Downtown), any real copy.
