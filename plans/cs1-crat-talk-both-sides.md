# CS1 — the Crat: talk to both sides and make a ruling

A Sewer character beat (`plans/spine.md`: a pool entry in the Sewer, never the escape set
piece's slot). The reward for settling it is a later slice.

## Goal

A small side room off the Sewer holds a dispute. Two sides each claim the same thing, and the
Crat asks you to settle it. You hear each side out, look around if you like, then rule for one of
them. Either side will also pay you to rule its way. Whatever you decide is remembered in the
save.

This branch builds the skeleton: the room, the door to it, the three talkers, the choices and
the flags. Every line a player reads is a `[TEXT: ...]` placeholder that says what the line is
for. Caelan writes the words.

## What it rests on

- **Where:** a new side room north of the Sewer, through a door in the Sewer's north wall above
  the cape grate's room. It counts as part of the Sewer (`zoneName` SEWER, so the Sewer's music
  and world-map box).
- **The tell:** clear to anyone who looks. Each side has a clue to examine, and both clues and
  both testimonies point the same way. Which side is in the right is one constant,
  `CRAT.trueSide`, so swapping it is one line.
- **The reveal:** the story ends on "you are not the mother". The ruling's reply carries the
  reveal, as a placeholder.
- **Bribes:** you are the arbiter, but you can be bought. Each side, once heard, offers to pay you
  to rule its way. You can take one offer. Taking it does not force your ruling; ruling against
  the side that paid you is its own line.

## How it works

- `game/sewer-north-map.json` (new): a small walled room in the Sewer's tiles, 12 by 10. The
  Crat stands at the top, one side on each flank, a clue in the wall beside each side, and a
  drain at the bottom leads back. Its exit lands you inside the Sewer below the new door.
- `game/slots.js`: the Crat is the Sewer's character slot, `sewer.character` (spine SL-5, kind
  `character`), a pool of one: the registry entry `crat`. The room's spawn names the slot and
  says where; the entry says who. The two sides are plain map NPCs beside it.
- `game/sewer-map.json`: the north wall cell at (11,0) becomes a drain (the same tile as the
  Sewer's west exit) with a transition into the new room. Nothing else in the Sewer changes.
- `game/dialogue.js`: three dialogues, `crat`, `crat_side_a`, `crat_side_b`, built from one
  table. They use only what dialogue already does: `available(game)` gates on quest flags, and
  `onPick` sets them. The flags live in `questEngine.state.flags`, which the save already keeps:
  - `cratHeardA`, `cratHeardB` — you heard that side out.
  - `cratBribe` — `'a'` or `'b'`, whose money you took.
  - `cratRuling` — `'a'` or `'b'`, who you ruled for.
- The ruling is offered by the Crat once you have heard both sides, and only until you rule.
  There are six ruling replies: ruling for the side in the right or the other one, times no
  bribe, a bribe from the side you ruled for, or a bribe from the side you ruled against.
- A side's offer moves gold from that side to you through `transferGold`. The amount is
  `CRAT_BRIBE_GP`, left at the 5 GP every bribe in the game uses today; each side carries
  exactly that much. An offer is shown only while that side can still pay.
- The art is borrowed: all three are Violencians (three different looks). Placeholder.

## Acceptance

1. The Crat and both sides stand in the new room north of the Sewer, and you can talk to all
   three.
2. You can rule for either side once you have heard both. The bribe offers exist, one per side,
   and you can take one.
3. Every line is a `[TEXT: ...]` placeholder.
4. Screenshot at 3440x1440 of the talk (kept outside the repo).
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

Tests: `tests/crat.test.js`. They walk the room's maps and doors, and play the dialogue through
`main.js`'s own `_dialogueChoices` and `_pickDialogueChoice` against a stand-in game.

## The slot and the recorded numbers (ruled: a real slot now)

- **The slot.** A new slot changes the save's slot picks: a new game and an old save both carry
  `sewer.character: crat` now. The assertions in `tests/slots.test.js` and
  `tests/save-roundtrip.test.js` that list today's picks gain that one pick, in a commit that
  says the behaviour changed. The slot's picks come from their own stream, so no combat roll
  moves.
- **The balance baseline.** The three talkers add three roster rows (`sewer-north/crat`,
  `crat-a`, `crat-b`) and a `sewer-north` line to the gold faucets (the two sides' purses).
  `tools/balance-golden.txt` is re-recorded in its own commit, under the ruling.
- **The autoplay baseline.** The save fingerprint moves with the extra pick; play must not.
  Before `tools/autoplay-golden.json` is re-recorded, every stage's turns, damage, deaths and gold
  are checked equal to the old golden. If any of them moves, the slice stops and asks.
- `tests/crat.test.js` pins the three in the room: on floor, damage 0, the Crat filled from its
  slot, and each side carrying exactly `CRAT_BRIBE_GP`.

## Out of scope

- The reward for the ruling, and what the Sewer does with the memory of it (the next slice).
- Any words: greetings, choice labels, replies, clue text, exit labels and the two sides' names.
- Real art for the three, and any change to disposition from ruling.
