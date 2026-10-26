# Your skill ranks show in the Remoticon

## Goal

Light fingers (`plans/us1-light-fingers.md`) ranks up your thieving, and a log line marks each
rank. This slice adds the other half of the ruling: a readout in the Remoticon that lists each
skill you have and the rank it has reached, so progress is something you can look up, not only
something you catch in the log.

## Where it lives

The smallest fit: a short band at the top of the RINGS tab, under its title and above the
fingertips. That band is empty today at every ring tier (the tallest socket sits well below it).
The tab already draws the hands, and light fingers is a skill of the hands, so the readout sits
with them. No new tab, no new key, and nothing in it is tappable, so `main.js` does not change.

## How it works

- `game/layout.js` `deviceSkillsLayout(bodyRect, skills)` decides which skills show and where:
  one row per skill with at least one clean use, each with one pip per rank the skill has. A pip
  is lit when that rank is reached. Rows that would run past the band are left off rather than
  drawn over the hands. It reads `SKILLS` and `rankOf` from `game/skills.js` (pure, like the
  `rings.js` import already there).
- `game/renderer.js` draws those rows in the RINGS tab: the skill's label on the left, its pips
  on the right. With no skills the band draws nothing, so the tab looks exactly as before.
- A skill with no clean use yet does not appear, the same way an unrevealed finger shows no
  socket.

## Acceptance checks

- With a skill rank earned, the RINGS tab lists the skill and shows its rank as lit pips
  (`tests/skills-readout.test.js`, and a 3440x1440 screenshot).
- The band never overlaps the tab title or any socket or finger at any ring tier.
- With no skills, nothing is drawn.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings this rests on

- **Do you see your skill ranks:** picked *yes, a log line on rank-up, and a readout in the
  Remoticon*. The log line shipped with light fingers; this is the readout.
- **Light fingers** itself (merged): its ranks are the ones shown here.

## Placeholders (for Caelan's eye)

- Each skill's label is `[TEXT]`.
- The rank is shown as pips, one per rank, lit when reached, so no word or number is needed.
  Showing the unlit ones tells you how many ranks a skill has; that is a call for him.
- A skill appears after its first clean use, not before.
- The spot (top of the RINGS tab) is the light choice; a SKILLS tab of its own is the bigger one.

## Out of scope

- A new Remoticon tab, keyboard cursor stops on the rows, or tap actions on them.
- Showing the count of clean uses or how many until the next rank.
- Any copy: labels stay `[TEXT]`.
