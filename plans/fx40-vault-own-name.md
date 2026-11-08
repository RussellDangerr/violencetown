# The vault gets its own zone name

## Goal

The vault behind the First Blood Bank's back door borrows the bank's `zoneName`, so stepping in
and stepping out both log the bank's name and the dock header never changes. Give the vault a
`zoneName` of its own. Until Caelan names it, that name is the placeholder `[TEXT]`.

## Acceptance

- Walking into the vault logs `[Entered [TEXT]]` and the dock header reads `[TEXT]`.
- Walking back out logs `[Entered FIRST BLOOD BANK]` and the header reads the bank's name again.
- A new test, `tests/vault-zone-name.test.js`, pins that the vault and the bank carry different
  zone names and that the vault's is the placeholder.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

- **FX40R1, option a** (picked by the loop under Caelan's standing delegation): widen the slice to
  `tests/finale-gate.test.js` and `game/world-map.js`. The finale-gate test "it is part of the
  bank" becomes "the vault has its own name", in a commit of its own that says the behaviour
  changed. `INTERIOR_PARENT` maps the vault's placeholder name to DOWNTOWN, so the world map's
  "you are here" still lands Downtown while the player is in the vault.

The name itself is Caelan's to give; this slice only makes room for it.

## What else reads `zoneName`

- `game/main.js`: the `[Entered …]` log line, the zone label, the music pick (SEWER only).
- `game/renderer.js`: the dock header (upper-cased) and the world map's "you are here".
- `game/world-map.js`: `INTERIOR_PARENT` maps an interior's name to the overworld screen it sits
  in. The bank is listed there (DOWNTOWN); a new vault name is not.
- `game/content-validate.js`: warns when a map's `zoneName` is neither a world zone nor a known
  interior.
- `tests/finale-gate.test.js`: "it is part of the bank" asserts the vault's name equals the
  bank's.
- The balance harness does not read `zoneName`.

## Status

Unblocked by FX40R1. Touches: `game/vault-map.json`, `game/world-map.js`,
`tests/finale-gate.test.js`, and the new `tests/vault-zone-name.test.js`.

## Out of scope

- The vault's real name (Caelan's call).
- Anything else about the vault: its contents, the finale beats, its art.
