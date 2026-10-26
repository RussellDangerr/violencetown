# EL1: the weakness chart as data, with its sources

## Goal

Today a weakness is whatever an enemy's `weak` / `resist` / `immune` arrays say
(`game/combat.js` `elementalMult`). Nothing says *why* a type beats another, so each new enemy
is a fresh guess. This slice writes the chart down once, as data, in `game/elements.js`: every
damage type the game deals, the element it belongs to, where that comes from, and the
weakness and resistance edges between elements, each with its source. Where the game bends
the source, the row says so.

Nothing reads the chart yet. No enemy, number or screen changes in this slice.

## The ruling it rests on

**Which traditional chart?** Caelan picked **Wu Xing (the five phases), read through the five
climates** of the *Huangdi Neijing Suwen*: heat is fire, cold is water, damp is earth, wind is
wood, dryness is metal. An attack whose element overcomes the target's element is a weakness;
the reverse is a resistance. Elements that don't meet on the overcoming cycle are neutral.

How the game's types land on it:

| damage type | element | how | departs from the source? |
|---|---|---|---|
| fire | fire | heat is fire's climate | no |
| cold | water | cold is water's climate | no |
| sludge | earth | damp is earth's climate | no |
| energy | wood | thunder: the trigram Zhen is thunder and the east; the east is wood | **yes**: thunder is not one of the five climates (wood's is wind) |
| physical | metal | blades are metal | **yes**: metal's climate is dryness, and fists, staffs and books are not metal |
| slash, stab, crush | metal | kinds of a physical hit, so they follow physical | **yes**, as physical; crush most of all |
| clean (soap) | wood | placed on wood so that "wood unblocks earth" carries soap over sludge | **yes**: soap is not in the source |
| fear | water | the same chapter gives water the emotion fear | **yes**, mildly: it is an emotion, not a climate |
| poison | none | the source has no place for it | **yes**: left neutral until placed |

The five overcoming edges all come from one line of *Suwen* chapter 25: wood is felled by
metal, fire is put out by water, earth is opened by wood, metal is notched by fire, water is
cut off by earth.

## His crit ruling (2026-10-06), recorded here

Not written in the repo until now, so it is recorded here for the slices that build it. This
slice builds none of it.

- A crit comes from **stacked weaknesses**, not from luck.
- Each weakness *kind* a hit meets is **x1.5**, and the kinds **multiply**.
- **Three kinds at once is a knockout** on anything that is not a boss.
- A **crit marker** is shown when it happens.
- **Enemies crit you too**, by the same rule.

## Acceptance

- `game/elements.js` has a row for every damage type the game deals, `clean` included. A test
  collects the types from the item, weapon, spell and trick data, the weapon hit kinds, every
  typed `combatAttack` call, every damage-over-time cause, and every enemy's
  `weak` / `resist` / `immune` list in the maps, and fails on any type with no row.
- Every edge and every placed row names its source; every row that bends the source carries a
  departure note. A test fails on a missing citation or a bend with no note.
- The edges form the overcoming cycle: each element overcomes exactly one other and is overcome
  by exactly one.
- Nothing in play changes: no game file imports the chart, and the autoplay golden does not
  move.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Out of scope

- Wiring the chart into `elementalMult` or into any enemy's lists.
- The x1.5 value (today a weakness is x2), the knockout, the crit marker, and which states
  count as a weakness kind. Each is its own slice.
- Changing what the Sludge Bloom is weak to. Today it is weak to fire, which the chart does not
  give it; that moves when the chart is applied.
- Anything a player sees.
