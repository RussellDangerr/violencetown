# FD1: carrying Mola Cola into the frozen area brings a pack of polar bears

## Goal

The first row of the interaction table (IN1). Walk into the frozen area carrying Mola Cola
and a pack of three polar bears comes in from the edge of the map, once per entry. The
player thinks they want the burger; they want the cola. The bears fight for real and keep
hitting until every Mola Cola is gone from the bag. Then they take it, and leave. A burger
is never touched.

## Acceptance

- Entering the frozen area carrying Mola Cola brings three polar bears, once per entry; the
  row's note is a `[TEXT]` placeholder, shown once and kept on the notes tab.
- Carrying only a burger, or nothing, brings no pack.
- The bears chase and hit for real until you drop every Mola Cola or fall.
- Once the cola is dropped they take any cola lying on the ground and leave; the burger stays.
- A test walks in carrying Mola Cola with real keys.

## Rulings it rests on (picks)

- FDR1: the bears are secretly after the Mola Cola (his words); the burger is the decoy.
- FDR2 (a): once each time you enter the zone carrying one, as a single event (a whole pack).
- FDR3: they take all your Mola Cola and leave (his words).
- FD1R1 (a): three bears.
- FD1R2 (c): a real fight, they keep hitting until you drop the cola or fall.

## The build

- `game/interactions.js`: the one table row (carry `mola_cola`, zone `frozen-map.json`),
  its effect that calls the pack once per entry, and the leave check.
- `game/main.js`: the per-entry flag is cleared when a map loads; the leave check runs with
  the interaction check.
- `tests/burger-bears.test.js`: the rule end to end.

## Out of scope

The ice cone and the ants (AN2); any real wording (`[TEXT]`); bear numbers (the existing
polar bear entry is used as is); a pack surviving a save and reload (the zone reloads its
own creatures).
