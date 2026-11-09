# The board scouts: proposals that don't start in Caelan's head

Caelan, 2026-10-25: the loop builds what he thinks of, but nothing feeds it fixes and tweaks he
hasn't thought of. So the loop runs a read-only scout that looks at the game and the code and
proposes cards.

2026-10-29: one scout became two, matching the Grawlix loop, so the two loops keep one shape. One
scout doing everything found plenty of defects but rarely noticed a system that was never
finished: a gear tab with no weapon chooser reads as "works as coded". Those are two different
ways of looking, so each gets its own agent.

## The two scouts

- **The defect scout** (`.claude/agents/scout-defects.md`) finds things that behave against their
  own intent: a bug, a regression, a label drawn over another, a test that can't fail. It reviews
  what merged since its last run, harvests the "Needs your eye" and "Not done" items in the build
  reports, plays the game headless, and sweeps one code area per run. Every proposal carries an
  expected, an actual with a measured number, and a repro.
- **The thread scout** (`.claude/agents/scout-threads.md`) takes one system per run and traces its
  whole thread: how a player notices it, reads it, operates it, whether it works end to end, what
  it feeds, and how it ends. It proposes the smallest piece of work that closes a missing link.
  It never proposes a new system.

Each hands the other what it isn't for: a defect scout that sees an unwired system writes it under
`FOR THE THREAD SCOUT`, and the loop stores it as the thread scout's `leads`; the reverse goes
under `FOR THE DEFECT SCOUT`. Defects in the loop's own tooling go under `TOOLING` and are named
in the update, never filed, because no slice may touch `tools/roadmap-board/`.

Both are read-only (no edits, commits, pushes or board writes) and both run on Sonnet. The rules
for when they run, their rotations and how their cards land are in `tools/roadmap-board/LOOP.md`
§10.

## What a proposal must carry

- `key`: a short stable id, `defect:<id>` or `thread:<id>`. The loop never writes a second card
  with a key any card already has, in any lane, so a parked proposal stays parked.
- `kind`: `defect` from the defect scout; `tweak` (no ruling needed) or `idea` from the thread
  scout.
- `title`: the problem or gap in plain player words.
- The rest of the proposal goes in the card's note, opening "From the defect scout:" or "From the
  thread scout:", so each scout's hit rate is one board query.
- No new names, copy, lore or tuning numbers presented as decided: those stay his. A proposal
  names the question; it may say a number looks off and why.

## Limits

3 proposals per scout per run. Both scouts hold back while his turn holds 10 or more items, or
while 5 or more scout cards sit untriaged in Ideas: finding work is not the bottleneck, his
attention is. The defect scout reviews only the diff after a merge and plays the game at most
hourly; neither scout reruns the gates. Every proposal needs evidence; a hunch with none is
dropped.

## Acceptance

- `newScoutIdea(proposal, now, cards)` in `board-model.js` builds the idea card, and returns null
  for a key any card already carries or a proposal missing its key or title. Node-tested
  (`tests/board-scout.test.js`); unchanged by the split.
- The board page labels a scout card "idea · scout".
- LOOP.md §10 and the board-loop skill say when each scout runs and how its proposals land.
- `npm test` passes.
