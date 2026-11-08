# ni1: the three required items carry their names

## Goal
Act 2's three required items stop reading [ITEM A], [ITEM B] and [ITEM C]. Each takes the
name the spine's ruling of 2026-10-30 (plans/spine.md section 9) gave it:

| zone      | slot            | inside id     | name            |
|-----------|-----------------|---------------|-----------------|
| Carnival  | carnival.boss   | act2_item_a   | Stuffed Animal  |
| Factory   | factory.boss    | act2_item_b   | Flux Capacitor  |
| Graveyard | graveyard.boss  | act2_item_c   | Soul Crystal    |

The zone-to-id mapping is read from `requiredDrop` in game/slots.js, not assumed.

## Acceptance
1. The bag and the log show Stuffed Animal from the Carnival boss, Flux Capacitor from the
   Factory's and Soul Crystal from the Graveyard's.
2. Nothing in the game still reads [ITEM A], [ITEM B] or [ITEM C].
3. A save holding the old items loads and shows the new names, and the vault door still opens
   for them. Only the display `name` changes; the ids stay, so saves and the door's
   `requires` list are untouched.
4. Each description stays [TEXT] and the icon stays the magenta placeholder (both are
   Caelan's to write).
5. Evidence: a 3440x1440 frame of the bag holding all three.
6. npm test, balance:check, the naming grep and autoplay:check pass.

## Rulings this rests on
- Caelan, 2026-10-30, recorded in plans/spine.md section 9: the Carnival's item is a stuffed
  animal you win, the Graveyard's a soul crystal you take, the Factory's a flux capacitor you
  are given. The three names were given in the card's note.

## Out of scope
- Descriptions (stay [TEXT]), icons (stay the magenta placeholder).
- Changing any id, any drop, the vault door, or how the items are obtained.
- Older plan files that mention the placeholder names as history (plans/ab1-...).
