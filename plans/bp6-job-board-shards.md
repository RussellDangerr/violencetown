# BP6: a job board in Town pays shards, and four make a boon

## Goal
A Job board stands in Town. It offers one job at a time: bring back an item that the enemies of
one zone carry. Handing the item in pays one Shard. Four Shards make one boon poition, which
drinks like any other boon.

## Acceptance checks
- The board offers one job at a time, drawn from a stream of its own (a hash of the game's slot
  picks and the number of jobs done). It draws nothing from game.rng, so slot picks and the
  autoplay are unchanged.
- Finishing a job pays one Shard; four Shards are traded for one boon poition.
- Jobs done and Shards held are saved, and left out of the save while both are zero.
- A boon from Shards is an ordinary boon poition, so it counts toward the 12-boon cap when drunk.
  At the cap the board pays no more.
- Frames at 3440x1440 of the board and of a paid job.
- npm test, balance:check, naming grep, limezu grep, autoplay:check pass.

## Rests on
- BPR5 b: the first job kind is "bring back an item that zone's enemies carry". Each job in the
  pool names an item that sits in that enemy's kit, so it drops on death. A test checks every job
  against item-sources and the zone's map spawns.
- BPR4 a: at most 12 boons per game.
- BPR3 b / BP1-BP5: the boon and its drinking path already exist and are reused.
- PCR3 a: every line is plain and true to the code; no square brackets. The names "Job board"
  and "Shard" are role names for Caelan to replace.

## Out of scope
- A Shard item, a Shard readout in the HUD or Quests tab, other job kinds, job rewards other
  than Shards, art for the board.
