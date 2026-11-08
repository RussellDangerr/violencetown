# FIN1 — the bank's vault door opens only with all three Act 2 items

**Date:** 2026-10-25
**Parent:** `plans/spine.md` §1 (the finale) and §9 (the Act 2 items),
`plans/ab1-act2-placeholder-bosses.md` (the three items).

## Goal

The First Blood Bank's vault is a line of text today: an examine spot on the floor in front of
the back wall. This slice puts a door in that wall. Walk into it carrying fewer than the three
Act 2 items and it stays shut and says so; walk into it carrying all three and you step through
into a new room, the vault.

## The shape

- **`game/bank-map.json`** — the back-wall cell straight above the `bank_vault` examine spot,
  (6, 1), becomes a door tile with a transition into the vault. The transition `requires` the
  three Act 2 items as a list, and its `requiresMsg` and `label` are `[TEXT]`. The examine spot,
  the furniture and the Financier stay where they are; you reach the door by walking round the
  left end of the service counter, as you reach the examine spot today.
- **`game/vault-map.json`** — a new small room, plain bank wall and floor, with a door at the
  bottom leading back to the bank, landing you on the examine spot in front of the vault door.
  Nothing else in it yet: the finale's beats are later slices. It shares the bank's zone name,
  since it is the same building.
- **`game/map.js`** — `carriesAll(requires, inventory)`, the one rule for an item gate. A gate's
  `requires` may be one item id, as every gate is today, or a list of ids, all of which must be
  in the bag. A missing or empty `requires` is open.
- **`game/main.js`** — the walked-onto transition gate asks `carriesAll` instead of checking a
  single id. That is the whole change to the core file. The grapple anchor's gate keeps its
  single-item check: only one anchor exists and it wants one item.

## The door's look

Caelan ruled the door should be a boxy proxy you can see and walk to, not a text-only spot. This
slice builds it from what the maps can already draw: the existing door tile set in the back wall,
the same door art as the way out to the street. No new art, sprite entry or renderer code. It is
a stand-in until the door gets its own picture.

## Acceptance

- With fewer than three of the items, stepping onto the vault door does not take you anywhere,
  and the `[TEXT]` locked message is logged.
- With all three, stepping onto it takes you into the vault room, and the vault's door takes you
  back to the bank.
- The door's list is exactly the three Act 2 bosses' required drops, so it cannot drift from
  what the bosses drop.
- The door can be reached on foot from the bank's entrance.
- Every existing single-item gate behaves as before.
- Evidence: screenshots at 3440x1440 of the door shut (fewer than three items, the `[TEXT]` line
  showing) and of stepping into the vault with all three.
- `npm test`, `balance:check`, the naming grep, the LimeZu check and `autoplay:check` all pass.
  Quest 1 never reaches the bank's vault, so the autoplay golden must not move.

## Rulings it rests on

- **The door's look:** a boxy proxy door you can see and walk to (picked over text only).
- **Where the three items come from:** Caelan's own answer, that the boss fights become part of
  the three quests; the bosses drop the items directly until the quests are built.
- **Which quest is which:** the Graveyard's item is given, the Factory's taken, the Carnival's
  earned. Nothing in this slice depends on the verbs; the door asks only for the three items.
- **Where the bank is:** Bank Street is Downtown's First Blood Bank, the interior that exists.

## Out of scope

- Real copy for the locked message, the door's label or anything in the vault.
- A picture of its own for the vault door, or an open/shut tile swap.
- Anything inside the vault: the Financier's fight, the finale and the credits are later slices.
- Taking the three items from the bag when the door opens.
- The three quests that wrap the boss fights.
