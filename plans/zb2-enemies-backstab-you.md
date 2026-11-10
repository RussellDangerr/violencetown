# ZB2: enemies backstab you by the same rule

## Goal
An enemy that strikes you from the tile directly behind you (opposite the way you
face) hits for the same multiplier your own backstab uses, and the log says
[Backstab!]. Every other direction is unchanged.

## Rulings
- ZBR2 "Can enemies backstab you?": pick (a), yes, by the same rule.
- ZB1 / ZBR1: the behind-the-target test (combat.js isBackstab) and the multiplier
  (WEAKNESS_MULT).

## How
- applyDamageToPlayer asks isBackstab with the attacker's tile and your facing, and
  passes the multiplier as computeHit's positional bucket (round once).
- Only the backstab kind applies to you. No enemy crit or knockout on the player
  exists today, so none is added; a three-kind knockout cannot reach the player.

## Acceptance
- Attacker behind you: damage multiplied, [Backstab!] logged.
- Any other tile: unchanged, no log.
- npm test, balance:check, naming grep pass; autoplay:check passes or its drift is put to him.

## Out of scope
Player crits from other kinds on the player, any tuning, art, copy.
