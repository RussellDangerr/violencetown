# A mugger outside the bank (BS1)

## Goal

Downtown gets a street thief. He hunts you like any hostile, but when he gets next to you he
takes some of your gold instead of hitting you, then runs. You can only catch him when he is
cornered. Killing him, or thieving him back, returns the gold through the paths that already
exist (the death loot and the Thieve verb).

## How it works

- A new Downtown spawn on the sidewalk outside the bank door, born hostile.
- His spawn carries the free-form `tag: "mugger"`. The chase in `game/npc.js` reads that tag:
  - adjacent, with gold in your purse and nothing taken yet: he moves a fixed placeholder amount
    (or all you have, if less) from you to him through `transferGold`, logs `[TEXT]`, and that is
    his turn. No damage.
  - with an empty purse there is nothing to take, so he swings like any other hostile.
  - once he has taken gold, every turn he is in reach of you (his sight range, counted all the
    way round — he is looking over his shoulder) he takes the shipped flee step away from you.
    Boxed in, he stands still: that is how he is caught. Out of reach he stops and catches his
    breath, and drops out of the fight.
  - while running he never eats his kit or buys back HP, so the stolen gold is never burned.
- Kill him: the existing death loot hands over everything he carries, stolen gold included.
  Thieve him: the existing Thieve Coin lifts it back, a pocket at a time.
- His look reuses the green-bandana goblin cell (Greedy Green's), under a new `Ruffian` type.

## Acceptance

- Next to you, he takes gold instead of dealing damage, then runs.
- Cornered, he can be caught; killing or thieving him gets the gold back.
- Gold is conserved: your loss is exactly his gain, and nothing is burned while he runs.
- GIF at 3440x1440 of a mugging and the chase.
- `npm test`, the naming grep and `autoplay:check` pass. `balance:check` passes once the new
  golden row is accepted (the build stops and asks before writing it).

## Rulings it rests on

- Where he works: Downtown, the busy streets outside the bank.
- How he looks: the green-bandana goblin, Greedy Green's look reused outside the Factory.

## Placeholders

- His name is the card's own word, shown in brackets. His log line is `[TEXT]`.
- His stats and kit are Greedy Green's numbers, unchanged, until tuned.
- The amount he takes is a placeholder constant in `game/npc.js`.

## Out of scope

- Remembering the theft across a zone change or a save. Leaving Downtown and coming back
  respawns him from the map, and what he carried is gone with him. Persisting it needs
  `main.js` / `save.js`.
- Any new copy, name or art.
