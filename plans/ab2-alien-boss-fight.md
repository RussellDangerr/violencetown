# AB2 — the Factory's boss becomes a real fight

**Date:** 2026-10-25
**Parent:** `plans/ab1-act2-placeholder-bosses.md` (the placeholder bosses), `plans/spine.md` §1
and §9, `plans/balancing-bible.md` Law 5, `plans/ray-gun-and-carnival.md` §A.

## Goal

The first Act 2 boss to be built out is the Alien Invasion in the Factory. Today it is the
Were-Rat's stat block standing alone in the southwest bay, and the Ray Gun lies free on the floor
of the northwest bay. After this slice:

- The Alien carries the Ray Gun, and beating him drops it. It is no longer on the floor.
- He fights with a few allies beside him, and he spends his gold to keep them standing. That
  spending is Law 5's rally, which already ships: a boss funds any hurt fighter on his side
  within six tiles. This slice gives him fighters to fund.
- He stands in a small arena in the southwest bay, made of props already in the game, each one
  examinable.

Everything new that a player reads is `[NAME]` or `[TEXT]` until Caelan writes it.

## The shape

- `game/slots.js`
  - The Alien's entry keeps its placeholder block and adds `ray_gun` to his kit. The kit already
    drops on death (Law 6f as amended), so the death handler is untouched. The Ray Gun heals
    nothing, so he never uses it up mid-fight.
  - One new entry for his allies, named `[NAME]`. It copies the Factory's own Greedy Green
    exactly (look, health, armour, damage, gold, kit), minus the bribe and wander fields, so it
    fights on his side. No new tuning number.
- `game/factory-map.json`
  - The Ray Gun leaves `items`.
  - Three ally spawns, placed by hand by entry, beside the boss.
  - A few `props` and an `examinable` on each, all `[TEXT]`, ringing the bay without closing it.
- `tests/act2-boss-first.test.js` — the checks below.

`game/sprites.js`, `carnival-map.json` and `graveyard-map.json` are in this slice's reach but need
no change: the allies borrow an existing look and the arena uses existing props.

## Acceptance

- The Factory floor carries no Ray Gun; the Alien's kit does, and his death drop includes it at
  his tile.
- Three allies stand within the rally range of the boss, on open ground, on his side, none of
  them a boss, and the zone still has exactly one boss.
- With an ally hurt, the boss's spending plan is a rally, and a tick of the boss's turn moves
  his gold into the ally's health.
- The ally's numbers are the Greedy Green's, pinned by the test so a change is deliberate.
- Every arena prop has art, stands on floor, and carries a `[TEXT]` examinable; the boss, every
  ally and the Factory locker are still reachable from the arrival tile.
- `npm test`, the naming grep, the LimeZu grep and `autoplay:check` pass. The balance golden
  gains the allies' rows and the Alien's row moves (his kit now carries the Ray Gun), and the
  Factory's coins rise by the allies' wallets: the build stops and reports that drift rather
  than rewriting the golden.

## Rulings it rests on

- **ABR1 — a.** The Alien Invasion in the Factory is built first.
- **ABR2 — b.** A boss with a few allies he funds. The zone's own mechanic (the Grey rescue) is
  a later slice.
- **ABR3 — a.** Move the Ray Gun: the Alien boss drops it, and it leaves the floor.
- **AB1 (merged).** The placeholder stat block, the `Boss` look and `[TEXT]` barks stay.
- **FINR5 / FINR6 — Factory taken.** The Factory's required item is taken off the Alien after
  freeing the Greys, inside a quest. Until that quest is built he drops it directly, as AB1 left
  it; this slice does not change that.

## Choices made here, for Caelan's eye

- Three allies (the ruling says "a few"), with the Greedy Green's look and numbers.
- The arena's props and their placement are picked from what the game already draws.
- His kit is the placeholder kit plus the Ray Gun; he still holds the wooden sword.

## Out of scope

- Real names, art, barks, lines and numbers for the Alien and his allies.
- The saucer, the Greys and the rescue loop; the taken quest around the Factory's item.
- Any `main.js` or `renderer.js` change.
- The Carnival's and the Graveyard's bosses.
