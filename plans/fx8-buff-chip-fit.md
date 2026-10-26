# FX8 - buff chips show as much of the name as fits

## Goal

The buff bar (top right of the HUD) draws one chip per active buff or debuff: the
name on the top line, turns left on the bottom line. Today the name is cut to its
first 5 letters (`buff.name.toUpperCase().slice(0, 5)`), so "STRENGTH POITION"
reads "STREN" and "DEFENCE POITION" reads "DEFEN" in a chip that has room for
about twice that.

Cut the name by its measured width instead, the way the rest of the HUD already
fits VT323 text (`cutToWidth` / `Renderer._measurer`, from the fx5 text-wrap
work): the longest head of the name that fits inside the chip.

## Acceptance

- A buff chip shows the longest prefix of the (upper-cased) name that fits the
  chip's text room; a name that fits is shown whole.
- A test pins it for every buff name the game can put on the player: every
  `BUFF_DEFS` name, every name passed to `addBuff` or pushed onto a buff list in
  `game/`, and the poition buff names. For each: the label is a prefix, it fits,
  and one more letter would not.
- A test draws the buff bar through the renderer and checks the drawn label.
- Before and after screenshots at 3440x1440 with real buffs (strength and
  defence poitions drunk with real keys). Not committed.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

None.

## Choices made here

- No cut mark. Today's 5-letter cut has none, and the card asks for the
  prefix, so the label is a plain head of the name (a trailing space is
  dropped). A `~` like the dock log's would cost one letter per chip.
- The chip size (52 x 26) and its 3 px text inset stay exactly as today.

## Out of scope

- Chip size, layout, colours, the turns number, and the enemy buff badges.
- Buff names themselves (copy is not the loop's to change).
