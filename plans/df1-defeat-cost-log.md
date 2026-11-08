# DF1: dying leaves no dead debuff, and the log says what it cost

## Goal

Losing a fight used to hang a red six-turn chip on you (Rattled, Hunched or Sludged). Nothing
in the game ever read those chips: they did nothing but sit on the HUD. Under ruling DFR1
(Caelan picked "drop them; the defeat's log line says what it actually cost you"), defeats stop
adding them, and the defeat instead writes one plain line saying exactly what was taken.

## What changes

- `game/defeat-scenarios.js`: the scenarios lose their `status` field. The generic
  "beaten and dumped" line drops its vague "Some of your things are gone." sentence, since the
  cost line now says it exactly.
- `game/main.js`:
  - `_runScenario` no longer adds a status buff. `_applyTake` reports what it took, and the
    scenario logs a mechanical cost line after its own line.
  - `_runBossRetry` no longer adds Rattled.
- `game/buffs.js`: the three unused entries (`rattled`, `hunched`, `sludged`) are deleted. A
  save that still carries one of them is harmless: the buff ticks down like any buff with no
  definition and drops off.

The cost line is plain and mechanical:
- something taken: `[Taken: <item> x<n>, <item>. GP taken: <n>.]`
- nothing taken: `[Nothing was taken.]`

## Acceptance

1. No defeat or boss retry adds Rattled, Hunched or Sludged.
2. After an ordinary defeat the log names every item taken and the gold lost.
3. A defeat that took nothing says so.
4. The test runs a real defeat (main.js's own `_die`, `_resolveDefeat`, `_runScenario`,
   `_applyTake`, lifted from the source), not the take function alone.
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Tests

- New: `tests/defeat-cost-log.test.js`.
- Changed: `tests/act2-boss-retry.test.js` asserted the boss retry adds Rattled. Under DFR1 it
  now asserts it does not, in its own commit saying the behaviour changed.

## Out of scope

- Any new effect for a defeat (the ruling dropped the debuffs rather than giving them one).
- The flavour lines of the other scenarios: they stay as written, even where one names a loss
  the take may not have made ("Your provisions are gone" when you carried no food).
- Gold in the recoverable rat stash.
- Final wording of the cost line: it is a plain mechanical line for Caelan to rewrite.
