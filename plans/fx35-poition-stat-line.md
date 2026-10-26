# FX35 — the bag says what a Poition, Alcohol or Soap does

## Goal

Select a Poition in the bag today and the inspector shows only its flavour text; what it
actually does (how much HP, for how many turns) appears only after you drink it. Give every
Poition, the Bottle of Alcohol and Soap a short mechanical stat line in the inspector, in the
same style as the lines gear and weapons already have ("16 dmg", "+2 armor"), followed by the
item's description.

## How

`itemStatLine` in `game/inspector.js` learns three more kinds of item:

- **anything carrying a `poition`** (`{ stat, amount, turns }`): the signed amount and its unit,
  per turn when it lasts more than one turn, and the turn count. A thrown item is prefixed
  "Throw", as the Rock's line already is. Speed reads as the actions it buys, since a speed
  poition gives action charges rather than a stat.
- **a poition with no `poition` field** (Sludge Brain leaves a puddle): the puddle and its turns.
- **Soap** (`effect: 'cure_sludge'`): the sludge cure, then its armour while worn.
- **Alcohol**: what it does in the car's tank.

For these items the line is followed by the description, in the one text block the panel
already draws (it wraps to two lines). Every other item reads exactly as before.

## Acceptance

- Every poition (category or field), Alcohol and Soap shows a stat line, then its description.
- A new test (`tests/inspector-poition-line.test.js`) walks every item in `ITEMS` with a
  `poition` or a cure and checks its line names the numbers it carries.
- Evidence: a 3440x1440 crop of a poition selected in the bag.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on

None. The wording is a plain mechanical line, flagged for Caelan's eye.

## Out of scope

- Any change to the bag panel's layout (`renderer.js`): the stat line and description share the
  panel's existing two-line text block rather than sitting on separate rows.
- Heal items, gear and weapons keep their current lines.
- The wording of any description.
