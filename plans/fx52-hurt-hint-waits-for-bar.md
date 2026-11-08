# FX52 - the "you are hurt" hint waits for the bottom bar

## Goal
The wounded hint points at "the bar along the bottom". That bar is only drawn when the
player carries something usable (renderer `_drawXmbBar` returns early when
`buildXmbBar(inventory).columns` is empty). So a hurt player with nothing usable is told about
a bar that is not on screen. The hint now also waits until the bar has something in it, using
the same check the bar's own drawing uses: `buildXmbBar` from `game/xmb.js`.

Wording is unchanged. No new copy.

## Acceptance
- Below half health with nothing usable, the hint does not show.
- Below half health with something usable, it shows, and it still shows only once.
- Picking something usable up while hurt brings the hint then.
- Evidence: 3440x1440 frames of both cases.
- npm test, balance:check, naming grep and autoplay:check pass.

## How
`game/hints.js` imports `buildXmbBar` from `game/xmb.js` (a pure module with no imports, so no
cycle and no renderer) and adds `buildXmbBar(game.inventory).columns.length > 0` to the
wounded row's `when`. The "only once" and "the moment you pick something up" behaviour
come for free: `_maybeShowHint` runs each settled step and remembers shown ids, so a hint that
was false stays unremembered until it becomes true.

Because `nextHint` turns a throwing `when` into silence, the new tests include a case where
the wounded hint really fires.

## Rulings it rests on
- FX52R1, option a: `tests/hints.test.js` may change. The old "being badly hurt points at the
  hotbar" fixture had an empty bag; it gets a usable drink so it still proves the hint fires
  when hurt. Done in its own commit.

## Out of scope
- Any wording change, any other hint, any change to the bar itself.
