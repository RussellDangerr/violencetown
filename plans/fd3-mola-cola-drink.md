# FD3: Mola Cola exists, an item you can carry and drink

## Goal

Add a can of Mola Cola (id `mola_cola`). Your boss hands over the burger bag and one can when
the taxi runs and you set out across the bridge, so the delivery no longer starts with a stop at
the diner. The can is carried and can be examined, dropped or drunk (it heals). Vendors refuse to
buy it until the burger delivery is done.

## Acceptance

- Stepping onto the opened bridge for the first crossing gives the player the burger bag and the
  can, once, from the boss. The delivery quest then starts past its pick-up step (the old
  pick-up stage stays in the data and settles itself, because the bag already holds the burger).
- The can has a name, a placeholder description, a tinted placeholder icon and a stand-in heal
  copied from the cheapest healing food (the hot dog).
- Drinking it heals and uses it up.
- A vendor offer that stages the can is refused with a placeholder line until `deliver_burger`
  is complete; dropping and drinking are not blocked.
- A save with the can in the bag reloads with it.
- `tests/mola-cola.test.js` walks the crossing with real arrow keys and checks all of the above.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on (picks)

- FD3R1 (a): every delivery comes with a can, handed over with the burger, special until the
  delivery is done.
- FD3R2 (a): the boss hands over both, and the Downtown stop goes.
- FD3R3 (a): vendors will not buy it until the delivery is done; drop and drink stay allowed.
- FD3R4 (a): once the taxi runs, before you cross.
- TX2: the taxi at the bridge (merged).

## Decisions made here

- The hand-over is a method on the game called from the start of the bridge cutscene, so every
  first crossing, by either fuel, carries it. It is guarded by a quest flag so it happens once.
- The refusal is a data flag on the item (`saleLockedUntil: 'deliver_burger'`) read by a helper
  in `trade.js`, checked where the offer screen stages gifts.
- The diner cook keeps a fallback pick-up line for a save that is already at the old step.

## Out of scope

All wording (placeholder `[TEXT]`), the real icon, the real heal number, the bears and the
polar area, and the stage text rewrite. Existing tests that pin the three-stage quest shape are
left as they are.
