# FX75: a pasted save code counts as coming back

Goal: pasting a save code (title screen, and Options) is a return like Continue. After a good
paste the game reads how long the pasted save was away (`_noteAway`) and gives the rested
top-up (`_applyRested`), before `writeSave` stamps a new `savedAt`.

Checks:
- both paste handlers call `_noteAway?.(raw)` then `_applyRested?.()` after the import succeeds
  and before `writeSave`; raw is the decoded pasted save, which still has its own `savedAt`.
- a code saved 5 hours ago gives the same hoursAway and rested buff as Continuing that save.
- a refused or unreadable paste returns before those calls and changes nothing.
- no new text: the away news and rest line are the ones Continue already shows.

Rests on: PCR3 (plain text); adds none.
Out of scope: any change to Continue, save.js, or the wording of the news.
