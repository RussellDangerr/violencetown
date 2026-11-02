# FIN2 — Phase 1: the Financier fight in his vault

**Parent:** `plans/spine.md` §1 (Act 3, the finale), `plans/cosmology-and-arc.md` ("The Final Arc",
phase 1), `plans/fin1-vault-door.md` (the vault room and its door).

## Goal

Today the vault is an empty room behind a working gate. After this slice it holds the Financier,
and the fight with him is real: walk in, talk to him, and the fight starts with Sun Man at your
side. Sun Man hits hard for three turns, then leaves, and when he goes the Financier is weakened
for the rest of the fight. Beat the Financier and phase 1 is over, cleanly, with a flag and an
event the next slices read. Every word the player reads is `[TEXT]` until Caelan writes it.

## The shape

- **`game/slots.js`** — two registry entries, placed by hand (`{ id, entry, x, y }`), not slot
  picks: the Financier is a Locked character, so he is a fixed spawn, not a pool entry.
  - `financier`: a copy of the Act 2 stand-in boss block (`placeholderBoss()`), the look of the
    bank's banker, tag `financier_boss` (a `_boss` tag, so losing to him runs the boss retry),
    a `dialogueId` of his own, and a calm `IDLE` stance until you talk to him.
  - `FINALE_PHASE1`: the encounter's numbers in one place: the turns Sun Man stays (3, Caelan's
    note), the defence the Financier loses when he goes, and Sun Man's own block (the canon name,
    a look borrowed from an existing person, and the damage placeholder). Sun Man is summoned by
    the fight and placed on no map, so he is not a registry entry.
- **`game/vault-map.json`** — one spawn: the Financier, three tiles in front of the door you
  come in by.
- **`game/dialogue.js`** — the Financier's talk (`[TEXT]`) with one choice that starts the fight,
  and a one-line `[TEXT]` stub for Sun Man so the fight panel and log can name him.
- **`game/buffs.js`** — `weakened`: a rider buff (stat `defence`, negative amount) read by the
  same `sumBuffStat` that already soaks an enemy's blows, so no combat code changes. Lasts the
  rest of the fight (a very long count; the fight's end clears it, see below).
- **`game/main.js`**
  - `_spawnSummon` takes a few optional extras (a look, a name, a tag, an arrival line, "already
    in the fight"). The hired lion passes none and behaves exactly as before. This is how Sun
    Man joins: the same ally pipeline (`_allyTakeTurn`) and the same summon timer the lion uses.
  - `_beginFinalFight(npc)`: turns the Financier hostile and brings Sun Man in for three turns.
    Called from his dialogue choice, and from `_onEntityHarmed` so that hitting him first starts
    the same fight rather than a Sun Man-less one.
  - When the summon timer ends, a `sun_man` leaves with a `[TEXT]` line, the Financier gets
    `weakened`, and a `sun_man_leaves` event fires.
  - `_handleEnemyDeath`: when the Financier falls, phase 1 is won. The quest flag
    `finalePhase1` is set to `won` (saved with the quest state), and a `finale_phase1_won` event
    fires once.
  - `_runBossRetry`: if the boss that beat you is the Financier, he is rebuilt from his spawn
    (full health, no `weakened`, calm again) and Sun Man is removed, so talking to him starts the
    whole fight again.

## The hook phases 2 and the credits use

Phase 1 ends when the Financier is beaten. The hook is `questEngine.state.flags.finalePhase1 ===
'won'` plus the one-shot game event `finale_phase1_won`. The moment Sun Man leaves is a second,
earlier hook: the event `sun_man_leaves` (this is where the Bite can go). Neither FIN3 nor FIN4
needs a change in this slice's files to read them.

## Does winning soft-lock the save?

No. The Financier dies in the vault; the vault's door back to the bank is untouched; nothing is
removed from the bag; the flag is saved. The Financier is an ordinary map spawn, so he comes back
after seven zone changes (KS1). Talking to him again runs the fight again; the flag and the event
only fire the first time. FIN3 may decide he should not return.

## What happens to the bank's Financier

`game/bank-map.json` is not in this slice's reach, and nothing about it changes. The placeholder
Financier (`bank-financier`, damage 0, `banker` dialogue) still stands in the bank's main hall.
Two Financiers is a content question for Caelan (is the bank one the "meet him" beat, SP8, and
the vault one the fight?), so it is flagged, not decided.

## Placeholders (all listed for Caelan)

- The Financier's numbers are the stand-in boss block, unchanged: 100 HP, damage 12, armour 6 as
  authored (his kit dresses him in the cardboard cuirass, so he stands up with 4, as the Were-Rat
  does).
- Sun Man's damage (30) and the defence the Financier loses (8) are stand-ins. 8 is not a round
  guess: measured with the real fight, a drop of 4 (all the armour he stands up with) loses to his
  own healing when you carry only the starting sword and wear nothing; 8 wins. Caelan retunes
  either.
- Sun Man's look is a borrowed townsperson. Every line is `[TEXT]`.

## How winnable it is

The test plays the real fight (the game's own turn, enemy AI and boss healing) with the arrow
keys, for every weapon in the game at 0, 5 and 10 armour (the most the pieces add to is 10), ten
seeds each. No bandages, poitions or backstabs: only swords and armour, so a player who uses
anything else does better than the table. Every cell wins.

## Acceptance

1. Entering the vault and talking to the Financier starts the fight.
2. Sun Man fights beside you for three turns, hitting hard, and leaves the Financier weakened.
3. His damage is a placeholder number, listed for Caelan.
4. A GIF at 3440x1440 of phase 1, checked at full size.
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass; a test drives the
   fight with real keys; the fight is shown winnable with the weakest gear the game has.
   The balance golden gains the vault Financier's row: the slice stops and reports that drift
   rather than writing it.

## Rulings it rests on

- **FINR3 (a)** Sun Man fights beside you as an ally from the start of the fight.
- **FINR7 (b)** Sun Man leaves the Financier weakened: his defence drops for the rest of the fight.
- Caelan's note: Sun Man stays three turns and does a lot of damage.

## Out of scope

- The Bite, Sun Man's coaching, phase 2 and the credits (FIN3, FIN4).
- Real lines, names, numbers or art; Sun Man's own picture.
- The bank's placeholder Financier and `bank-map.json`.
- Taking the three items from the bag.
- Changing the vault's size or look.
