# IC5: Siberia, the tigress snowwoman, rules the frozen area and drops the ice cone

## Goal

The frozen area (IC3) gets its boss. A new boss slot, `frozen.boss`, holds one registry entry,
Siberia, a tigress snowwoman. She stands in the frozen area with a boss bar. Beating her hands
the player the Tiger's Blood Ice Cone (IC1), through the same death handler every boss uses and
through auto-loot, so it lands in the bag.

## Acceptance

- Siberia fights in the frozen area with a boss bar, and is named Siberia on every surface the
  boss-names rule reaches (log, target panel, KO tag, overhead label).
- Beating her drops the Tiger's Blood Ice Cone, once, from the slot (`requiredDrop`), not from
  her own kit or her name.
- A test proves the drop comes from the slot: another occupant of that slot would drop it too.
- A 3440x1440 GIF of the end of the fight, from real key input.
- `npm test`, the naming grep and `autoplay:check` pass. `balance:check` passes once her row is
  accepted.

## What it rests on

- ICR1, Caelan's own answer: defeat a snowman character that is a tiger; it drops a tiger's
  blood ice cone, the tiger's blood filling the cone. Our own character, not the cereal mascot.
  He later named her Siberia, a tigress snowwoman (she). It stays syrup, never gore.
- IC1 (the cone), IC3 (the frozen area), IC4 (frozen mooks) and IC2 (quest 2 needs the cone)
  are merged, and so is auto-loot (FX3).
- The spine: a boss slot of a map that is off the spine, so no Locked row moves. A boss binds to
  its slot, never to a name.

## The build

- `game/slots.js`
  - A `siberia` entry: the shared placeholder boss numbers and kit (as the Act 2 stand-ins),
    the chart's `cold` weakness row (as the frozen mooks), her name `Siberia`, `[TEXT]` barks
    and `[TEXT]` examine.
  - A `frozen.boss` slot of kind `boss` on `frozen-map.json`, `requiredDrop` the cone, pool of
    that one entry. No drop line of her own, so the death handler's generic line is used.
- `game/sprites.js`: a `Siberia` row on a Tiny Dungeon cell already used by the placeholder
  boss (no tint mechanism exists, no new art).
- `game/frozen-map.json`: one spawn in `frozen.boss`, on open snow away from both doors.
- `tests/tiger-snowman.test.js`: the slot and entry, the spawn, the name on every surface, the
  drop coming from the slot through the real death handler, once only, into the bag.

## Out of scope

- Her real stats, sprite, barks, examine text, and any melt-into-syrup death line: all stand-ins
  or `[TEXT]`, for Caelan to rule on.
- Quest changes (IC2 already asks for the cone) and the Factory machine (IC6).
