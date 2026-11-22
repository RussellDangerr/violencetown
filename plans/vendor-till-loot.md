# Vendor till loot — killing a vendor pays out the whole till

Status: **awaiting Caelan's ruling.** Repro test only; no fix on this branch until he picks.

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

Every vendor on the maps carries the default till: Carrion (sewer), Pike (canyon), Puck (factory),
Corner Merchant and Newsstand Kid (downtown), Macc and Hooch (town), and the Night seller.

Related, same cause: a vendor you strike turns hostile (`_onEntityHarmed`) and keeps its 9999. A
hostile enemy at 40 HP or less buys heals at the peg from that gold (`healPurchase`, `npc.js`), so a
hostile vendor that is not killed outright can buy a heal of 60 HP or more about a hundred times.
Pike is the case that matters: killing him is an authored route to the grappling hook, he has armour
5 and 9 damage, and his till pays for the heals.

Repro: `tests/vendor-till-loot.test.js` runs the real `_handleEnemyDeath` on the real sewer map and
kills Carrion. It pins today's behaviour (passes now) so the fix has to flip it on purpose.

## Options (Law 6 is a ruled law; each option says what it changes)

**A. The till is not on the person.** Split the field: `till` is the shop's money, read by SELL
(`offer.js` "THEIR TILL IS N GP SHORT", `main.js` `npcGold`) and paid into by BUY; `gold` is the
vendor's own pocket purse (a few GP, like `townsfolkPurse`). Law 6 stays exactly as written, because
the till was never a combatant's wallet. Conservation holds: `transferGold` already treats any object
with a numeric `gold` as a holder, so the till becomes a holder of its own (the stall), and a dead
vendor's till simply stays with the stall, out of reach. Fixes the heal-from-till case too, since
`healPurchase` reads `gold`, and Thieve on a vendor would lift from the pocket instead of the till
(today `coinTake` reads the till, bounded by `stealLimit`). Touches save/load (`toJSON` round-trips
the till), the offer screen, MC1's special-buyer top-up, and `tests/townsfolk-purse.test.js`, which
pins Macc at 9999. Medium-sized; the cleanest model.

**B. A vendor's death drops only a pocket purse.** Keep `gold` as the till; in `_handleEnemyDeath`,
a vendor (or ex-vendor) loots a small purse and the rest leaves the world through `burnGold` as a
declared sink ("the till closes"). This amends Law 6 for vendors: "the wallet is the loot, except a
shop's till". One function changes. It does not fix the heal-from-till case: a struck vendor still
heals from 9999, so Pike would need a separate cap.

**C. Friendly vendors take no blast damage.** `_aoeStrike` skips a non-hostile vendor. Stops the
accidental sewer case and the sim's 5 seeds, but not a deliberate kill: hit Carrion with a sword, or
kill Pike by his own route, and the 9999 still pays out. No change to Law 6. Could sit on top of A or
B if he wants blasts to spare shopkeepers anyway; on its own it hides the exploit, not closes it.

**My lean: A.** It is the only option that keeps Law 6 unamended and closes both halves (the loot and
the heals) for every vendor, including Pike's authored kill route. B is the cheap stop-gap if he wants
the sim clean this week; C alone leaves the exploit open.

## After the ruling

Whatever is picked moves the sim's gold numbers on the seeds that kill Carrion, so the fix commit
re-records with `npm run sim:write` and `npm run spirits:harvest` and cites his ruling, and the
repro test flips to assert the new loot.
