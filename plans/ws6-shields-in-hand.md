# Shields in a hand

## Goal

A shield is held in a hand, like any one-handed weapon (two hands landed in
the two-hands slice). Holding one should do two things at once: it cuts the
next hit you take, and it adds armour while held, on top of being a weapon
that bashes. Holding a shield in each hand stacks both effects, so two
shields make a slow, hard-to-hurt build.

## Acceptance

1. A held shield does both things:
   - while it is held, its armour adds to what you soak from every hit;
   - it cuts the next hit you take, then needs time before it can cut again.
2. Two shields work: each hand's shield adds its own armour, and each cuts a
   hit of its own, so two shields cut two hits where one shield cuts one.
3. A shield still bashes: its hit kind is crush, from the weapon class table.
4. Nothing changes for anyone not holding a shield. Every gate in LOOP.md §2
   passes, and the quest-1 autoplay does not move (no shield is in quest 1).

## What it rests on

- **What a shield does in a hand: picked "Both".** It blocks (cuts the next
  hit) and it bashes and adds armour; two shields is a turtle build.
- **Which weapon classes are in: picked "both lists are classes".** The
  shield is one of them, one-handed, landing crush. That class already exists.
- **Two hands (merged):** the right hand is `equipment.weapon`, the left is
  `equipment.left`; a two-hander is the same def in both. Two of the same
  shield are also the same def in both keys, so a hand is counted by how many
  hands its item takes, not by whether the two defs differ.

## How it is built

- `game/items.js` lists what each hand holds, with a two-hander once.
- `game/combat.js` holds the shield rule as pure functions: which hands hold a
  shield, the armour they add, and the block. The block folds into the hit's
  one damage calculation as a multiplier (the round-once law), the same way
  the Defend action's guard does, rather than computing a second hit.
- Each shield's block is tracked per hand by the turn it is ready again.

## Placeholders (numbers no ruling gives)

- A shield's armour, the cut a block makes, and how long a block takes to come
  back are placeholders. The armour is 1, the smallest armour any worn piece
  has today. The cut is the Defend action's halving, the one "cut a hit"
  number the game already has. The block comes back after 1 turn. A shield
  def may carry its own `armor`, which is used instead.

## Waiting on a ruling

- Wiring the rule into the hits the player takes and the player's armour
  total. Both live in `game/main.js` (`applyDamageToPlayer`, `_playerArmor`),
  which is outside this slice's files. Until it is wired, acceptance 1 and 2
  hold for the rule, not yet in play.

## Out of scope

- A shield item in the world, its name, art or copy; a shield's bash damage
  number; any screen that shows the block.
- Shields on enemies.
