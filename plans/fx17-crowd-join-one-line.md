# fx17: a crowd joining a fight writes one log line

## Goal
When hostiles join a fight, the combat log gets one join line for that beat, however many
joined. Today `_joinFight` in `game/main.js` logs a line per joiner, so a rat wave fills the log.

## Acceptance
- Several hostiles joining in one beat add exactly one join line to the combat log.
- One joiner still adds one line, and nobody joining adds none.
- A new test, `tests/join-log.test.js`, pins both.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass. The log is not in the
  autoplay golden; if the score drifts, stop and ask.

## Rulings
None. The line's words stay as they are today (the `[TEXT]` placeholder); no new copy is written.
A combined line for a crowd would be new copy, so the one line is the same text.

## Out of scope
- Any wording for the join line, or a count in it.
- Changing who joins or when (`fight-area.js`).
