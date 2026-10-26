# AB3 — the three Act 2 quests

**Date:** 2026-10-26
**Parent:** `plans/spine.md` §1 (Act 2) and §9 (the 2026-10-23 and 2026-10-25 rulings),
`plans/ab1-act2-placeholder-bosses.md`, `plans/ab2-alien-boss-fight.md`.

## Goal

Each Act 2 zone gets a short quest, and that zone's boss fight is one step inside it. Finishing
the quest is what puts the zone's required item in your bag. Today the boss drops the item
directly (AB1's interim); this slice replaces that.

- **Graveyard — given.** Help the dead move on, face the Deity, and the item is given to you.
- **Factory — taken.** Free the Greys, beat the Alien, and take the item off him.
- **Carnival — earned.** Enter the arena, beat Bigfoot, and earn the item as the prize.

Every line, objective and NPC name the quests add is `[TEXT]` or `[NPC]` until Caelan writes them.

## The shape

- `game/quests.js` — three quests, one per zone, each started on entering its zone. The engine
  tracks one quest at a time today; Act 2 is played in any order (SA-6), so walking into a second
  zone mid-quest would overwrite the first. The engine learns to hold quests in progress side by
  side, with the HUD showing the one for the zone you stand in. Anything it adds to the save is
  left out while empty, so quest 1's save (and the autoplay fingerprint, which hashes it) is
  byte-for-byte unchanged.
- `game/dialogue.js` — `[NPC]` conversations for the steps that are talk, not fight.
- `game/slots.js` — the three Act 2 slots keep their item (SL-4: the item belongs to the slot,
  so any boss in the pool still leads to it), and say that their zone's quest yields it.
- The three Act 2 maps — the `[NPC]` placements the quests need.
- `tests/act2-quests.test.js` — each quest has its verb, the boss fight is a step, finishing it
  yields the item, skipping it does not, and every line is a placeholder.

## Acceptance

- Each Act 2 zone has a quest of its ruled verb, and the boss fight is a step in it.
- Finishing a zone's quest yields that zone's required item; skipping the quest does not.
- Every quest line is a `[TEXT]` placeholder, listed for Caelan's eye.
- A 3440×1440 screenshot of each quest's last step, played through real input.
- `npm test`, the naming grep and `autoplay:check` pass; `balance:check` passes.

## Rulings it rests on

- **Which quest is which (2026-10-25):** Graveyard given, Factory taken, Carnival earned.
- **The items come from quests (2026-10-23):** the boss fight is a step inside the quest.
- **AB1:** one placeholder boss per zone, each dropping its item directly — the interim this
  replaces. **AB2:** the Alien is a real fight. **FX2:** Act 2 bosses retry like the Were-Rat.

## Open: where the boss's drop is stopped

"Skipping the quest doesn't yield the item" means the boss must stop dropping it. Two things
outside this slice's files make the boss drop it today:

- `game/main.js` `_handleEnemyDeath` (the `requiredDropFor(enemyObj, …)` block, lines 4564–4571
  on `dev` at 23d6c95) drops a slot's item on the floor whenever that slot's boss dies, with no
  way for a quest to hold it back.
- Three test files pin that drop for the Act 2 bosses: `tests/act2-bosses.test.js` ("beating it
  drops the item"), `tests/slots.test.js` (the SL-4 loop, "… drops …", and the death handler's
  shape), and `tests/finale-gate.test.js` (reads the items from `requiredDrop`).

Building stops here until Caelan rules on how the drop gives way to the quest.

## Out of scope

- Real names, copy, art or tuning for anything the quests add.
- Naming the three items (SP1).
- The finale, the Financier, and any quest after Act 2.
- Quest 1: it must play exactly as it does.
