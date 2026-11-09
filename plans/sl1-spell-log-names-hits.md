# sl1 — the spell and trick log names who was caught and what they took

## Goal
A spell or trick that hits several things used to log one count and the spell's nominal
damage ("... to 2"). It now logs each target by its shown name with the damage that target
really took after armour and weakness.

## Shape (ruling SLR1, pick a)
`[Fireball! Knuckles 18, Rat 24]` — the spell or trick name, `!`, then each target's
shown name and damage, comma-separated. A trick keeps its GP note after the list
(`. (-Ng)`). Boss one-name rule applies (shown name for a boss, otherwise name or type).
A fizzle line, and the Cleave and Spin lines ("N caught"), are unchanged.

## Acceptance
1. Casting on two enemies logs both with the damage each really took.
2. One enemy caught: the line names it.
3. Cleave and Spin lines unchanged.
4. A test casts through the wheel with real keys (tests/spell-log.test.js).
5. Evidence: a 3440x1440 frame of the log after a two-enemy Fireball.
6. npm test, balance:check, naming grep and autoplay:check pass.

## How
`_aoeStrike` returns the list of who it struck (`{ name, dealt }`) instead of a count;
Cleave and Spin use its length; the spell and trick lines format the list.

## Out of scope
No new copy beyond the agreed shape; wrapping of long dock lines (FX41) is untouched.
