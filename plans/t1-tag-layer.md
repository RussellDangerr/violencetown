# T1 — one tag vocabulary

## Goal

Today only rings carry tags (`vermin`, `sewer`, `fire`), and ring fusions key on them. This slice
makes tags a shared layer: one list of known tags, one `tagsOf()` helper that reads them off any
item, weapon, ring, enemy, tile or map spawn, and a content check that fails on a tag that is not
in the list. Nothing reads tags for an effect yet, so nothing in play changes.

## What gets built

- `game/tags.js` — the vocabulary and the helpers.
  - The list starts from the systems audit's eight (`flammable`, `metal`, `porous`, `wet`,
    `rigid`, `vermin`, `undead`, `conducts`) plus the ring tags (`sewer`, `fire`).
  - `tagsOf(thing)` returns the thing's tags: its own `tags` array, plus the two flags that
    already behave like tags. `vermin: true` reads as `vermin`; `sewerDweller: true` reads as
    `sewer`. The flags stay where they are (read, not migrated).
  - `isTag`, `unknownTags` and `tileTags(id)` for the checker and later callers.
- Enemies take an optional `tags` array. It is copied on construction and survives a save and
  load through the enemy's own `toSave` / `fromSave`. An enemy with no tags saves exactly as
  before (the field is left out).
- `content-validate.js` gains a tag pass over items, weapons, weapon tiers, rings, ring fusions,
  tiles, the slot registry's entries and every map spawn list (`enemies`, `items`, `examinables`,
  `props`, `containers`). An unknown tag, or a `tags` that is not an array of strings, is a
  problem.
- Short notes in `items.js`, `weapons.js`, `data.js` and `ring-data.js` saying a def may carry
  `tags` and where the list lives.

## Acceptance

1. Every tag used anywhere in content is in the vocabulary; the content check fails on an
   unknown tag (tested on synthetic content for each kind of carrier).
2. The ring tags are in the vocabulary and the existing fusion still resolves.
3. Enemy tags survive `toSave` → JSON → `fromSave`.
4. Nothing in play changes: autoplay and balance goldens do not move.
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on

None beyond the card. The loop's own calls, recorded here: the `vermin` and `sewerDweller` flags
are read as tags rather than migrated, and the tag list is internal (never shown to a player).

## Out of scope

- Anything that reads a tag to change play (fire spreading on `flammable`, shocks on
  `conducts`, and so on).
- Putting tags on today's content. Which items or tiles are `metal` or `flammable` waits for the
  first effect that reads them.
- Changing the enemy's single free-form `tag` field (quest hooks). It is a different thing and is
  left alone.
- The save file format outside `enemies.js`.
