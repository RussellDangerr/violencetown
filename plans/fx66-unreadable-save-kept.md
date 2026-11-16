# FX66: a save that won't open is kept aside

## Goal
Today a corrupt save plus CONTINUE gives a fresh run, and the first autosave
replaces the bad save (the backup slot rotates it out one write later). Nothing
tells the player. Now the bad text is copied under its own storage key first,
and the log says so.

## Acceptance
- A save that won't parse: CONTINUE starts a fresh run, the raw text is copied
  to `violencetown.save.unreadable`, and one placeholder [TEXT] log line shows.
- A save that parses but fails in loadInto: same copy, and the existing
  "[That save would not open. Starting a new run.]" line stays.
- writeSave and clearSave never touch the kept key; a test plays several
  autosaves and reads the copy back unchanged.
- A good save continues as before and keeps no copy.
- The continueGame comment no longer says the save is "left on disk".
- npm test, balance:check, naming grep, autoplay:check pass.

## Rulings
None. Loop-approved under the standing delegation. The key name is internal.

## Out of scope
A way for the player to recover, export or delete the kept copy; final wording
of the new log line; keeping more than one copy (a later bad save replaces it).
