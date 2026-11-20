# FX73: Map tab lines stay behind the zone boxes

## Goal
On the Map tab the long Canyon to Valley connector runs centre to centre across the Sewer box and
shows through it, because the box fill is see-through. world-map.js says that line runs behind the
boxes between. Make it so.

## Finding (measured first)
On origin/dev at 3440x1440 on a fresh game, sampling twelve points inside the Sewer box along the
Canyon-Valley line gave (84,72,45) on the line and (37,32,25) just beside it. The line shows through.

## Change
In `_drawWorldMapBody` (game/renderer.js), each box first gets an opaque backing in the panel's own
colour (`UI.panelBg`) at full alpha, then the existing fill, outline and label as before. An
unvisited box still fades to half alpha, now over the backing instead of over a connector.

## Acceptance
1. No connector shows through any box, visited or not.
2. An unvisited zone still looks fainter than a visited one (sampled in a test).
3. Connectors, box positions and box colours are otherwise unchanged.
4. npm test, balance:check, naming grep, autoplay:check pass.

## Rulings
None.

## Out of scope
Connector routing, box layout, colours, labels, any other part of renderer.js.
