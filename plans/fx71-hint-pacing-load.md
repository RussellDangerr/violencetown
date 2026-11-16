# FX71: loading a save gives the hints fresh pacing

Goal: hints wait 8 turns between showings, counted from the last one shown. Loading a save
sets the turn counter to the saved value but left the old run's last-hint turn, so after
loading an earlier save the hints could stay quiet for a long time. RESTART already clears it;
loadInto now does too (this covers continue, the pasted-code path and its rollback).

Acceptance:
- After loadInto, the last-hint turn is cleared (null), even when it was set before.
- A save at a lower turn than the old last-hint turn no longer suppresses hints.

Rests on: no rulings. Out of scope: main.js, hint cooldown length, the seen-hints record
(it belongs to the player and stays).
