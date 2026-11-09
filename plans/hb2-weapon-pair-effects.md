# Weapon pairs combine into named effects

## Goal

Two hands now hold two weapons. A pair of held weapons can combine into a named
effect, the way two adjacent rings fuse. Holding the pair, in either hand order,
grants the effect and shows its name on the GEAR tab. Changing either hand
removes it.

## Acceptance

1. Holding a ruled pair, in either hand order, grants its effect and the name shows.
2. Changing either hand removes it.
3. A screenshot at 3440x1440 shows a pair's name.
4. npm test, balance:check, the naming grep and autoplay:check pass.

## Rests on

- Two hands replace the weapon slot (done). Shields in a hand (done).
- First pair, in his words: "Have the wok be a shield and the frying pan be the
  weapon." So a shield-class item in one hand plus a frying-pan-class weapon in
  the other. The second pair stays wand + book.
- The card says to reuse the ring-fusion matcher: `findFusion` in `game/rings.js`.

## How it is built

- `game/hand-data.js` (new, content): a tag per weapon class, and the pairs table.
  Tags live here, not in `tags.js`, because that file is outside this slice.
- Each held weapon gets tags from its class; `findFusion` matches the two in
  either order. The pair's effect is an existing wheel skill it grants.
- `main.js` resolves the pair inside `_refreshGrantedSkills`, which already runs
  whenever a hand changes, and merges the granted skill in.
- `renderer.js` draws the pair's name under the ARMOR line on the GEAR tab.

## Placeholders

- Names are `[...]` placeholders. The granted skills reuse existing ones
  (a trick and a spell), so no new numbers. Both are listed for his eye.
- There is no wok item in the game; "wok" is a shield-class item.

## Out of scope

New items, new skill numbers, art, copy, more pairs, any ring change.
