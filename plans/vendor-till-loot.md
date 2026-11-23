# Vendor till loot — killing a vendor pays out the whole till

Status: **ruled 2026-11-22 — option A** (Caelan: "A: separate till"). Built on this branch.

## The bug

A vendor's `gold` defaults to `VENDOR_WALLET = 9999` (`game/enemies.js`). That number is the till:
the source `transferGold` draws on when you SELL, so selling conserves gold. But `gold` is also the
field Law 6 reads as the wallet a combatant carries, and `_handleEnemyDeath` (`game/main.js`) loots
`enemyObj.gold` whole: "the wallet IS the loot". So any vendor's death pays the player 9999 GP, or
14999 with a delivery cap worn (MS3 raises a looted purse by half).

It is reachable in ordinary play. In the sewer, a Fireball's 3×3 blast catches Carrion in the south
corridor whenever a rat stands next to her, and the log reads "Looted 9999 GP." The 50-seed sim hit
it in 5 of 50 fighter seeds on `feature/pathing-round-corners`, where rats now follow you into her
corridor. The bug is already on `dev`; that branch only made the autoplay fighter walk into it.

The vendors who never fight carry the 9999 till on their person: Carrion (sewer), Corner Merchant
and Newsstand Kid (downtown), Macc and Hooch (town), and the Night seller.

The same shared field is wrong the other way for the two vendors who fight. `spawnEnemy` gives any
fighter (damage > 0) with no authored kit the role-default kit, which overwrites the till: Pike's
`gold` is 30 and Puck's is 3. So killing Pike pays 30 GP, as Law 6 intends, but selling either of
them anything worth more than that should hit "THEIR TILL IS N GP SHORT" (read from `offer.js`, not
played).

Not verified: a struck vendor turns hostile (`_onEntityHarmed`) and keeps its 9999, and a hostile
enemy at 40 HP or less buys heals from its gold (`healPurchase`). The non-fighting vendors all have
armour -80, so a blow likely kills them before they reach 40 HP; I have not seen one heal.

Repro: `tests/vendor-till-loot.test.js` runs the real `_handleEnemyDeath` on the real sewer map and
kills Carrion (9999 GP, 14999 with a delivery cap), and pins every vendor's spawn gold, Pike's and
Puck's small tills included. It passes now; the fix has to flip it on purpose.

## Options (Law 6 is a ruled law; each option says what it changes)

**A. The till is not on the person.** Split the field: `till` is the shop's money, read by SELL
(`offer.js` "THEIR TILL IS N GP SHORT", `main.js` `npcGold`) and paid into by BUY; `gold` is the
vendor's own pocket purse (a few GP, like `townsfolkPurse`). Law 6 stays exactly as written, because
the till was never a combatant's wallet. Conservation holds: `transferGold` already treats any object
with a numeric `gold` as a holder, so the till becomes a holder of its own (the stall), and a dead
vendor's till simply stays with the stall, out of reach. It also fixes Pike and Puck: their fighter
kit becomes the pocket and their till is set apart, so they can buy from you again. A struck vendor
could only spend its pocket on heals, and Thieve would lift from the pocket instead of the till
(today `coinTake` reads the till, bounded by `stealLimit`). Touches save/load (`toJSON` round-trips
the till), the offer screen, MC1's special-buyer top-up, and `tests/townsfolk-purse.test.js`, which
pins Macc at 9999. Medium-sized; the cleanest model.

**B. A vendor's death drops only a pocket purse.** Keep `gold` as the till; in `_handleEnemyDeath`,
a vendor (or ex-vendor) loots a small purse and the rest leaves the world through `burnGold` as a
declared sink ("the till closes"). This amends Law 6 for vendors: "the wallet is the loot, except a
shop's till". One function changes. It leaves Pike's and Puck's 30 and 3 GP tills as they are, and a
struck vendor still holds 9999 to spend while alive.

**C. Friendly vendors take no blast damage.** `_aoeStrike` skips a non-hostile vendor. Stops the
accidental sewer case and the sim's 5 seeds, but not a deliberate kill: hit Carrion or a downtown
merchant with a sword and the 9999 still pays out. No change to Law 6. Could sit on top of A or
B if he wants blasts to spare shopkeepers anyway; on its own it hides the exploit, not closes it.

**My lean: A.** It is the only option that keeps Law 6 unamended and fixes the field in both
directions: no vendor carries a till on its person, and the fighting vendors get a till to buy with. B is the cheap stop-gap if he wants
the sim clean this week; C alone leaves the exploit open.

## Ruling and what was built (VTR1, 2026-11-22: option A)

- `Enemy` has a `till` apart from `gold`. A vendor's till defaults to `VENDOR_WALLET` (9999); its
  `gold` is the purse it carries and defaults to 0. Both save and load (`toSave`).
- `spawnEnemy`: a vendor who never fights and has no authored gold carries a townsperson's purse
  (`townsfolkPurse`, 2 to 6 GP). A vendor who fights keeps its role kit as its purse (Pike 30, Puck 3),
  and now has the full till as well. A mugged vendor comes back with an empty purse; the till is untouched.
- `tradeHolder(npc)` (`trade.js`): a vendor's side of a trade is a holder over its till; anyone else's
  is the NPC itself. `_commitOffer`, the till check in `_offerBlocker` and MC1's special-buyer top-up
  go through it, so trades still conserve through `transferGold`.
- Law 6 is unchanged: `_handleEnemyDeath` still loots `gold` whole. It just no longer holds the till.
- Old saves: a vendor saved before the split (no `till` key) loads with the full till and an empty
  purse; so does a struck vendor still holding 9,999 or more.
- `tests/vendor-till-loot.test.js` asserts all of the above. Vendor fixtures in the offer tests
  that used `gold` as the till now use `till`.

## Results (on dev d908d1e, with pathing round corners merged in)

- `npm test`: 6030 pass, 0 fail.
- `npm run sim:check` before re-recording: one line moved, the intended one.
  `quest escape_sewer.gold` 997.94 -> 0.32. Seeds 26, 32, 41, 44 and 47 looted Carrion's till
  (9999, or 9905 after a sale); each now loots her 4 GP purse. Sneak and loops moved nothing.
  No other number on any seed changed.
- The autoplay golden moved by fingerprint only: the fingerprint hashes the save, and every enemy's
  save now carries `till`. Every stage number is unchanged.
- Re-recorded in one commit: `autoplay:write`, `sim:write`, `spirits:harvest` (ruling VTR1).
