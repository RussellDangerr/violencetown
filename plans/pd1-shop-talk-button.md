# PD1: the shop screen has a Talk button

## Goal
Pike's "clear the critters for the rope" deal lives in his talk, but E opens his shop, so a
player never finds it. The offer screen gets a Talk button for every vendor who has a dialogue.
It closes the shop (the basket is discarded, like Esc) and opens that vendor's talk.

## Acceptance
- In Pike's shop the Talk button opens his talk, where the deal is.
- A vendor with no dialogue (Carrion) shows no button and the key does nothing.
- Reachable by key (T, free on the offer screen) and by tap.
- The button's label is the placeholder `[TEXT]`; the layout comes from `offerLayout`
  (`talkButton`), shared by the draw and the hit-test.
- tests/shop-talk.test.js opens Pike's shop with a real E keypress and lands in his talk with a
  real T keypress; tap-targets pins the new rect.
- npm test, balance:check, naming grep and autoplay:check pass.

## Rests on
PDR1 (a): "The shop screen gets a Talk button, for every vendor who has something to say."

## Out of scope
The label's real copy, any change to dialogue content, keys for other screens.
