# gp2: the Lion Whip and the Fearmur hit as the weapon ruling says

## Goal
Today only the Ray Gun (22) beats the Sewer's best weapon, the Gator Tail (16). The Carnival's
Lion Whip hits for 12 and the Graveyard's Fearmur for 14. Ruling GP2R1, option (a): both hit for
16, level with the Gator Tail, and keep what makes them different: the whip its reach of 3 and
its pull, the Fearmur its fear on a repeat hit.

## What changes
- `game/weapons.js`: Lion Whip damage 12 to 16; Fearmur damage 14 to 16.
- The whip class's tier table copies the Lion Whip (`WEAPON_CLASS_DAMAGE.whip`), so it moves
  from 12 to 16 as well. Nothing in the world uses that table. The hammer class keeps copying the
  pipe (12); the Fearmur is a hammer-class weapon with its own number.
- The tests that pin the old numbers change in one commit that says the behaviour changed and
  cites GP2R1: `tests/tier-weapon-damage.test.js`, `tests/weapon-compare.test.js`,
  `tests/weapon-tiers.test.js`.
- A new test pins that both weapons hit for 16 and keep reach, pull and fear.

## Acceptance
- The Whip and the Fearmur hit for 16 in a real fight; the bag's compare shows the new
  difference (for example against the Gator Tail).
- The Whip keeps reach 3 and pull 1; the Fearmur keeps its fear on a repeat hit and the Boo! spell.
- The Sludge Bloom still reads as impossible to every physical weapon; a fireball still opens it
  (`tests/puzzle-wall.test.js` keeps passing).
- The balance golden moves (that is the point) and is recorded by the loop citing GP2R1. The
  autoplay golden does not move.
- Evidence: a 3440x1440 frame of the bag's compare on each weapon.
- npm test, the naming grep and autoplay:check pass; balance:check differs only until the golden
  is rewritten.

## Rests on
- GP2R1, picked (a): both hit for 16.

## Out of scope
- Option (b), the Sludge Bloom's armour (`game/sewer-map.json`): not picked, not touched.
- Any other weapon's number, prices, descriptions, art.
- Writing the balance golden.
