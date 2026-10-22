---
name: board-loop
description: One pass of Violencetown's ticket-board loop. Reads the board, clears Claude's turn (Merge it, Changes, replies, Tweak it), builds at most one approved slice through the slice-builder agent, writes the cards back, posts a short update and schedules the next pass. Use when the /loop fires, or when Caelan says to run the board loop or work the board.
---

# Board loop: one pass

The rules live in `tools/roadmap-board/LOOP.md`. **Read it in full at the start of every pass.**
This file is only the running order. If the two ever disagree, LOOP.md wins.

The board's word for turning an idea into rulings and slices is **tweak**. Use no other.

## Running order

1. **Read the board**, per LOOP.md §1 step 1. Use a fresh folder:
   `<scratchpad>/board-loop/<yyyy-mm-dd-hhmm>/`.
2. **Recover stale `doing` cards** (§1 step 2).
3. **Clear Claude's turn** in the §1 step 3 order. Merges follow §4, tweaks §5, ruling options
   §6. At most one merge and two tweaks.
4. **Ask what's next:** `node tools/roadmap-board/next-slice.mjs <folder>`.
5. **If there's a pick:**
   1. Recon it (§1 step 5).
   2. Claim it (§1 step 6).
   3. Spawn the `slice-builder` agent with the card JSON, the picks of the rulings it rests on,
      `slug` and `touches`.
   4. Write its report back to the card (§1 step 7). Board writes stay here, never in the
      builder.
6. **Post the update** (§7): six lines at most, in plain words, no card codes without their
   title.
7. **Schedule the next pass** with ScheduleWakeup, prompt `/board-loop`:
   - **60 s** after real work;
   - **3600 s** when idle, with `noop: true`;
   - **`stop: true`** only per §7.

## Policy defaults until Caelan rules (board cards LP1–LP5)

| Card | Until he picks |
|---|---|
| LP2 | one loop |
| LP3 | caps on: 3 rulings + 3 slices per tweak, no new tweaks while Your turn ≥ 7 |
| LP4 | ideas stay put; the update names the 3 oldest |
| LP5 | per-pass update, no digest |
| LP1 | no settings change |

Read the cards each pass. Once he picks, his pick wins.

## Hard stops

- Never merge without his Merge it.
- Never push `main`, tag, or force-push.
- Never answer a ruling or press his buttons.
- Never put board content in a committed file.
- Never work in his checkout.

If any step would need one of those, stop that step and say so in the update.
