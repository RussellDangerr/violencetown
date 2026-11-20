# BP1: a boon poition raises your max MP for good

Goal: the permanent half of the poition. One placeholder boon (+1 max MP, name and
description are `[TEXT]`) and a saved record, so later work has something to hand out.
Nothing places it in the world.

Acceptance:
- ITEMS has `boon_poition`, poition `{ stat: 'mana', amount: 1, permanent: true }`; no map,
  chest, kit or stock lists it.
- Drinking one raises max MP and MP by the amount (fresh game: MP 101/101).
- `game.boons` ({ mana: n }) saves, is left out of the save while empty, and a new game clears it.
- Thrown, it skips the damage-over-time branch and shatters with today's line; record unchanged.
- The Quests tab shows one line "[TEXT] n" counting boons drunk.
- npm test, balance:check, naming grep, autoplay:check pass with no drift.

Rulings: none. Out of scope: placing boons anywhere, real names or copy, art, other stats.
