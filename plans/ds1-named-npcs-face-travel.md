# Named town NPCs face where they are going

Follows `plans/animation-pass.md` §4, which gave the town crowd (Violencian) four-way walking
frames from the RPG Urban sheet. Everyone else in town still drew one front-facing Tiny Dungeon
cell that could only mirror left and right.

## Goal

The six named town NPCs (Vendor, Stranger, Bootlegger, Banker, Operator, Cook) draw one of the
RPG Urban people, with a facing column for up, down, left and right and the three-row walk cycle,
exactly the way Violencian already does. It is pure data in `ENEMY_SPRITES` (`dirCols`,
`walkRows`); the renderer already resolves any entry that carries those fields.

## Rulings it rests on

- **Where the frames come from:** no free four-facing pack exists in the Kenney library, so he
  picked "lend townsfolk looks to named NPCs", at the cost of the crowd drawing from fewer looks.
- Rats and fungi are out of scope; only the named town NPCs move over.

## The look split (a look choice, flagged for review)

The urban sheet holds six people. Which named NPC gets which is unruled, so this pass picks one
and flags it:

- Each named NPC gets its own look, so no two named NPCs look alike.
- Vendor, Stranger and Bootlegger stand among the crowd (downtown and town), so the crowd gives
  up their three looks.
- Banker, Cook and Operator each have an interior to themselves, so the crowd keeps their three
  looks.

The crowd goes from six looks to three. The cheaper alternative (the crowd keeps four, and the
Bootlegger doubles the Stranger's or Vendor's look on a different map) is a one-line change.

## Acceptance

- The six named town NPCs carry `dirCols` and `walkRows`, and `spriteFrame` faces them up, down,
  left and right.
- No two types that share a map draw the same base cell (`tests/sprite-coverage.test.js`).
- A screenshot at 3440x1440 shows one of them facing each of the four ways.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Out of scope

- Rats, fungi and every other Tiny Dungeon character.
- Any renderer, map or behaviour change: NPCs that never move keep facing the way they spawn.
- New art or a new sheet.
