# The facing chevron follows the ruling

## Goal

The threat overlay draws a small chevron by each watcher, pointing the way it
looks. Since the town's people got four-way art (DS1), most of them now show
their facing in the sprite itself, so the chevron there says the same thing
twice. Caelan ruled: keep the chevron only where the art can't show facing.

So the chevron is dropped for a watcher when both are true:

- its sprite has four-way frames (`dirCols` in `game/sprites.js`), and
- it faces one of the four straight directions, and the frame the art picks
  (`dirOf`) is that same direction.

It stays for everyone else:

- creatures and any Tiny Dungeon character (one drawn facing only);
- any watcher facing a diagonal, which four frames can't show.

The rule is the same in and out of a fight.

## Acceptance checks

- A pure helper in `game/renderer.js` answers "does this watcher get a
  chevron?", and the overlay draws the chevron only when it says yes.
- `tests/chevron-rule.test.js` pins the rule: the Violencian crowd and the
  named NPCs facing straight lose it; the same people facing a diagonal keep
  it; creatures keep it whichever way they face; a never-moved watcher (faces
  down) follows the same rule.
- The existing chevron tests are updated in their own commit, saying the
  behaviour changed; no test is removed or skipped.
- Screenshots at 3440x1440: a townsperson facing straight with no chevron,
  and a diagonal or creature watcher with one.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on

- DR2, "What happens to the facing chevron once watchers face where they
  walk?" Picked: keep it only where the art can't show facing.
- DS1 (merged): the six named town NPCs and the crowd have four-way frames.

## Out of scope

- No new Options setting (that option was not picked), so `settings.js` is
  untouched.
- The chevron's look, size and colour are unchanged.
- The awareness marker and the "sees you" thread are unchanged.
- No new art for diagonals.
