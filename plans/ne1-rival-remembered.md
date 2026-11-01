# NE1 — the enemy that beat you is remembered and carries what it took

## Goal

Today a defeat by an ordinary enemy takes some of your things and they are simply gone. After
this slice the enemy that did it is remembered. The next time you walk into that zone it is at
its post again, carrying the things it took, and the right-hand fight panel lists them by name.
Kill it and the kill loot hands them back to you; Thieve can lift them out of its kit.

## How it works

- **The record.** `game._rivals` is `{ mapUrl: { id, items } }`, one rival per zone, kept like the
  respawn list and saved with it. `items` is a list of item ids (a stack of three is three ids).
  The pure helpers live in `game/rivals.js`.
- **Making one.** In `_runScenario`, after `_applyTake` has taken items for good (a recoverable
  robbery that goes to a stash does not count), the enemy that beat you becomes the zone's
  rival if it is an ordinary map-placed enemy. The test is the one `_rememberKill` uses: its id is
  on the map's enemy spawns. Bosses, summons, allies, the sewer escape's rats and hazard defeats
  (sludge, falls, which have no enemy) never make one, and their defeats play out as before.
- **One per zone.** The first rival holds the post. A beating by any other enemy in that zone
  makes no second record. If the rival beats you again, the new items are added to its record, and
  to its live kit when it is already carrying.
- **Coming back (NE1R1 a).** The record is applied the next time the zone loads: `spawnEnemy`
  gets the kit as a fourth argument and adds it to the enemy's loadout after the mugged-id clear
  and the theft subtraction, so a looted enemy that later beats you still carries your things.
  The record then reads as "carrying".
- **In its kit, not on its back (NE1R2 a).** The things sit in the enemy's `loadout`, the same
  list the fight panel, Thieve, and the kill drop already read. Nothing is worn.
- **Leaving.** On a zone change the record is settled against what the rival really has left: an
  item it used up or that Thieve lifted drops off the record, so leaving and returning never hands
  you a second copy. A record with nothing left is removed.
- **Killing it.** `_handleEnemyDeath` clears the record. The kit drops to you through the normal
  kill loot, and the enemy is marked looted, so it returns later as a plain enemy through the
  respawn list. If you kill it before it was carrying (you beat it in the same visit), the items it
  was owed drop with its kit instead of vanishing.
- **The save.** A `rivals` field in `world`, left out while empty so a run with no defeat saves
  byte for byte as before. An older save loads with no rival. `loadInto` restores the record after
  the zone loads, so the saved enemies, not a fresh spawn, decide who is carrying. Restart clears it.

## Rulings and picks this rests on

- NE1R1 (a): the enemy becomes a rival the next time you enter that zone.
- NE1R2 (a): it carries your things in its kit; it does not wear them.
- The "first holds the post" rule is the loop's pick (see the card note).

## Acceptance checks

1. Beaten by an ordinary map-placed enemy that has taken something, leave the zone and come back:
   that enemy is at its post carrying the taken items, and the fight panel lists them by name.
2. Killing it drops the items through the normal kill loot, Thieve can lift them back, and
   afterwards the record is gone and the enemy returns later as a plain one.
3. Bosses, summons, the sewer gauntlet's rats and hazard defeats never make a rival.
4. A second enemy beating you in a zone that has a rival makes no other; if the rival beats you
   again its kit grows.
5. The record survives a save and load; an older save loads with no rival; Restart clears it.
6. A run with no defeat saves byte for byte as before (autoplay fingerprint unmoved).
7. The test goes through the real defeat path (`_die`, `_resolveDefeat`, `_runScenario`) and a real
   zone change with the real `_zoneChange` and `_loadMap`.
8. Evidence: a 3440x1440 frame of the fight panel on a rival carrying the taken items.

## Out of scope

- A title for the rival (NE2), "fled from" (no flee state exists), any reward for the win beyond
  getting your things back.
- No line of copy is added. The defeat scenarios' own lines are untouched, even where they no
  longer hold (the Fungus line says your provisions are gone).
- A rival that chases you through a door and is killed in another zone keeps its record on the
  zone it came from.
