# AM1 — the affordance matrix

## Goal

The systems audit (`plans/systems-audit-2026-08.md` §9) asks for one table: every verb the player
has, down one side, every tag (`game/tags.js`) across the top, and every cell filled in. A blank
cell is a decision nobody made; "nothing happens" has to be written down. The table also shows at
a glance when a verb or a tag has no edges at all — something added that touches nothing else.

This slice writes that table as data, `game/affordances.js`, with a test that keeps it honest. It
reads the wheel and the tag list; it edits neither. Nothing in play changes.

## What gets built

- `game/affordances.js`
  - `EFFECTS`: the effect ids a cell may name. Each one says what it does in a line, whether it
    is **live** (code does it today) or **planned** (written down in a plan, not built), and where
    it lives: a `game/*.js` file and the function that does it, or a `plans/*.md` file and the
    words that ask for it.
  - `MATRIX`: one row per verb, one cell per tag, every cell written out. A cell is `'none'` or an
    id from `EFFECTS`.
  - `EMPTY`: the verbs and tags known to have no edges today. It may only shrink.
  - `matrixProblems(...)`: a pure checker that lists everything wrong with a matrix, so the test
    can run it on the real table and on broken copies.
- `tests/affordance-matrix.test.js`

**The verbs** are found, not typed: every leaf of the wheel (`wheel-model.js` `ROOT`, 21 today)
plus every verb `targetVerbs` can offer (examine, talk, trade, hit, shove, throw, take, open).
Cancel is a menu row, not a verb, and is left out. A key that is in both lists (hit, trade, throw)
is one row. The test walks `ROOT` and reads the `targetVerbs` source, so a verb added later
without a row fails.

**The tags** are `TAGS` from `game/tags.js` (ten today).

**What counts as an edge:** a cell that is not `'none'`, live or planned. A planned cell must
point at a plan that asks for it, in words the test can find; the loop does not invent them.

## What the table holds today

Nothing reads a tag for an effect yet except ring fusions, which pair two ring tags and are not a
verb acting on a thing. The cells that are not `'none'`:

- **live** — `sewer` (an enemy's `sewerDweller` flag reads as the `sewer` tag):
  - Throw and Ranged: sewer fare thrown at a sewer dweller mends it instead of hurting it
    (`items.js` `resolveThrow`).
  - Trade: sewer fare handed to a sewer dweller is a kindness, not an insult
    (`give-action.js` `applySewerFareGive`).
- **planned** — `flammable`, from the audit's own example ("one flammable door opens to the
  fireball, the Fire Ring, the Ember Rat, a thrown lantern"): Fireball, Ember Rat, Throw and
  Ranged.

Every other cell is `'none'`. The verbs and tags left with no edges go on `EMPTY`.

## Acceptance

1. Every verb × tag cell is `'none'` or a known effect id; a blank or unknown cell fails.
2. A verb or tag with no edges fails unless it is on `EMPTY`. `EMPTY` can only shrink: the test
   pins its current size as a maximum, and an entry that has gained an edge must come off.
3. The matrix columns are exactly `TAGS`, and every tag used in content (items, weapons, weapon
   tiers, rings, fusions, tiles, slot entries, map spawns, read through `tagsOf`) is a column.
4. Each effect's citation is real: the file exists and holds the named function or words.
5. No gameplay change: autoplay and balance goldens do not move.
6. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on

None beyond the card. The loop's own calls: verbs are the wheel leaves plus the `targetVerbs`
keys; tags are `TAGS`; a planned cell counts as an edge but must cite a plan.

## Out of scope

- Any live tag effect. Making a cell do something is its own idea.
- Putting tags on content.
- Weakness kinds (`weak` / `resist` / `immune` on enemies). They key on damage types, not tags.
- Effects that are not a player verb: the sludge puddle mending sewer dwellers, an enemy eating
  sewer fare from its own kit, ring fusions.
- Anything on screen.
