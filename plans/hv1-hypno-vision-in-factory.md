# HV1 - the Hypno Vision turns the Factory on you until you deal with the nerd

## Goal
A set piece and a character at the north end of the Factory. The Hypno Vision (Caelan's name) is a
screen on the wall at (16,1). While you stand within 6 tiles of it and it has a line of sight to
you, every 3rd committed action turns one of the three Factory workers or robots in its range
hostile. The nerd who runs it sits in a closed-off alcove in the south with one gap at (17,26).
Talking him into switching it off, or knocking him out, ends it: whoever it turned goes back to
neutral and no more turn. The state is a quest flag, so a reload keeps it off.

## Acceptance
- The Hypno Vision draws at (16,1) and answers Examine with a plain line.
- In range and in sight, one worker or robot turns every 3 committed actions. Out of range or out
  of sight none does, and a menu (no committed action) turns nobody. Shown by tests.
- The nerd's dialogue choice switches it off; knocking him out does too; either way the turned go
  neutral, no more turn, and a reload keeps it off.
- The Factory Manager, Puck and the Greedy Green behave as before.
- balance-golden gains the new Factory rows and +16 on the Factory faucet, nothing else, in its own
  commit. autoplay golden moves in the loops fingerprint only, in its own commit.
- Evidence at 3440x1440: it turning a worker, and the room after it is off.

## Rulings and picks
No ruling blocks it. The card's stand-ins hold: 6 tiles, 3 actions; two workers on the Rattling
Skeleton's numbers, one robot on the Greedy Green's look and numbers (so they ease in, one at a
time); the nerd on the Factory Manager's numbers with damage 0; role names, plain lines, existing
art for the screen. Caelan's PCR1 pick: plain functional copy, no jokes, no voice; "Hypno Vision"
stays.

## Design notes
- `game/hypno-vision.js` holds the rules (range, sight, the counter, the turn, the switch-off, the
  calm); main.js calls it from three seams: after each committed action, on map load, on a death.
- The off switch is the quest flag `hypnoVisionOff`, which the save already keeps.
- The counter is runtime only, reset whenever you are out of range or sight.
- Turned creatures are tagged, so they are the only ones the calm touches.

## Out of scope
Final names, art, tuning and copy; any change to the compactor room (TC1) behind the door at
(4,28); a save-file field; new sound.
