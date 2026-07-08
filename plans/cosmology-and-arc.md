# Violencetown Narrative Canon: Cosmology + Arc

**Status:** Canon (locked through 2026-05-21 design session)
**Purpose:** Single source of truth for the game's world frame, central cast, opening act, and final arc. Every future cryptid card, NPC bark, item description, and scene authoring decision should source from here. When in doubt, this doc wins.

> This is not a feature spec — it's the *narrative bible*. Mechanical features (FSM, disposition, give-action, etc.) have their own Gate docs. This doc tells those features what kind of *world* they're operating inside.

---

## The Cosmology

Violencetown operates on a **two-pole moral axis** rendered through Americana iconography.

| Pole | Forces | Iconography |
|---|---|---|
| **Positive** | Sun, gold, daylight, generosity, gift, openness | Cowboy, prospector, high-noon hero, the daywalker, the diner sign, the boardwalk at noon |
| **Negative** | Night, blood, banks, contracts, drainage, secrecy | The financier, the nobleman vampire, the night-creature, the underwriting clause |

The positive pole is American sun-folklore. The negative pole is European blood-folklore. The central conflict of the game is the *vampires (old world) parasitizing the sun (new world)* — Bank Street is where this happens politically; the moonblock conspiracy is its visible policy lever.

**Cryptids stand mostly outside this axis.** They are *folk-neutral* — America's own weird, regional and pre-political. Mothman doesn't care who wins the vampire war unless West Virginia is on the line. Bigfoot has his own concerns. The cryptid menagerie is the city's *unaligned subculture*, available to either side but committed to neither.

**Moonblock** is the central macguffin of the cosmology. It does three different harms:

1. To **humans**: trapped indoors (sun damages skin without real sunblock, which the vampires hoard); only "moonblock" is sold over the counter and does nothing for sun damage.
2. To **vampires**: enables them to walk in daylight (the *point* of the scheme).
3. To **wererats**: it's a poison. They're allergic. They don't know what's been poisoning them until late in the game.

Three different relationships to one substance is what makes moonblock such a load-bearing item. Every faction has a stake in it.

---

## The Cast Spine

These six characters anchor the entire game's narrative. Every other NPC is supporting cast.

### Night Kid (the player)

A working-class human. Night-shift line cook at Jersey's boardwalk diner. "Night Kid" is a nickname from Jersey; the player's real name (if any) is not established. Working class, no destiny, no powers, no apparent connection to the cosmological forces in play.

The name carries dramatic irony: the player is named for the *negative* cosmological pole (night), yet their true arc carries them toward the *positive* (sun, gold). Jersey gave them this name as patron-naming, unaware (or aware) of the inversion.

**Arc:** Pawn → Probe → Protégé → Successor → Apex. Each step is earned, not destined.

### Jersey (the Jersey Devil, hidden)

The player's first boss. Runs the boardwalk diner. Gives Night Kid the inciting-incident package. Appears human early in the game; **his cryptid identity is a mid-game reveal**.

Jersey is **knowingly complicit** in the package setup. He has his own agenda — long-running political stakes in Violencetown that predate Night Kid and will outlast Night Kid. The player was *useful* to him as a probe to destabilize the Financier's network. Not malice; opportunism. The Jersey Devil in folklore is *amoral-chaotic*, not aligned good or evil. His agenda is most likely anti-Financier / anti-moonblock, pursued through misdirection rather than direct action.

**Tonal register:** Mother 3-style boss-character. Mundane authority with hidden depths. Patron, not gnostic. He provides livelihood, location, identity (the nickname). He benefits from the player's dependence.

The mid-game reveal of Jersey's identity AND his complicity should land *in the same beat*. The player discovers: (a) Jersey is the Jersey Devil, (b) he set me up, (c) he had a reason that I might *agree with in hindsight* — but I still don't get my innocence back.

### Sun Man

A separate NPC mentor. NOT the same person as Night Kid. Visible but unapproachable in the Town early in the game — the player sees him from a distance, lingering at the boardwalk's edge at sunset, walking past without speaking, refusing service at Jersey's diner.

**The first conversation with Sun Man is a narrative gate.** Triggered when the player has unlocked at least one transformation and demonstrated they are more than a pawn. From that point, Sun Man becomes the player's *true* mentor — the figure who teaches the cosmology, who explains the sun/blood/gold axes, who frames the Financier fight as something larger than personal revenge.

**Tonal register:** Disco Elysium-style gnostic mentor. Phantom figure who appears at narrative inflection points. Provides meaning, cosmology, future-self. He benefits from the player's growth.

His origin (per `decision-trees.md`): "collateral damage from the moonblock scheme, emits sunlight." He is sun-aligned by nature and has been weakened by the vampire conspiracy. He recognizes Night Kid's potential because he sees something familiar — Night Kid will become a version of what Sun Man once was.

### The Financier

Vampire banker. Operates from Bank Street. Architect of the moonblock conspiracy. The political face of the negative cosmological pole.

**Met in the opening minutes** when Night Kid attempts to deliver the (swapped) package. The Financier kicks Night Kid out; hostility starts here. He is the *recurring antagonist* across the whole game, not a final-act reveal. By the time the player fights him at the end, they have been thinking about him for the entire game.

**He is the catalyst of the final boss fight, not its conclusion.** The real final fight is what comes after his defeat (see Final Arc).

### Carrion

A dehydrated zombie merchant. Pushes a cart down the sewer river. Blocks the southern corridor of the Sewer zone. Greets the player with: *"Road's blocked, friend. Sewer river's swollen with sludge. Come back later."*

She is **evidence of what sludge does long-term** — her dehydration is from sludge exposure. She values water above all else. The blocked road opens when the player resolves the Sewer's central conflict (Fungus King + soap supply chain), which restores the river flow and lets Carrion through.

She is the prototype for the "non-hostile NPC" class — the disposition system's first test case, the give-action system's first merchant, and a recurring character who appears in multiple zones across the game in different states (depending on world-state progression).

### The Sunpyre

The apex form. Unlocked in **New Game Plus**, after the player defeats the monstrous transformed Sun Man at the end of playthrough 1 and *absorbs* (compresses) his essence.

**Etymology:** Sun + pyre (funeral fire) + rhyme with vampire. A unique-noun-with-the-definite-article identifier — not a creature class like Wererat. There is only one Sunpyre in the world, and the player is it.

**Mechanical signature:**
- Blood-to-gold at maximum efficiency: vampire-aligned damage taken mints gold currency.
- Sunlight reflects off gold and refracts back as a weapon against vampires.
- Daywalker — gains controlled vampire abilities (regeneration from blood, supernatural speed) without daylight weakness.
- NPC reactions completely re-keyed: vampires fear, townspeople bow, cryptids treat as folk-deity.
- Trace abilities from all four transformation creatures (Wererat squeeze, Robot overrides, Clown charm, Skeleton death-resistance). The Sunpyre contains all prior forms.

**Visual register:** Golden flame aura wrapping a controlled human silhouette. Naruto-Kurama-Sage-Mode coded. Sun-disc halo, vampire-fang silhouette, runic markings of solar mythology.

---

## The Opening Act (first ~20 minutes of play)

A complete narrative beat structure that the game opens with. Loadbearing — most of the player's emotional setup for the entire game is established here.

1. **Player wakes/starts shift as Night Kid.** Boardwalk diner. Tutorial controls. Establish the working-class, night-shift, low-status texture.
2. **Jersey calls Night Kid over.** Hands them a package. Asks them to deliver it to the Financier on Bank Street. Mundane errand framing. Possible exposition: "He pays well. Don't open it."
3. **Player walks toward Bank Street.** Boardwalk environment introduces the game's visual language — neon, taffy stands, fortune-tellers, dilapidated arcades, fishing piers, weird street performers (some of whom are cryptids in plain sight, though the player doesn't know it).
4. **Wererat ambush.** First combat encounter. Tutorial-level. Player learns bump-to-attack, dodging, the basic combat verbs.
5. **Player wins.** Feels victorious.
6. **The wererat actually won the *real* encounter** — they switched the package contents during the fight. The player has been carrying a swapped package since the ambush ended. (The player may not realize this immediately; could be revealed at the Financier's door or via item-inspection.)
7. **Player delivers the package to the Financier.** Banking interior. Tonally distinct from the boardwalk — marble, ledger books, vault doors, vampires in suits. Establishes the central antagonist faction's visual register.
8. **The Financier opens the package.** Reacts with rage. Kicks Night Kid out. Hostility from this point on. (The package contents: probably moonblock, in a context that frames it as an attempted poisoning.)
9. **Player retreats / runs / is chased.** Now in the streets between the bank and the boardwalk. Hostile NPCs may attack on sight.
10. **Wererats are now also angry.** They were poisoned by the moonblock that was meant for the Financier (or they were independently exposed to a parallel batch). They blame Night Kid. Visible signs of wererat hostility — graffiti, attacks, rumors.
11. **Night Kid returns to the boardwalk diner.** Jersey's reaction is *complex*. He acts surprised. He acts protective. He offers Night Kid a place to lie low. Player can't tell yet whether he's an ally or an architect. (The truth — that he set this up — is a mid-game reveal.)

**By minute 20, the player is:**

- Hated by the vampires (Financier rejection).
- Hated by the wererats (poisoning frame).
- Sheltered by Jersey (whose loyalty is in question).
- Without faction, without status, without trust.
- Free to explore the open world to figure out what's happening.

The starting disposition state of every major NPC in the game is set by this opening. The arc of the game is *rehabilitation* — earning back trust, building alliances, eventually becoming The Sunpyre.

---

## The Five Zones

Each zone has a native creature, a boss, and a transformation unlock. The Town is the spine; the other four are spokes that radiate from it. The player can tackle them in any order (open world) after the opening act.

| Zone | Native Creature | Boss | Unlock | Iconography |
|---|---|---|---|---|
| **Town** (boardwalk + Bank Street) | Human / Sun Man | The Financier | *(see Final Arc)* | Jersey Shore Americana, banking gothic, neon |
| **Sewer** | Wererat | Texas Beholdem | Wererat | Mothman-coded Appalachian industrial decline |
| **Factory** | Robot | Alien Invasion | Robot | Flatwoods Monster, 1950s atomic-era, goo |
| **Circus** | Clown | Bigfoot | Clown | Carnival Americana, cryptid menagerie, Bigfoot as alpha |
| **Graveyard** | Skeleton | The Deity | Skeleton | Surfer-bro deity, boundary-of-death iconography |

**The Town is structurally different from the other four.** It's the hub. It's home. Sun Man lives there (unapproachable until earned). Jersey runs the diner there. The Financier rules Bank Street within it. The final boss fight happens within it.

**Each spoke zone unlocks its native creature** at the end of its boss fight, via cutscene. The player CHOOSES whether to accept the transformation. (Wererat unlock is choice; Robot unlock is choice; etc.)

**The Town does NOT unlock a creature in the same way.** Beating The Financier triggers the Final Arc — phase 2 of the final fight + Sun Man's transformation + The Sunpyre integration. It's the game's climax, not a parallel unlock.

---

## The Final Arc

Triggered by the player engaging The Financier in his Bank Street vault after sufficient progression (probably: all four spoke transformations available, optional unlocked or accepted; sufficient world-state advancement).

**Phase 1: Player + Sun Man vs. The Financier.**

The team-up. Sun Man approaches the player one final time before the fight, having mentored them through mid-game. They enter the bank together. Boss fight against The Financier — standard vampire-banker combat, but elevated by the team dynamic. The player isn't alone for the first time.

**The Bite.**

Mid-fight, Sun Man is bitten by the Financier. His sunlight nature begins fighting the vampire corruption — but he's losing. His transformation is *visible* and *gradual*. He has time to speak.

**The Coaching.**

During his transformation, Sun Man delivers a combat briefing for the version of him about to emerge:

- "Aim for the third heart. There are three — the original, the one the vampire grew, and the one I'm growing now. The third one is the one I want you to kill."
- "When I scream, the sunlight in me is being fought down. That's your window. Hit me then."
- "Don't apologize. I won't remember this. Don't make me remember this."

This is the most emotionally weighted scene in the game. *Combat tutorial as dying mentor monologue.* Two genres of writing fused into one beat.

**Phase 2: Night Kid vs. Monstrous Sun Man.**

The Financier is either dead, fled, or irrelevant. Sun Man — now a monstrous vampire-Sun hybrid, the worst version of what could become The Sunpyre — is the real final boss. The player fights him using the playbook he gave them minutes ago.

**Victory: Compression.**

When Sun Man falls, his essence does not disperse. The player *absorbs* it — compresses the monstrous chaotic Sun Man into a controlled apex form. Sage Mode / Kurama-mode metaphor: don't destroy the chaos, integrate it.

**End of Playthrough 1.**

Credits roll. The world is saved (or significantly improved). Night Kid has become a folk legend — the kid who killed the Financier and the monster his own mentor became.

**NG+: The Sunpyre.**

New game plus begins. Night Kid IS the Sunpyre — Sun Man's integrated essence wrapping a controlled human silhouette in golden flame. Same world, but the world reads the player completely differently. Vampires fear. Townspeople bow. Cryptids genuflect. The Sunpyre walks the same five zones with the cosmological weight of legend.

NG+ content includes: re-keyed NPC reactions across all zones, Sunpyre-only encounters, scenes that didn't exist in playthrough 1, possibly a true ending dependent on player choices in NG+.

---

## Tonal Frame

The game's voice is the synthesis of four reference media:

1. **Mother 3** — Dense walkable city; ~1 NPC per 25 tiles, ~1 examinable per 10 tiles; chapter-based world-state changes; grief-without-explanation in NPC backstories; mundane bureaucratic absurdity disguising deep tragedy.
2. **Codename: Kids Next Door** — Bureaucratic procedure for absurd content. The mundane infrastructure of cosmic weirdness is the joke. Vampires lobby the FDA. Mothman files paperwork.
3. **Adventure Time / Regular Show** — Anthology design. Each scene is a self-contained creative bet. The world is the carnival container; the scenarios bounce around inside it. Persistent characters across episodes; consequences accumulate; episodes themselves don't have to nest.
4. **Cryptid + Americana folklore** — Pre-licensed cultural-commons characters. Geographic encoding (each cryptid carries its regional iconography). Documentarian aesthetic (blurry photos, witness affidavits, redacted reports).

**The persistent-world principle:** anthology episodes, persistent consequences. Episodes don't have plot continuity, but characters grow, die, change roles. Stuff you do in episode 3 is still true in episode 47. Save/load is the spine that preserves this; world-state flags persist across sessions.

**The dramatic-irony principle:** The player has prior conceptions of cryptids and folkloric figures. Use that prior. Match it, subvert it, or layer it — but never ignore it. The player meets Bigfoot already half-knowing who he is.

**The negative-space principle:** Reference more than you render. NPCs talk about offscreen events, locations, factions you'll never visit. The world is bigger than you because of what's *implied*, not what's *shown*.

---

## Design Principles That Follow

These are the rules every future content decision should pass:

1. **Mooks vs. anchors.** Engineering enemies (fungi, bandits, sludge crawlers, etc.) are *mooks* — replaceable, named by type, used for combat density. Cryptids and named characters are *anchors* — irreplaceable, named individually, used for scene weight. **Every anchor must be irreplaceable; every mook must be replaceable.** Never use a cryptid as cannon fodder.
2. **Per-character map variation.** Each playable creature sees a slightly different version of every zone. Same tiles, different NPC reactions, different barks, different unlockable passages, different examinables. The Wererat experiences the Sewer as home; the Human experiences it as hostile territory. Same map, different *witness*.
3. **Hostility as starting state.** The player begins at -50 disposition with most factions. Rehabilitation is the progression curve. Bribery and identity transformation are the tools.
4. **Two-mentor structure.** Jersey is the *patron* (mundane authority, hidden agenda, home-base). Sun Man is the *gnostic* (mythic figure, narrative gate, destiny). They pull the protagonist in different directions. The Sunpyre form integrates both.
5. **Documentarian aesthetic for worldbuilding.** Blurry photos, redacted memos, witness affidavits, found tape transcripts, torn newspaper clippings. Examinable artifacts deliver worldbuilding through the *modality* of cryptid eyewitness testimony.
6. **Bureaucratic procedure for absurd content (KND rule).** Every line of dialogue and every item description should pass the audit: does the absurdity route through paperwork? If a bandit says "I'm here to rob you because the vampires want soap," that's bad — exposition. If a bandit says "Form 4-J says I gotta pat you down before the King sees you," that's good — same content, KND framing.
7. **Anchor density per scene (Mother 3 target).** Roughly 1 NPC per 25 walkable tiles; 1 examinable per 10 tiles. Author for density. The funhouse feeling comes from *care per tile*, not from world simulation.
8. **One new thing per episode (Adventure Time rule).** Every scene must have one mechanic, character, item, or interaction the player has never seen in a videogame before. Push the form somewhere new in every room.

---

## Pending decisions / open questions

These are *not* canon yet. Listed so they don't drift unnoticed.

- **What exactly is in the original (unswapped) package?** Likely something Jersey wanted to reach the Financier for his own anti-vampire agenda. Possibly real sunblock (contraband). Possibly evidence of the wererat allergy. Possibly a tracking device. To be decided.
- **What's the trigger for Sun Man's first conversation?** Probably: at least one creature transformation unlocked, plus some world-state flag (e.g., player has helped at least one faction recover from the opening-act hostility).
- **Does the player choose the Sunpyre transformation, or is it automatic on victory?** Current canon: automatic. Sun Man's essence is absorbed regardless. The choice happens earlier — whether to engage the Financier at all, knowing what's coming.
- **NG+ true-ending content.** What additional content / scenes / encounter changes exist in NG+ as The Sunpyre? To be designed.
- **Carrion's full arc.** She appears in multiple zones in multiple states across the game. The states need authoring.
- **The four spoke transformations' specific mechanical gifts.** What does Wererat give the player beyond reskinning the Sewer's reception? Squeeze through 1-tile gaps (per `decision-trees.md`). What about Robot? Clown? Skeleton? Each needs its mechanical signature defined.
- **Whether the Town's hostility flips to friendliness if the player stays Human through to The Financier.** A pure-Human playthrough should be rewarding; this canon doc suggests the Town becomes friendly *because* the player didn't transform, which is currently underspecified.

---

## Source / authorship note

This document captures the game's narrative canon, worked out in a design session on 2026-05-21. It was designed by Caelan Gander and developed in collaboration with Claude Code: the canon and design decisions are Caelan's; Claude helped draft, structure, and connect them. Future updates should preserve the canon decisions and revise only the framing as needed.

When in doubt about whether something is canon: if it's in this doc, it's canon. If it's not, it's pending.
