# AB3 - the three Act 2 quests

**Parent:** `plans/spine.md` (Act 2, the beat table, the 2026-10-23 and 2026-10-30 rulings),
`plans/ab1-act2-placeholder-bosses.md`, `plans/ab2-alien-boss-fight.md`.

## Goal

Each Act 2 zone gets a short quest, and that zone's boss fight is a step inside it. Finishing the
quest is what puts the zone's required item in the bag. Until now the boss dropped the item on the
floor; now the boss's death moves the quest on, and the item arrives at the quest's last step.
Skipping the quest (beating the boss, never finishing) leaves the bag without the item.

Verbs, as ruled by SP1R1:

- **Factory: given.** The flux capacitor is handed to you by a Factory NPC after the Alien falls.
- **Graveyard: taken.** After the Deity falls you take the soul crystal yourself.
- **Carnival: earned.** After Bigfoot falls you collect the stuffed animal as the prize.

Every quest title, objective, NPC name, label and reply is `[TEXT]` or `[NPC]`.

## The shape

- `game/quests.js`: `ACT2_QUESTS`, one record per zone, derived from the three boss slots (the item
  id is read from the slot, never written in the quest). Three steps each: `boss` (set on entering
  the zone), `collect` (set when the boss dies), `done`. The step lives in the quest engine's saved
  `flags` under `act2_<zone>`, so it sits beside the active quest, never touches `activeId`, and is
  absent from the save until a player has entered an Act 2 zone. Quest 1 and the burger delivery
  are untouched. While you stand in an Act 2 zone with an unfinished quest, the HUD line shows that
  quest's step.
- `game/slots.js`: the three Act 2 slots keep their `requiredDrop` (SL-4: the item belongs to the
  slot, so any boss in the pool leads to it) and gain `viaQuest: true`.
- `game/main.js`: in the required-drop block, a boss whose slot is `viaQuest` tells the quest it
  fell and skips its floor drop. A few lines.
- `game/dialogue.js`: one `[NPC]` conversation per zone; its reward choice appears only at the
  `collect` step and hands the item over (`_grantItem`).
- The three Act 2 maps: one `[NPC]` placed near each boss.
- `plans/spine.md`: drop "interim" from the three Act 2 rows, nothing else.

## Acceptance

1. Each Act 2 zone has a quest of its ruled verb, and the boss fight is a step in it.
2. Finishing a zone's quest yields that zone's item; skipping the quest does not.
3. Every quest line is a `[TEXT]` placeholder, listed under Needs your eye.
4. A 3440x1440 screenshot of each quest's last step.
5. `npm test`, the naming grep and `autoplay:check` pass; `balance:check` passes.

## Rulings it rests on

AB1 (a boss per zone, its slot holds the item). SP1R1 (Factory gives, Graveyard is taken, Carnival
is earned). SQ1R1 (several ways to finish; this slice builds one each). AB3R1 (the boss skips its
drop when its zone's quest gives the item; main.js's drop block and two tests change in one
"behaviour changed" commit).

## Out of scope

- Real names, copy, art, tuning. Naming the items.
- The other ways to finish each quest (SQ1R1): one way each here.
- The verbs as different mechanics: today the verbs differ in who hands the item over and in the
  placeholder labels only.
- The frozen area's slot, the finale, the Financier, quest 1.
