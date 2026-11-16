# SM1: the Strongman mask is a big mustache

## Goal
While the power-wield mask (HB1) is worn, Night Kid is drawn as a figure with a big mustache
instead of the stand-in knight helmet. Taking the mask off brings Night Kid back.

## Acceptance
- Wearing the mask draws a mustached body; taking it off removes it.
- The body faces the way Night Kid faces (the existing worn-body draw already flips it).
- A screenshot at 3440x1440 of Night Kid with and without the mask (scratchpad, not committed).
- npm test, balance:check, naming grep, autoplay:check pass.

## Rulings it rests on
- SMR1 (b): swap the body for a Kenney Tiny character that already has a big mustache.
  CC0 sheets already in the repo only. The cell is the builder's pick, flagged for review.
- HB1: the mask exists with a stand-in body (species 'strongman', sprite 'Boss'). This replaces
  the stand-in. The existing body path is reused (no new ENEMY_SPRITES key: the coverage test
  rejects orphans).

## Build
- items.js: the mask's body sprite points at the bald, mustached and bearded cell of
  tinyDungeon (col 2, row 7, the cell the 'Pike' entry names).
- A new test pins the body, the cell, and that the body exists only while worn.
- renderer.js and sprites.js need no change: the worn-body path flips with facing already.

## Out of scope
Names, copy, a bespoke sprite, any change to what the mask does.
