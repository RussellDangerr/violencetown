# RM1 — the ringmaster can stand in the Carnival's boss spot

## Goal
A new game draws either Bigfoot or the Ringmaster for the Carnival's boss spot. Whoever
stands there gives the Carnival's required item, because the item belongs to the slot
(SL-4), not to the entry.

## What it is
- One registry row in `ENTRIES` (`ringmaster`), built on `placeholderBoss()` exactly like
  Bigfoot: same numbers, same kit, `[TEXT]` barks, the same Boss picture.
- One pool row in `SLOTS['carnival.boss']`, after Bigfoot, weight 1.
- Stand-ins: his name reads `[Ringmaster]` until it is chosen and written.

## Acceptance
- On a seed that draws him the Carnival's boss shows `[Ringmaster]` on the target panel;
  on seed 0 it is still Bigfoot.
- Beating him gives the same required item Bigfoot gives, checked by the SL-4 test that
  loops every pool entry (it picks the new row up by itself).
- A save that already holds Bigfoot keeps Bigfoot (saved picks are respected).
- `defaultPicks()` still gives Bigfoot; the balance golden does not move.
- Autoplay: only its three save fingerprints move (the pick is part of the save); every
  stage stat is identical. The loop records that golden, citing LN1R1; this branch does not.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` (fingerprint drift
  only) are all as described.

## Rulings it rests on
- LN1R1, picked (a): the ringmaster is a boss you may draw instead of Bigfoot; the lion and
  the clown are mini-bosses you always meet; the assistant manager is someone you talk to.

## Out of scope
- His look, name, barks, numbers and fight (all shared placeholders).
- The lion, the clown and the assistant manager.
- The Carnival quest that will hand over the item.
