# TT1: the Stranded Traveler is gone once the burger is delivered

## Goal
In Downtown the Stranded Traveler (`dt-recipient`) keeps asking for food. The burger now goes
to the Financier (AE1), so after the delivery he has no part to play and should not stand there.

## Ruling it rests on
TT1R1, pick (b): he no longer spawns after the delivery. No new words.

## How
A map enemy spawn may carry `goneAfter: "<quest id>"`. `_loadMap` skips that spawn when the quest
is complete. The Traveler's spawn gets `goneAfter: "deliver_burger"`. Quest completion is part of
the save, so it holds after reload.

## Acceptance
- Before the delivery he stands and talks as today.
- After `deliver_burger` is complete, entering Downtown through the real zone change: he is absent.
- Holds after a save and reload (the completed list round-trips).
- npm test, balance:check, naming grep, autoplay:check pass.

## Out of scope
Any new dialogue; other characters; other quest-gated spawns.
