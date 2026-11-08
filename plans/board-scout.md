# The board scout: proposals that don't start in Caelan's head

Caelan, 2026-10-25: the loop builds what he thinks of, but nothing feeds it fixes and tweaks he
hasn't thought of. The game can play itself and the loop collects data every pass, so some part
of the loop should look at the game and the code and propose cards.

## What it is

A read-only agent, `board-scout` (`.claude/agents/board-scout.md`), that the loop runs alongside
its builders. It never edits the repo, never pushes and never writes to the board. It hands the
loop up to 10 proposals, and the loop turns each one into an **idea card** in the Ideas lane,
marked `source: "scout"`. He triages them like his own ideas: Tweak it, or park it in Someday.

## Where it looks

1. **What the builders already noticed.** Every build report ends with "Needs your eye" and "Not
   done". Nobody harvests them. The scout reads the summaries and notes of cards in review and
   done, and proposes a card for anything left hanging, most of all an issue that shows up in
   more than one report (two slices have now reported "undefined DMG").
2. **The game, played.** It runs the quest-1 autoplay for the fighter and the sneak, captures
   frames along the way, and reads them for defects a player would see: `undefined` or `NaN` on
   screen, text running out of its panel, overlapping UI, a stage that costs far more turns or
   deaths than the others.
3. **What changed.** It reviews the code merged to `dev` since its last run for bugs, dead code
   and loose ends.
4. **Cheap sweeps.** Balance-harness lint flags, warnings in the test run, and odd strings the
   renderer can draw.

## What a proposal must carry

- `key`: a short stable id for the problem (`defect:tier-two-hander-undefined-dmg`). The loop
  never writes a second card with a key any card already has, in any lane, so a parked
  proposal stays parked.
- `kind`: `defect`, `tweak` or `idea`.
- `title`: the problem in plain player words.
- `note`: what, where (`file:line`), the evidence (a frame path, command output, the cards that
  reported it), and a suggested fix in one or two sentences.
- No new names, copy, lore or tuning numbers presented as decided: those stay his. A proposal may
  say a number looks off and why.

## When it runs

The loop starts a scout in a pass when the last scout ran more than 2 hours ago and either `dev`
has moved since then or the pass has nothing to build. Its state (`lastSha`, `lastAt`) lives in
the board database under collection `meta`, document `scout`, not on a card. At most one scout
runs at a time.

## Limits

10 proposals per run, matching the loop's other limits (`plans/loop-limits-ten.md`). Every
proposal needs evidence; a hunch with none is dropped.

## Acceptance

- `newScoutIdea(proposal, now, cards)` in `board-model.js` builds the idea card, and returns null
  for a key any card already carries or a proposal missing its key or title. Node-tested.
- The board page labels a scout card "idea · scout".
- LOOP.md and the board-loop skill say when the scout runs and how its proposals land.
- `npm test` passes.
