# EK1 - a hurt enemy drinks its Defence Poition or puts on armour from its kit

## Goal

An enemy at or below the kit threshold (70 HP, `KIT_HP_FLOOR` in `game/ai.js`) already
digs into its kit for a heal. If it has no heal to use, it now reaches for the other
things it carries: a Defence Poition first, then an armour piece.

- Heals still come first, exactly as today (including waiting while a dose is still
  regenerating). The next two only come into play when the kit holds no heal at all.
- Defence Poition: drunk with its existing numbers (+4 defence for 6 turns). The buff
  already existed on enemies but nothing read it. Now every hit the enemy takes is
  reduced by it, because the enemy's body reads its live defence buffs when it takes a
  hit. Hits you land on it do 4 less for 6 turns. One is not drunk on top of a running
  one: while the buff is up, the next choice is armour.
- Armour: with no poition to drink, it puts on the heaviest armour piece in its kit
  (the same pick Thieve's rank and TG1 use, ties by authored order). The piece moves from
  its kit to `equipped`, and its number is added to the armour the enemy has on. It
  counts as worn from then on, so Thieve's Gear can take it and it does not drop when
  the enemy dies (TG1R2).
- Order is heal, poition, armour; one item a turn; the log uses today's
  "digs out X and uses it." line. No new words and no new numbers.
- When two pieces are worn, Thieve's Gear takes the heavier one by its usual weight
  (armour times two, plus damage), and the enemy keeps the other piece's number.

## Acceptance

1. At or below 70 HP with no heal in its kit, an enemy carrying a Defence Poition
   drinks it; your hits on it do 4 less for 6 turns, and the poition leaves its kit
   on the panel.
2. With no poition, it puts on an armour piece from its kit; its armour on the panel
   goes up and the piece moves from kit to worn.
3. An enemy with a heal still heals first, as today.
4. Quest 1's autoplay moves (the Red Fungi and the Fungus King carry Defence Poitions).
5. Evidence: 3440x1440 frames of the log line and the target panel before and after.
6. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass; the
   goldens are written by the loop.

## Rulings this rests on

- EKR1, picked (a): the kit items get used, accepting that quest 1's autoplay moves.
- TG1R2, picked (b): worn gear does not drop.

## Loop's calls, flagged

- Order heal, then poition, then armour.
- A poition is not drunk while one is still running; armour goes on instead.
- A piece put on adds to the armour the enemy has, and counts as worn (Thieve's Gear).
- The defence buff is read where an enemy takes damage, so a Defence Poition thrown or
  given to an enemy now works too.

## Out of scope

- New names, copy, tuning numbers; the panel labels stay as they are.
- Writing the autoplay or balance goldens (the loop does).
- Strength poitions or any other kit item kinds.
