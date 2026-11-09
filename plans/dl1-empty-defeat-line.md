# DL1 - a defeat that took nothing doesn't say your things are gone

Goal: when a defeat scenario's take matched nothing (no items, no GP), its loss line
(Fungus "provisions are gone", rats "rolled you", sludge "kit is soaked") gives way to the
existing generic line "[You come to, beaten and dumped.]", then "[Nothing was taken.]".

Acceptance:
- Fungus, rats and sludge defeats on a bag with nothing takeable show the generic line
  and then "[Nothing was taken.]".
- When something was taken, the scenario's own line shows as before.
- A test runs each scenario on an empty and a full bag.
- Wake place, HP and time skip unchanged. npm test, balance:check, naming grep, autoplay pass.

Rulings: none. No new copy: the generic line already exists in the game.

Out of scope: new per-scenario empty-bag lines; Carrion's line (it claims no loss);
the em1 branch's changes.
