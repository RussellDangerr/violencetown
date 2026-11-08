# FX38: the log and the shop call named townsfolk by their names

## Goal

A named townsperson (Knuckles, Macc, Mince, Platero and the rest) is called by name in dialogue,
but the log says "Violencian" and the barter screen titles them "VIOLENCIAN". After this slice
every surface that names a fighter or a shopkeeper uses the name when there is one.

FX4 (plans/fx4-boss-one-name.md) did this for bosses through `shownName()` in `game/enemies.js`.
Recon found it stopped at bosses: anyone else still reads as their `type`. This slice extends the
same helper rather than adding a second one.

## What counts as named

A non-boss character with a `dialogueId` and a `name` that is not a bracketed placeholder.
Unnamed townsfolk ("Local", the placeholder-named driver, the Canyon Rats) keep their type; so
does "Violencian" itself, which is the correct demonym.

## Surfaces

- the defeat line, the "turns on you" line, the immune line, the perception lines (all through
  the fighter's `entity.name`, which `shownName` builds);
- the target panel and the `[KO]` tag (already read `shownName`);
- the barter screen: its title, its "IS <MOOD>" line, its "<NAME>'S GOODS" header, and the log
  lines about opening the till and the offer;
- the article: a named character takes no "The" ("Knuckles turns on you!", not "The Knuckles").

## Brackets

Log lines are bracketed, and item and character names carry their own brackets, so a line reads
`[Dropped [Rock]]` or `[Defeated [Violencian]]`. The log (`_log`) now flattens any bracket nested
inside a bracketed line, so no line nests brackets. Only depth two and deeper is dropped; the
outer pair stays.

## Acceptance

1. Fight lines, the defeat line, the barter screen, the target panel and the KO tag use a named
   townsperson's name; unnamed ones keep their type.
2. No log line nests brackets around an item name.
3. Evidence: 3440x1440 crops of the shop title, a fight line and the target panel.
4. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass. The autoplay may move
   only in log wording.

## Rulings and picks

None. No new names are written; the existing ones are used.

## Out of scope

- `give-action.js`, `npc.js` and `combat.js` lines that read `recipient.type` (outside this
  slice's files): they are listed in the report.
- Writing any name or line of copy; examine lines and dialogue headers.
