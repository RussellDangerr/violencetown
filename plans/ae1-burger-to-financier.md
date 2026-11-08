# AE1 — the burger is delivered to the Financier

**Branch:** `feature/ae1-burger-to-financier`, cut from `dev`.

## Goal

The delivery quest's last stage (`handoff`) asks you to give the order to the Financier in the
First Blood Bank instead of the stranded traveler on the Downtown street. Act 1 then ends by
meeting him, which is the last beat the spine lists for it (§1).

## Rulings it rests on

- **SP8 — make "meet the Financier" a quest stage?** Caelan picked (a): yes. The 2026-10-03 blend
  ruling said delivering the burger is delivering the package, so the Financier is who it is
  delivered to.
- **SP10 (2026-11-03):** quest 1 stays as the opening; meeting the Financier is its last beat.
  This slice makes that beat real.

## Acceptance

1. The `handoff` stage names the Financier (`bank-financier`) as the receiver, and the Map still
   rings Downtown (the bank is an interior off Downtown).
2. Giving him the order, by talking to him or by offering it from the bag, completes the quest and
   pays the same 50 GP. The traveler no longer takes it.
3. A save from before, taken mid-delivery, still completes. The stage and what was already handed
   over are saved by stage id and item, not by who received them.
4. `plans/spine.md` §8 records SP8 as answered, with the date, and §9 carries a dated entry.
5. A test delivers it to him with real keys.
6. Evidence: 3440x1440 frames of the hand-off.
7. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## What changes

- `game/quests.js`: the stage's receiver, its location line, and the payout log line's speaker.
  Every player-read string there stays `[TEXT]`.
- `game/dialogue.js`: the Financier's dialogue (`banker`) gets the hand-off choice (shown only at
  the hand-off stage, with everything owed in the bag). The traveler's hand-off choice is removed,
  because it would take the items without completing the stage.
- `game/bank-map.json` and `game/main.js`: only if the hand-off needs something in them.
- `plans/spine.md`: SP8 answered in §8, a dated entry in §9, and the beat table row updated.

## The traveler

Left standing on the Downtown street with his lines as they are. What becomes of him (still
waiting, fed by someone else, gone) is a question for Caelan and is not decided here.

## Two Financiers

This uses the placeholder Financier in `bank-map.json`. The vault Financier fought in the finale
(`vault-map.json`) is a different NPC and is untouched. Whether they are one character is a
question for Caelan.

## Out of scope

- Any real copy. Every line the player reads is `[TEXT]`.
- The vault Financier, the finale, and the traveler's fate.
- Changing the 50 GP.
