# PC0: the loop writes plain placeholder lines

## Goal
Change the process rule so the loop and its builders write plain, flat placeholder lines in
place of `[TEXT]`. A player never sees `[TEXT]`. Creative writing stays Caelan's.

## The rule
Plain means: what the thing is, what it does, and what the player should do about it, in flat
sentences. No jokes, no character voice, no story prose. A character with no name goes by its
role ("Taxi driver"). Lines that are already creative writing stay as they are.

## Ruling it rests on
PCR1, picked (a) by Caelan on 2026-11-17: the loop writes plain, deadpan lines that explain what
each thing is, does and what to do with it; `[TEXT]` never reaches a player; creative writing
stays his.

## Acceptance
- `tools/roadmap-board/LOOP.md` section 6 states the rule above.
- Section 6 still names creative copy (character voice, jokes, story prose, invented proper
  names) as his, never added by the loop.
- Section 6's placeholder line no longer offers `[TEXT]`; a tinted square or an unchanged number
  stays the placeholder for art and tuning.
- `.claude/agents/slice-builder.md` says the same in one sentence pointing at section 6.
- `npm test` passes.

## Out of scope
Any actual copy (PC1 to PC5). Nothing is on screen; this is a process rule only.
