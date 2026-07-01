# Sewer Quest — "The Crat" (DRAFT for review)

> **Status:** DRAFT capturing Caelan's idea (2026-07-01) for a later **sewer** quest.
> Not implemented, not canon until Caelan signs off. Parked on the `plan` branch to
> look at later. My additions (structure, options) are clearly marked; the core
> premise is Caelan's.

## Logline
In a flooded room **north of the sewer's main chamber**, a crab named **Abner** is
raising a crab-rat hybrid — **the Crat** — and the whole drain is whispering about who
the other parent really is. The player gets pulled into a paternity melodrama that
turns the *"YOU ARE NOT THE FATHER"* trope inside out: because crabs **lay eggs**, the
certainty a human mother takes for granted is gone, and the "reveal" everyone is
chasing may never actually land.

## The trope flip (design intent)
The daytime-TV paternity trope runs on one guaranteed anchor: the **mother** always
knows the child is hers, because she carried it. The drama is only ever about the
*father*. Strip that anchor away — an egg-layer who may have laid the wrong eggs, in
the wrong nest, after the wrong tryst — and the whole machine spins out. The quest
**promises the player a big DNA-test reveal and then denies it**: the answer is
genuinely, structurally unknowable, and the emotional truth (who shows up, who stays)
ends up mattering more than the genetic one.

## Cast
- **Abner** — a crab. Anxious, houseproud, defensive; loves the Crat fiercely. The
  **egg-layer**, and the one who "may not have been loyal." (Gender played loose —
  Violencetown crabs contain multitudes.)
- **The Crat** — the child. A crab-rat *(…or crab-bat?)* hybrid. Skittish, clacky,
  endearing. The quest's beating heart — **never the butt of the joke.**
- **The Rat** — Abner's steady partner, the presumed father, the "rat" in "Crat."
  Wounded pride; wants to believe.
- **The Bat** — the affair. Blew in from the dark one season; hangs upside-down off a
  pipe, evasive. The reason the Crat "might actually be a bat, not a rat."

## The love triangle
Abner + the Rat (the committed couple) + the Bat (the secret). Abner strayed, laid a
clutch, and out came the Crat. Does the Crat's non-crab half come from the **Rat**
(partner) or the **Bat** (affair)? The drain is split; nobody can tell a rat-hybrid
twitch from a bat-hybrid twitch at a glance.

## Structure (beats — rough)
1. **Hook** — enter the north sewer room; overhear Abner mid-argument with the Rat,
   the Crat cowering behind a bottlecap. Abner grabs the player — an outsider with no
   dog in the fight — to "settle it, once and for all."
2. **The ask** — Abner wants *proof* the Crat is the Rat's, to save the relationship.
   The Rat wants the truth, whatever it is. The Bat wants… unclear.
3. **Investigation** — gather diegetic, absurd "evidence" around the sewer: does the
   Crat cling to ceilings? flinch at light? hoard shiny things? click in the dark like
   it's echolocating? Each clue points **ambiguously** — some read rat, some read bat.
4. **The "test"** — a Maury-style confrontation the player stages. Huge build-up.
   Then the result is inconclusive / smudged / eaten / the "machine" turns out to be a
   bucket. **No clean reveal.**
5. **The real choice** — the player decides what to *tell* them (disposition-driven —
   ties into the dialogue/disposition system): reassure Abner (a kind lie / chosen
   family), give the Rat the hard maybe, expose the Bat, or refuse to answer.
   Consequences shift dispositions — and maybe who stays.
6. **Ambiguous ending** — the Crat's true parentage is **never confirmed**. Whatever
   the player says, the last image is *chosen*, not proven.

## Setting
- A NEW sewer room **north of the current main sewer room** — needs a map addition (a
  northern chamber + a transition). Damp domestic dressing: a nest, a cracked egg or
  two, a leaking pipe the Bat roosts on.
- ⚠️ The sewer is the **hand-fitted escape set-piece**, deliberately kept tight (not
  4×-scaled). A new north room must **not** disturb the escape geometry — add it as an
  appendage off the main chamber, gated behind its own transition.

## Open design questions (for Caelan)
- **How ambiguous?** Fully unknowable (my lean — it *is* the whole point), or a faint
  tell the attentive player can read?
- **The deeper flip?** Play it as an uncertain **father** (rat vs bat), or push all the
  way to *"you are not the **mother**"* — Abner unknowingly raising someone else's
  clutch (a brood-parasite twist, impossible for humans, native to egg-layers)?
- **Player role** — neutral arbiter, or can they take a side / be bribed by a party
  (hooks into disposition + GP)?
- **Reward** — GP? a disposition boon? a keepsake (a bottlecap from the Crat)? an item
  that only makes sense here?
- **Name check** — "Crat" (crab+rat) is perfect; if it leans bat, does the drain start
  calling it something else, or does "Crat" stick ironically?
- **Tone guardrail** — absurd about the animals, tender about the kid.

## Implementation notes (when built)
- `quests.js` — a new quest entry with stages (hook → investigate(N clues) → confront →
  choose → resolve); reuse the QuestEngine + `getHudText()`.
- `dialogue.js` — trees for Abner, the Rat, the Bat (disposition-gated; ties into the
  existing disposition/dialogue system). A pure **talk-quest** — no combat required.
- Sewer map JSON — the north room + transition; NPC spawns (Abner + Crat stationary,
  Rat + Bat placed); new tiles/props as needed.
- Sprites — Abner (crab), the Crat (hybrid), the Rat, the Bat — placeholder picks from
  existing sheets, or new ones.
- Fits the **diplomacy-over-combat / disposition-dialogue** pillar squarely.
