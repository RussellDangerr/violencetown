# YC1 - the Financier brings up the Yellow Card when you deliver the burger

**Branch:** `feature/yc1-financier-yellow-card`, cut from `dev`.

## Goal

Once the burger is delivered, the Financier's talk offers one more choice about the Yellow
Card. Picking it gets his reply. That is the whole slice: no item, no mechanic, no reward.

## Rulings it rests on

- **YCR1 - where should the Yellow Card dream pay off?** Caelan picked (a): at the end of
  Act 1, the Financier, receiving the burger, dangles it (together with AE1, which made him the
  receiver).

## Acceptance

1. After Special Delivery is complete, the Financier's talk shows the Yellow Card choice. Before
   the delivery it is not there.
2. It is offered once. Picking it spends it, and it stays spent after a save and reload (a quest
   flag records it, since an NPC's spent `once` choices are not saved).
3. A test talks to him with real keys: hand the order over, pick the choice, read the reply, leave,
   talk again and find it gone.
4. Evidence: a 3440x1440 frame of the choice.
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## What changes

- `game/dialogue.js`: one choice on the `banker` entry. Its label and his reply are `[TEXT]`.
- `tests/yellow-card-talk.test.js`: the new test.

## Out of scope

- What the Yellow Card is or does. Nothing is written about it; the lines are placeholders.
- Any item, mechanic, reward or later payoff.
- The vault Financier and the finale.
