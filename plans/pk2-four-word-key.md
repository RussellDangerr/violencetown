# PK2 - a generated four-word key, shown once

## Goal
The game can make the player a random four-word phrase, show it once, and derive from it an
id that stays on the device. The phrase only matters when moving to another device; the
copy/paste save code (PK1) keeps working beside it.

## Acceptance
- A new key is four random words from a bundled list, shown once on a key screen. The phrase
  is never written to localStorage, the save, or any log; closing the screen discards it.
- The same phrase always gives the same id (PBKDF2-SHA256, fixed salt, fixed iterations,
  via SubtleCrypto). Typing the phrase back (any case, spaces or hyphens) gives the same id.
- Only the id is kept on the device (PKR2 b: the browser keeps its own copy).
- Words come from `crypto.getRandomValues`; the player never types a free phrase to create one.
- The list holds exactly 4096 distinct words, 12 bits each, 48 bits over four words.
- The autoplay never reaches the key screen; golden unchanged.
- Gates: npm test, balance:check, naming grep, autoplay:check, limezu grep, loop-guard.

## Rulings
- PKR1 (a): no cloud server yet; save codes and a local key first. The id goes nowhere.
- PKR2 (b): the browser keeps its own copy too; the phrase matters only for moving devices.
- PK1 (copy/paste save code) is already on dev.

## Word list provenance
`game/wordlist.js` is written for this repo from plain common English words, not copied from
EFF, Diceware, BIP-39 or any other list. Its header says so. Surfaced under Needs your eye.

## Out of scope
Any server, account or sync; typing a key in to restore (needs a server); player-facing
copy (all `[TEXT]` placeholders); changes to index.html or CSS (the screen is built in
main.js, inline-styled).
