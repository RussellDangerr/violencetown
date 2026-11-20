# PC2c: every character's dialogue says plainly who they are and what each choice does

## Goal
The voiced characters in `game/dialogue.js` (Pike, Platero, Bartho, Macc, Mince, Glunk, Praline,
Knuckles, the Borgir cook, the Financier, the Pit Boss, the Stranded Traveler, the Corner Merchant,
the Newsstand Kid) get plain lines. Each greeting says the role and what they offer or want. Each
choice label and reply says what the choice does. No voice, jokes or atmosphere. Names stay.

## Acceptance
1. Greetings, labels and replies of those characters are plain and true to the code.
2. No square brackets on player text: choice labels ('[Flatter him]' becomes 'Compliment him') and
   the bracketed speaker names (Factory Manager, Nerd, Assistant Manager, Strongman).
3. Two untrue lines are fixed: the Factory manager's "if your bag has room" (the bag never
   refuses) and the Crat's "The road to Carrion is open now" (it opens on the next Sewer load).
4. Dialogue ids and choice ids do not change.
5. Tests that pin changed lines are re-pinned exactly, in their own commit.
6. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.
7. Evidence: 3440x1440 frames of Glunk, Praline and Macc.

## Rests on
PCR3 (picked 11-17): copy is plain facts; names, his quoted lines and `plans/` design facts stay.

## Out of scope
Any id, number, mechanic or map change. Item and quest text. Characters not listed.

## Status
Stopped before building: tests outside `touches` pin lines this slice changes (listed in the
report). The loop widens `touches` to cover them.
