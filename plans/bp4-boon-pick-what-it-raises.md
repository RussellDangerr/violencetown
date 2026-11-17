# BP4: drinking a boon lets you pick what it raises

## Goal
There is one boon poition. Drinking it opens a short list of what it can raise, and the pick is
applied for good. Backing out of the list keeps the poition and costs no turn.

## What it rests on
- BPR1 (b): a boon raises max MP, armour or strength. It never raises max HP, so Law 0 in
  `plans/balancing-bible.md` is untouched.
- BPR2 (a): one boon item, the kind is asked at drinking time.
- BPR3 (b): the amounts are tuning. This slice leaves the existing placeholder amount of +1 on
  every kind, because BP1's and BP2's tests pin +1 and BP2's thrown flip reads the same amount.
  The picked amounts (+10 MP, +1 armour, +1 strength) are a follow-up that also moves those tests.
- BPR4 (a): the cap of 12 is BP5's job, not this slice.

## Acceptance
- The boon record holds each kind (`mana`, `defence`, `strength`), and each is read where its
  number is computed: armour in `_playerArmor`, strength in the attack's flats, max MP on the bar.
- Drinking a boon opens a chooser with one plain row per kind. Picking one applies it; Escape or a
  tap outside keeps the poition and passes no turn.
- GEAR's ARMOR number (and the MP bar) shows the rise right after drinking.
- A save with only the mana boon loads unchanged; every kind survives save and load.
- A thrown boon still lowers an enemy's max MP exactly as before.

## Out of scope
- The 12 cap and the n / 12 line (BP5), where boons come from (BP3), the picked amounts.
- Any change to enemy numbers; the balance golden stays as is.
