# FX24 — save right after the moments a player would miss

## The problem

`autosave()` in `game/main.js` writes at most once every five turns, and only from the end of a
world turn and from a zone change. Nothing saves when the tab closes. So a reload can lose the gear
you just put on, the thing you just picked up, the trade you just made or the drink you just had:
CONTINUE brings back the bag from a few turns ago.

## Goal

The save is written straight away after:

- equipping gear (from the bag, the hotbar, the bar, the wheel, the GEAR tab, or a pickup that goes
  straight onto your body);
- picking something up (walking over it, taking it from a nearby tile, taking it out of a spot you
  examine);
- finishing a trade (the offer screen's commit, which is also how a chest is emptied);
- eating or drinking (any use of a bag item, the device's USE and DRINK).

It is also written when the page is hidden or closed (`visibilitychange` to hidden, and
`pagehide`).

## Rules kept from today

- Never written on the title or while dead: every new save goes through `autosave()`, which already
  refuses both.
- Not written while a map is loading: a zone change already saves itself once the new map is in.
- A brand-new run that has done nothing yet (turn 0, never saved) does not save on leaving, so
  GAME START pressed by mistake and a reload still leaves the old save to CONTINUE, as the title's
  own comment promises.
- No new cue on screen. The five-turn timer for ordinary turns stays as it is.

## Acceptance checks

- After an equip, a pickup, a finished trade, or eating or drinking, a reload through CONTINUE
  shows that change. Tested in `tests/autosave-moments.test.js` by driving the real flows lifted out
  of `main.js`, then reloading through the real title code path (Space with a save) into a fresh
  game, using the real `game/save.js`.
- Hiding or closing the tab saves; the same events on the title or while dead do not.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass. The autoplay
  fingerprint hashes the live game, not storage, so it should not move; if it does, stop and ask.

## Rulings and picks

None. This is the loop's call under the standing delegation: nothing the player sees changes.

## Out of scope

- Other bag changes: dropping, protecting, theft lifts, quest gifts, ring sockets. Closing the tab
  still saves those.
- Any change to what a save holds, or to the five-turn timer.
