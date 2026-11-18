# pc6-plain-copy-guard

## Goal
A test stops `[TEXT]` stand-ins and bracketed player text from creeping back into the game while
the plain-copy slices remove them. It records how many each file has today and holds every file
to that number, so the count can only go down, and each slice that lowers it must say so.

## What the guard counts
It reads every `.js`, `.json` and `.html` file under `game/` as text. A finding is:
- any string a player could see that contains `[TEXT]` or `[NAME]`, or the `[TEXT: ...]` and
  `[NAME: ...]` forms;
- a bracket-wrapped string (its text starts with `[` and ends with `]`, like `[Save loaded]` or a
  template such as `` `[${name}]` ``) when it is the message of a `_log(...)` call, or the value of
  one of these fields: `name`, `description`, `text`, `greeting`, `label`, `reply`, `barks`,
  `adjacencyBark` (in JS objects and assignments, and in JSON).

It skips comments (JS `//` and `/* */`, HTML `<!-- -->`), everything inside `console.*(...)`
calls (tags like `[save]`), regular expressions, and strings in any other field, such as ids.

## Acceptance
- `tests/plain-copy-guard.test.js` holds the scanner, with its rule written at the top.
- An allow-list in that test names every file that has findings today, with its count. The test
  fails when a file not on the list has a finding, when a listed file's count goes up, and when
  it goes down without the list being lowered to match. A file at 0 must leave the list.
- A self-test shows the scanner catches a planted `[TEXT]` and a planted bracketed log line, and
  skips a comment and a console tag.
- npm test, balance:check, the naming grep and autoplay:check pass.

## Rulings
- PCR3 (Caelan, 2026-11-17): every `[TEXT]` and every bracketed stand-in line or name a player
  can see is replaced with plain text, one slice at a time. This guard is how each slice proves
  its drop; the last slice empties the allow-list.
- PCR1 (a): plain lines only; `[TEXT]` never reaches a player.

## Out of scope
Changing any game file or any line of copy. The guard only measures; the plain-copy slices do the
replacing.
