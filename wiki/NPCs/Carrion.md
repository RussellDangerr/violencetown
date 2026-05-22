---
name: Carrion
zone: Sewer (south corridor)
role: First merchant prototype, non-hostile NPC
creature-type: Dehydrated zombie
---

# Carrion

A dehydrated zombie merchant. Pushes a cart down the sewer river. Blocks the southern corridor of the [[Zones/Sewer|Sewer]].

## First Contact

> *"Road's blocked, friend. Sewer river's swollen with sludge. Come back later."*

## Evidence of Sludge

Her dehydration is from long-term sludge exposure. She values water above all else. The blocked road opens when the player resolves the Sewer's central conflict (Fungus King + soap supply chain), restoring river flow.

## Mechanical Role

- First test case for the [[Disposition]] system.
- First merchant for the [[Economy]] system (sells sewer scrap, glow-moss, mystery meat).
- First non-hostile NPC — her `behavior: [IDLE]` whitelist makes her unable to attack, even with stimulus.
- Appears in multiple zones in different states across the game (world-state progression).

## Trade

`tradeThreshold: 40`. Raise disposition through gifts (she values water, bandages, soap). Once above threshold: merchant mode opens. `onFlip: "offerDiscount"`.
