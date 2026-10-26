# FX31 — the grapple tests stop printing localStorage stack traces

## Goal

`npm test` prints two `[settings] persist failed (not saved) ReferenceError: localStorage is not
defined` lines, each with a full stack. Both come from `tests/grapple.test.js`: the swing-arc tests
call `Settings.set('reduceMotion', …)`, and `game/settings.js` tries to persist to
`localStorage`, which node does not have. The failure is caught and logged, so the tests pass, but
the noise hides real warnings in the run.

The fix is test setup only: the swing-arc `describe` puts a do-nothing `localStorage` on
`globalThis` before its tests, the way the other Settings-touching tests do, and puts back
whatever was there before once they finish.

## Acceptance checks

- `npm test` output contains no `persist failed` line.
- The grapple tests' assertions are untouched and still pass.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

None. It is tests only; nothing a player sees changes.

## Testing

No new test: the change only quiets an existing one. The evidence is a before/after grep of the
`npm test` output for `persist failed`.

## Out of scope

- `game/settings.js` keeps logging persist failures; that log is useful in a browser.
- Other test files.
