# Items

All items in Violencetown. Items are picked up from the ground, bought from merchants, or bought off enemies mid-combat.

## Ambro (Food — Healing)

Violencian slang for food. Ambro heals HP. Some rare ambro permanently boosts stats.

| Item | Heal | Zone | Description |
|---|---|---|---|
| [[Boardwalk Burger]] | 15 HP | [[Zones/Street\|Street]] | Jersey's house special. Grease-soaked, overcooked, perfect. |
| [[Hot Dog]] | 12 HP | [[Zones/Street\|Street]] | Been on the roller since this morning. Maybe yesterday. |
| [[Mystery Meat]] | 20 HP | [[Zones/Sewer\|Sewer]] | Don't ask what it was. Heals more than it should. |
| [[Tunnel Mushroom]] | 10 HP | [[Zones/Sewer\|Sewer]] | Grows where the sludge doesn't reach. Tastes like dirt and hope. |

## Weapons

| Item | Damage | Type | Description |
|---|---|---|---|
| [[Wooden Sword]] | 10 | Melee | Starting weapon. |
| [[Pipe]] | 12 | Melee | Rusty copper pipe, wrenched free from the wall. |

## Throwables

| Item | Damage | Range | Description |
|---|---|---|---|
| [[Rock]] | 15 | 4 tiles | A heavy chunk of sewer masonry. Better thrown than held. |

## Consumables

| Item | Effect | Description |
|---|---|---|
| [[Soap]] | Cure sludge | Industrial-grade lye bar. The Sewer's most valuable commodity. |
| [[Bandage]] | Heal 25 HP | Torn fabric strip, reasonably clean. |

## Key Items (Designed, Not Yet Implemented)

| Item | Role |
|---|---|
| **Moonblock** | Fake sunblock. Sold over the counter. Does nothing for sun damage. Wererats are allergic. |
| **Sunblock (real)** | Contraband. Hoarded by vampires. Lets you walk freely on [[Zones/Street\|Street]] without sun damage. |
| **Gold Card** | In-universe credit card. All gold transfers route through Bank Street. The Financier's cut is automatic. |

## Economy

- `baseValue` — Each item has a universal reference price in gold.
- Merchant sell prices are authored per-merchant, reflecting zone scarcity.
- Subjective pricing: [[NPCs/Carrion|Carrion]] pays 2× for water because she's desperate. A Street vendor charges nothing for soap because it's common.
- Mid-combat buying: spend gold to purchase equipment directly off enemies during the [[Combat]] inspect phase.
