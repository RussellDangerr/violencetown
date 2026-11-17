# ND1: examining a character says plainly who they are

Goal: examining a character gives a plain line (name, role, stance) in the log, and the inspect
panel adds a sheet: HP, armour, damage, weapon, what they sell, what they drop.

Rulings: NDR1 pick a (log line = name, role, stance; panel adds the numbers). NDR3 pick a (a
character with examine text of its own says it first, then the sheet).

Rules of the build:
- One function in `game/examine.js` builds it from the spawn row's fields alone; no per-character table.
- Role: boss, vendor (has stock), talker (has a dialogueId), wanderer or guard (from behavior),
  else creature. Stance: hostile, neutral, ally. The stance words "Looks like trouble." and
  "Minding their own business." stay.
- A character with no usable name goes by its role, read off its dialogue id ("taxi_driver" reads
  "Taxi driver"), else its type.
- Role and stance words are plain placeholders for the owner to review.

Acceptance: a test covers a boss, a vendor, a talker, a hostile creature and an ambient townie, and
a bare row built with no new code; npm test, balance, naming, autoplay pass.

Out of scope: NDR2 / ND2, any change to the Target List, per-character copy.
