# BS2: the Ruffian keeps your gold

Goal: the Ruffian who mugs you still carries exactly what he took after you leave the zone and come back, and after a save and load, and he does not mug you a second time.

Rests on: BS1 (he steals your gold and runs) and BR4 pick (a): he keeps it until you catch him, across zone changes. Cost: one saved field.

How: a record `enemyId -> gold taken` (like the robbed-NPC record) is captured from the live enemies before a zone change and at save time, saved in the world block, and given back by `spawnEnemy` (gold added, took-gold mark set). The enemy's own save also carries the took-gold mark so a reload mid-zone does not let him mug again. A dead enemy drops out of the record.

Acceptance: see the card: gold kept across zone change and save/load; no second mugging after reload; npm test, balance:check, naming grep, autoplay:check pass.

Out of scope: npc.js (mugging logic), copy, tuning.
