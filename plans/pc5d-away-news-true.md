# pc5d: the away news only says what is true

Goal: no away-news line claims the save is unchanged or that nothing changed, because coming back
rested adds a buff that is saved. Lines say only that items, gold and health are as left, or that
time passed. The hidden-tab case reads "You were away from the game for a while."

Acceptance
- NEWS_LINES in game/away.js: none says "nothing in your save changed" or "save is unchanged".
- tests/away-news.test.js pins every news line exactly and the zone-change line by exact value.
- tests/credits.test.js pins every credits body line exactly (own commit, first).
- tests/pc5d-away-news-true.test.js: a return that grants the rested buff never shows a line claiming
  the save is unchanged.
- npm test, balance:check, naming grep, autoplay:check pass.

Rests on ruling PCR1 (a): plain, deadpan, true lines; the creative wording stays Caelan's.
Out of scope: rested buff itself, RESTED_LINE, any other copy.
