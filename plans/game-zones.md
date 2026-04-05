# Feature: Game Zones — Static World Map
**Phase:** Foundational
**Priority:** Critical
**Status:** Research / Design — **ADVENTURE PIVOT (2026-04-05)**
**Date:** 2026-04-01 (updated 2026-04-05)

---

## Design Pivot (2026-04-05) — JRPG Adventure

> **This plan is now governed by `plans/adventure-transition-plan.md`.**
>
> Violencetown is a **2D pixel JRPG adventure**, not a roguelike. The game has a hero's journey arc, a hub zone (Street), four adventure zones, and a final confrontation. Town is renamed to **Street**. The Financier is the main villain whose arc bookends the entire game.
>
> **What changed:**
> - Town → **Street** (the hub zone, always accessible)
> - Progression is now a **linear adventure** with the player starting as Human on Street
> - Creatures are **party members** recruited during the story, not swappable player identities
> - No permadeath, no run-based structure, no creature parking
> - Death = checkpoint respawn (lose gold, keep levels and key items)
> - The Financier's vampire scheme connects all five zones and resolves in a final battle on Street

### Zone Map

```
                [ Graveyard ]
                     |
[ Factory ] — [ STREET ] — [ Circus ]
                     |
                [ Sewer ]
```

### Adventure Progression (Hero's Journey)

| Act | Zone | Element | Enemies | Boss | Levels Gained |
|-----|------|---------|---------|------|---------------|
| **1** | **Street** (hub) | None | Bankers, suits (vampire hints) | None | 1 (starting) |
| **2** | **Sewer** | Sludge | D&D fantasy monsters | **Texas Beholdem** | 1 → 3 |
| **3** | **Circus** | Fun | Cryptids, clowns | **Bigfoot** | 3 → 5 |
| **4** | **Factory** | Goo | Robots, aliens | **Alien Invasion** | 5 → 7 |
| **5** | **Graveyard** | Death | Undead (skeletons, zombies) | **The Deity** | 7 → 9 |
| **6** | **Street (Return)** | All converge | Vampires unmasked | **The Financier** | 9 → 10 (cap) |

---

## Previous Design Pivot (2026-04-01)

> The section below preserves the original static-world pivot for reference.
> Zone details, creature profiles, boss designs, and element mechanics remain relevant
> but the PROGRESSION ORDER and STRUCTURE are superseded by the adventure plan above.

---

## Core Concepts

### Progression — SUPERSEDED

> **RENAME: "Town" → "Street" throughout this document.** References to "Town" below should be read as "Street." A full rename pass will happen during Gate 2 design.
>
> **See `plans/adventure-transition-plan.md` for the current progression order.**
>
> Key changes: You start as **Human on Street** (the hub). Creatures join as **party members** during the story: Wererat (Sewer), Clown (Circus), Robot (Factory), Skeleton (Graveyard). The Financier is the final boss, fought on Street in Act 6.
>
> **Previous zones stay accessible.** After completing a zone, you can return to it for side content, secrets, and items gated behind abilities gained later.

---

### The Three Meters

Three paired meters that carry across zones. Each meter type plays differently. Elements unlock in stages (see Progression above).

| Pair | Meter Type | How it works |
|------|-----------|--------------|
| **Bored ↔ Fun** | Limit Gauge | Fills up over time. When it pops, something big happens. Which end you're on determines WHAT happens. |
| **Sludge ↔ Goo** | Seesaw / Balance | A spectrum. Tipping too far either way is bad. Stay in the middle. Active management. |
| **Death ↔ Life** | HP | Life is always better. Death is always worse. Life IS your HP. |

These meters are **not zone-locked.** You carry them with you. What you pick up in one zone affects you in another. The zones push you toward their element, but the meters are yours.

---

### Limit Gauge: Bored ↔ Fun

The gauge fills over time. The question isn't IF it pops — it's WHICH SIDE you're on when it does.

**Too much Bored (Town pushes you here):**
- Time skip? Random actions? Loss of agency. *(Still needs design work.)*
- Boredom increases with money. The richer you are, the faster it fills toward Bored.
- Lower Boredom by: spending money, throwing money at people, breaking your own stuff on people.

**Too much Fun (Circus pushes you here):**
- **Fun Berserk.** Total loss of control. Your character does random stuff really fast — running, attacking, interacting with everything, laughing, spinning. You're a puppet on Fun strings. The clowns/cryptids watch and feed.
- Fun fills from circus items, clown performances, carnival games, cryptid encounters.

**The gauge is always filling.** Town pushes you toward Bored. Circus pushes you toward Fun. Being in neutral zones or managing your actions keeps you centered. The limit gauge pops at either extreme — you want to stay in the middle, but both zones are pulling you toward opposite edges.

**Sun Damage (Town — separate from the gauge):**
Town also has direct sun damage outdoors — Life drain on exposed tiles due to the moonblock scam. This is a Death ↔ Life interaction, not part of the Bored ↔ Fun gauge. Shade tiles and real sunblock protect you. The Town pinch: sun damage outside (Life drain), boredom inside (gauge filling toward Bored).

---

### Seesaw: Sludge ↔ Goo

A balance beam. Both sides are dangerous at the extremes. The middle is safe.

**Too much Sludge (Sewer coats you):**
- Enemies become **2x fast.** The world speeds up, you don't. You're not slowed — everything else is in overdrive.
- Sludge is purple, glowing, void-like. Contact with sludge tiles pushes the seesaw toward Sludge.
- Lower Sludge with soap + water (scarce in the sewer). Shower basins, clean water pipes.

**Too much Goo (Factory coats you):**
- You become **2x fast.** You move at double speed, act at double speed. Sounds great — but the game is now harder because you're moving too fast to think. Inputs matter more. Mistakes happen faster. You're powerful and dangerous to yourself.
- Goo is green, radioactive, alien. Contact with goo tiles pushes the seesaw toward Goo.
- *(How to lower Goo: TBD — will figure out with items later.)*

**The seesaw:** Sludge and Goo oppose each other on the same spectrum. Stepping in Goo pushes you away from Sludge and vice versa. The Sewer coats you in Sludge; the Factory coats you in Goo. If you go straight from one zone to the other, they partially cancel out. But go too deep into either zone and you tip the seesaw to a dangerous extreme.

**Balanced in the middle:** No speed effects. Normal gameplay. The ideal state.

---

### HP: Death ↔ Life

The simplest meter. **Life is your HP. Death reduces it.**

- **Life** is always better. More Life = more HP = more survivable.
- **Death** is always worse. The Graveyard's element is Death — being there actively drains your Life. The Deity is killing you. The bar fills, you die.
- Sun damage in Town also drains Life (Death ↔ Life interaction).
- Combat drains Life. Sludge DoT drains Life. Anything that hurts you is a Death ↔ Life interaction.

**The Graveyard is special:** It's the only zone where the environment is directly killing your HP just by existing there. Other zones have hazards that mess with your speed, your control, your balance — but the Graveyard goes straight for your Life. The Deity doesn't play games. Full Death = you die. No second chance.

---

## The Five Zones

Violencetown is divided into five distinct zones. Each zone is the home turf of a specific creature type. The zones together form a single contiguous map.

### 1. Town (City Center)
- **Resident creature:** Human
- **Element:** Boredom (indoors) + Sun Damage (outdoors) — Town is a two-sided trap created by the vampire sunblock scheme. Outside, the sun scorches you (no real sunblock, only useless moonblock). Inside, boredom builds (stuck indoors with nothing to do, money piling up). You're squeezed from both directions. Go outside and burn. Stay inside and lose your mind.
- **Boredom bar:** Fills while indoors. Increases faster with more money. Forces random actions at high levels.
- **Sun damage:** Taken while outdoors on exposed tiles (no shade, no cover). Direct Life drain. The streets are dangerous not because of enemies but because the sky is trying to kill you.
- **The pinch:** Every other zone has one element to manage. Town has two. The vampires engineered it this way — humans trapped indoors where they're bored and controllable, punished by the sun if they try to leave. The only people who walk freely outside are the vampires (they have real sunblock).
- **Role:** Player starting zone. The "normal" part of Violencetown — except normal has been rigged.
- **Vibe:** A city where everyone's indoors. Empty sun-blasted streets. Crowded, stuffy interiors. The outdoor tiles shimmer with heat. Shade tiles (awnings, alleys, covered walkways) are the safe paths between buildings. It looks normal but it feels like a prison designed by bankers.
- **Tile palette:** Concrete, asphalt, brick, storefronts, streetlights, dumpsters. **Shade tiles** (awnings, overhangs, alley shadows) as safe outdoor paths. **Exposed tiles** (open streets, parking lots, parks) as sun damage zones. **Indoor tiles** (shops, offices, apartments) as boredom zones.
- **Sub-areas:** **Bank Street** — the financial district within Town. Run by vampires. Pale bankers in expensive suits behind tinted windows. The buildings are old, ornate, gothic-corporate. The Masquerade plays out here — vampires hiding what they are behind handshakes, contracts, and power ties. "Bloodsucking bankers" isn't a metaphor. They drain you financially AND literally.
- **Boss:** The Financier (Vampire) — Bank Street. See Boss Profiles below.
- **Notes:** Town is central — the other four zones radiate outward from it. The gas station (existing spawn point) lives here. Finding real sunblock changes the zone — you can walk freely outside, the pinch breaks, and the vampires lose their grip.

### 2. Sewer
- **Resident creature:** Wererat (Rat ↔ Wererat transformation)
- **Element:** Sludge — **purple, glowing, void-like.** The sewers flow purple with sludge. It glows like something from beyond. Not just waste — it feels like the void is leaking through the drains. Sludge slows you down and does damage over time (DoT).
- **Role:** Underground / drainage zone beneath or adjacent to Town.
- **Vibe:** Dark, wet, claustrophobic. Pipes, grates, tunnels. Everything is lit by the purple glow of sludge rivers. The Rat's domain — tight spaces that only small creatures navigate easily.
- **Tile palette:** Sewer grates, water channels, pipes, brick tunnels, muck, drains, glowing purple sludge pools, sludge flows, sludge drips.
- **Boss:** Texas Beholdem — see Boss Profiles below.
- **Notes:** Could connect to other zones via underground passages. Rat form fits through 1-tile gaps. Wererat form is too big — transformation has spatial consequences. Sludge is the zone's environmental hazard — slows movement and deals DoT.

### 3. Circus
- **Resident creature:** Clown (Cryptid Clown)
- **Role:** A permanent roadside attraction / traveling carnival that never left. Americana weirdness. The clowns are tied to cryptids — strange, not-quite-human things that showed up with the carnival and never explained themselves. Part sideshow, part cryptid habitat.
- **Vibe:** Dusty carnival grounds. Faded striped tents. Hand-painted signs. "SEE THE AMAZING..." attractions. Americana roadside kitsch — think Route 66 mystery spots, World's Largest Ball of Twine energy, "Museum of the Strange" gift shops. The clowns run the show but the real weirdness is what lives behind the tents. Cryptids wander the grounds — things glimpsed at the edges. The carnival is their home. They're the exhibits AND the staff.
- **Element:** Fun — bar fills as the clowns entertain you, pull pranks, and put on spectacles. Fun steals your Life. The circus is a blast and it's killing you. The more the bar fills, the more Life they drain.
- **Tile palette:** Striped tents, confetti, carnival booths, popcorn carts, funhouse mirrors, balloon piles, faded wooden signs, hay bales, ticket booths, sideshow stages, "KEEP OUT" signs (that you obviously ignore), cryptid footprints, mysterious fur tufts.
- **Boss:** Bigfoot — see Boss Profiles below.
- **Notes:** The clowns are non-human — tied to cryptids and Americana folklore. What they are exactly is ambiguous. They showed up with the carnival. They don't age. They don't eat normal food. They just perform. The cryptid connection gives them a reason to exist without needing vampire lore. Bigfoot is the biggest, most American cryptid of them all — the alpha of this weird carnival ecosystem. The zone should feel like stumbling into a part of America that shouldn't exist.

### 4. Graveyard
- **Resident creature:** Skeleton (Skeleton ↔ Zombie transformation)
- **Element:** Death — bar fills while you're in the Graveyard. The Deity is actually killing you. Not DoT, not a debuff — **Death**. The bar IS how close the Deity is to finishing the job. Full bar = dead. The Graveyard's element is the real thing.
- **Role:** The dead part of town. The undead are denying death — and something has noticed.
- **Vibe:** Tombstones, crypts, dead trees, fog, iron fences. Quiet and spooky. But underneath the quiet, Death is working.
- **Tile palette:** Gravestones, mausoleums, dirt paths, dead grass, iron gates, candles, fog tiles.
- **Boss:** The Deity — see Boss Profiles below.
- **Notes:** The Skeleton shifts to Zombie form when it takes damage. This zone is home to both forms — bones and rot. The graveyard should feel different depending on which form you're in. The Deity boss gives the Graveyard zone existential stakes — every undead creature here is living on borrowed time. Death as an element means the zone itself is hostile in a way no other zone is.

### 5. Factory
- **Resident creature:** Robot
- **Element:** Goo — **green, radioactive, alien.** The Factory's toxic machines produce Goo as a byproduct. Bar fills on contact or proximity. Goo makes you more powerful and faster, but the higher the bar, the more Life each action costs. It's a Faustian bargain — the Goo powers you up and burns you alive.
- **Role:** Industrial zone. The Factory's toxic machines produce Goo. The aliens arrived specifically to steal it — they eat it.
- **Vibe:** Machines, conveyor belts, smokestacks, metal walls, sparks. The Robot was built here. Mechanical and harsh. Goo pipelines run through everything — it's the Factory's main output. The aliens have set up feeding stations. Grey aliens in chains hauling Goo barrels while little green men eat from Goo troughs. **Abe's Oddysee energy** — the Factory should feel like Rupture Farms. A living industrial machine with distinct sub-areas: production floors, Goo vats, maintenance tunnels, loading docks, the alien-occupied executive level. Machines operate on predictable loops — conveyor tiles that push, crushers on timers, electric gates that toggle. Environmental storytelling through propaganda posters, Goo processing pipelines visible everywhere, and the alien spaceship looming over or docked into the Factory.
- **Tile palette:** Metal floors, conveyor belts, gears, pipes, vats, control panels, catwalks, smokestacks, green goo pools, goo vats, goo pipes, radiation symbols, alien tech, feeding troughs, chain/shackle tiles, alien propaganda.
- **Boss:** Alien Invasion — see Boss Profiles below.
- **Grey Alien rescue mechanic:** Inspired by Mudokon rescue from Abe's Oddysee. Grey aliens are chained up throughout the Factory, forced to haul Goo. Free them and they become your friends — they follow you, fight for you, help you. Simple command system: follow/wait. Lead them to extraction points to fully liberate them. Some are hidden in secret areas, rewarding exploration. The more you free, the stronger your position against the green commanders. They're grey. They're also *grey* — as in sad, depressed, downtrodden. Living a grey existence. You're literally adding color to their lives by freeing them. Everything about them is grey — their skin, their mood, their outlook, their living conditions. "Why so grey?" isn't just a skin color question.
- **Notes:** Natural fit for Robot's tech/machine identity. The Factory is the most Oddworld-inspired zone — enslaved workers, industrial horror played for dark comedy, comically evil corporate invaders (the greens), and a rescue loop that rewards thoroughness.

---

## Zone Layout Concept

```
            [ Graveyard ]
                 |
[ Factory ] — [ Town ] — [ Circus ]
                 |
            [  Sewer  ]
```

Town sits at the center. The four other zones surround it. The exact layout, zone sizes, and connection points are TBD during the map design phase. The Sewer could also function as an underworld layer connecting zones underground.

---

## Zone Map Styles & Environmental Hazards

Each zone needs a distinct map layout philosophy and environmental hazard tiles that interact with the element bar. The hazards are what the bar is *made of* — the physical stuff on the map that fills it.

---

### Town — Map Styles

**Option A: Grid City**
Classic American city grid. Straight roads, right-angle intersections, city blocks with buildings. Think Manhattan or Chicago. Predictable, navigable, boring (on purpose — it's the Boredom zone). The grid IS the boredom — everything looks the same.

**Option B: Suburban Sprawl**
Wider streets, parking lots, strip malls, cul-de-sacs. More space, less density. The emptiness contributes to boredom. Big open lots with nothing in them.

**Option C: Mixed Downtown**
Dense downtown core (Bank Street area) with taller buildings and tighter streets, fading into looser residential blocks at the edges near other zones. Most variety within the zone.

**Environmental Hazards / Bar Fillers:**
Boredom doesn't come from stepping on hazard tiles — it comes from **boring stuff accumulating around you as you get richer.** The environment reacts to your wealth:

- **Coins** — appear on the ground as your money increases. Litter the streets. Visual indicator of your wealth problem. Step on them and they add to your money (making boredom worse). They're a trap disguised as loot.
- **Fax machines** — spawn in buildings, on sidewalks, wherever. Printing endlessly. Stacks of fax paper piling up. The ultimate symbol of soul-crushing mundanity. Walking near a fax machine ticks boredom. The sound of a fax machine is the sound of your Life becoming meaningless.
- **Paperwork piles** — tiles of stacked documents. Tax forms, memos, TPS reports. They accumulate as boredom increases.
- **Beige walls** — certain building interiors are aggressively beige. Cubicle tiles. Drop ceilings. Fluorescent light tiles. The architecture of boredom.
- **ATMs** — dispense money. More money = more boredom. Using an ATM is actively making your problem worse. But you might need the money.

**Unique tiles:** Storefronts (spend money here to lower bar), dumpsters (break stuff here), park benches (sitting = boredom spike), bus stops (waiting = boredom spike).

---

### Sewer — Map Styles

**Option A: Pipe Network**
A maze of interconnected pipes and tunnels. Tight corridors, branching paths, dead ends. Very claustrophobic. Rat-sized shortcuts everywhere that only Rat form can use.

**Option B: Underground River**
A large central sludge river with walkways, platforms, and bridges. More open than Option A. The river is the main artery and everything branches off it. The river flows — sludge tiles that move.

**Option C: Layered Depths**
Multiple vertical levels connected by ladders, drains, and drops. Shallow sewer near Town (relatively clean), mid-level tunnels (sludge increasing), deep sewer (Texas Beholdem territory, almost all sludge). Depth = danger.

**Environmental Hazards / Bar Fillers:**
Sludge is physical. It's on the map. You step in it, it coats you.

- **Sludge pools** — static purple glowing tiles. Step on them, bar goes up. The bread and butter hazard.
- **Sludge flows** — moving sludge tiles. Rivers of purple. They flow in a direction. Standing in one coats you AND pushes you downstream.
- **Sludge drips** — ceiling tiles that periodically drip sludge onto the tile below. Timed hazard — safe sometimes, dangerous others.
- **Sludge geysers** — tiles that periodically erupt, spraying sludge in a radius (adjacent tiles get coated for a few ticks).
- **Burst pipes** — broken pipe tiles that spray sludge in a line. Permanent hazard blocking a corridor.
- **Sludge-coated enemies** — enemies that have been in the sludge too long. They leave sludge trails when they move, creating new hazard tiles behind them.

**Safe tiles:**
- **Shower basins** — rare stations. Use soap here to wash off sludge. The oasis.
- **Clean water pipes** — breakable tiles. Smash them to create a temporary wash area (clean water flows for a few ticks, then stops).
- **Dry ledges** — elevated tiles above the sludge line. Safe to stand on. The paths between hazards.

---

### Circus — Map Styles

**Option A: Big Top Rings**
Concentric circles radiating from the main tent. The big top is the center (the vampire court). Rings of carnival attractions spiral outward. Inner ring = more dangerous (closer to the vampires), outer ring = gateway acts.

**Option B: Carnival Midway**
A long central midway (main path) with booths, rides, and tents branching off both sides. Linear but with lots of side areas to explore. Like an actual carnival layout — you walk the strip and get pulled into attractions.

**Option C: Funhouse Maze**
The whole zone is structured like a funhouse — warped paths, dead ends that aren't really dead ends, hidden doors, mirror rooms. Disorienting on purpose. You're never sure where you are, which is how the vampires like it.

**Environmental Hazards / Bar Fillers:**
Fun fills the bar. The hazards are **circus items and clown attacks** — things that are genuinely entertaining and that's the problem.

- **Confetti tiles** — burst of confetti when you step on them. Fun bar ticks up. Colorful, delightful, deadly.
- **Balloon piles** — pop when you walk through. Satisfying sound. Fun increases. Can't help but enjoy it.
- **Carnival game booths** — interactive tiles. Step on them and a game plays (ring toss, whack-a-mole, duck shoot). You win prizes! Fun bar spikes. The prizes might be useful items but the cost is Fun.
- **Clown performances** — NPC clowns doing bits in a radius. Juggling, pratfalls, pie-throwing. Being within range fills Fun. They're actually funny. That's the weapon.
- **Clown attacks (Fun attacks):**
  - **Pie throw** — a clown hurls a pie at you. It's hilarious. Fun goes up. Also does minor damage. You're laughing and bleeding.
  - **Honk blast** — clown honks a horn in your face. Stun + Fun increase. You can't help but laugh.
  - **Tickle ambush** — clown gets adjacent and tickles you. Fun spikes hard. Loss of movement for a tick.
  - **Balloon animal gift** — a clown gives you a balloon animal. It's adorable. Fun goes up. It takes up inventory space. You don't want to throw it away because it's so cute (but you should).
- **Funhouse mirror tiles** — step on them and your movement is reversed/scrambled for a tick. Disorienting but funny. Fun ticks up.
- **Cotton candy clouds** — sticky tiles. Slow you for one tick (sweet and gooey). Fun increases because cotton candy is delightful.
- **Calliope music tiles** — tiles near the carousel/calliope organ. Ambient Fun increase just from the music. The closer you are, the faster Fun fills.

**Safe tiles:**
- **Backstage areas** — behind the curtains. No performances here. The vampires drop the act backstage. Dark, quiet, no Fun. This is where you see what the circus really is — coffins, blood stores, the real vampire infrastructure. Safe from Fun but you're in the vampires' private quarters.

---

### Graveyard — Map Styles

**Option A: Classic Cemetery**
Rows of tombstones with winding dirt paths between them. A central mausoleum or chapel. Iron fence perimeter. Trees and fog everywhere. Simple, readable, atmospheric.

**Option B: Catacombs Below**
Surface graveyard on top, but the real zone is the catacombs underneath. Skull-lined walls, narrow bone corridors, underground chapels, ossuaries. The deeper you go, the closer to the Deity.

**Option C: Cliff Graveyard**
Built on a hillside or cliff. Vertical element — graves carved into rock faces, winding switchback paths, lookout points. At the top (or bottom) is where the Deity manifests. The ocean is visible in the distance — the Deity's domain, calling.

**Environmental Hazards / Bar Fillers:**
Death fills the bar. The hazards are **bones** — the remains of the dead, scattered everywhere, reminding you that this is where everything ends.

- **Bone piles** — tiles of scattered bones. Skulls, femurs, ribcages. Step on them, Death bar ticks up. The bones are everywhere. Each one was a person. Each one is a reminder.
- **Bone walls** — catacomb-style walls made of stacked bones. Being adjacent to bone walls ticks Death (proximity to the dead).
- **Open graves** — empty grave tiles. A hole in the ground with your name on it (maybe literally). Standing on one spikes Death bar — it's your grave, waiting.
- **Gravestones with your name** — some gravestones have your creature's name on them. The Deity is trolling you. Walking past one ticks Death.
- **Coffin tiles** — closed coffins. Open ones. Some empty, some not. Each one ticks Death.
- **Skeletal hands** — tiles where bony hands reach up from the ground. They grab at you. Death tick + movement penalty for that tile.
- **Fog tiles** — thick fog. Can't see through them. Death ticks faster in fog because you can't see what's coming. The Deity works in the fog.
- **Candle tiles** — lit candles on graves. When the candle goes out (on a timer), Death spikes on that tile. The candle IS your remaining time. Watch them flicker.
- **Death whispers** — certain tiles near the Deity's presence. You hear the surfer dude's voice: "Come on, bro. The water's fine." Death bar increases. His voice is the hazard.

**Safe tiles:**
- **Sacred ground** — tiles with protective symbols. Church floors, blessed areas. Death bar pauses here. Temporary sanctuary.
- **Lit areas** — well-lit tiles with multiple candles still burning. Death is slower here. The light holds it back.

---

### Factory — Map Styles

**Option A: Assembly Line**
Linear factory floor. Long conveyor belts running left to right. Stations along the line. You move through the production process — raw materials at one end, Goo at the other. The spaceship is docked at the output end, eating the product.

**Option B: Multi-Floor Plant**
Multiple floors connected by elevators, ladders, and catwalks. Ground floor is production, second floor is processing, top floor is the alien-occupied executive suite. Vertical progression toward the boss.

**Option C: Sprawling Complex**
Multiple buildings/wings connected by outdoor walkways and pipes. Different wings for different functions — smelting, Goo refining, storage, alien barracks, grey alien holding cells. More open than Options A/B. The spaceship sits in the central courtyard.

**Environmental Hazards / Bar Fillers:**
Goo is physical. It's produced by the machines. It's everywhere.

- **Goo pools** — static green glowing tiles. Step in them, bar goes up. Powers you up AND costs you. The core tension.
- **Goo vats** — large multi-tile containers of Goo. Proximity (within 2-3 tiles) fills bar passively. The vats radiate.
- **Goo pipes** — tiles where Goo flows through visible pipes. Breakable — smash a pipe and Goo sprays out, creating new pool tiles. Could be tactical (block a corridor with Goo) or accidental.
- **Goo drains** — floor drains leaking Goo upward. Periodic — safe sometimes, erupting others.
- **Conveyor belt tiles** — push you in a direction automatically. Not Goo-related but a movement hazard. Can push you INTO Goo.
- **Crusher tiles** — on a timer. Safe, safe, safe, CRUSH. Instant damage if you're on them when they activate.
- **Electric gate tiles** — toggle on/off. Blocks passage when active, zaps if you walk into them.
- **Steam vent tiles** — periodic steam bursts. Damage + obscures vision for a tick.
- **Feeding troughs** — where the little green men eat Goo. High Goo radiation in the area. Also where you'll find greens clustered (combat opportunity).
- **Alien tech tiles** — spaceship-adjacent tiles. Foreign materials. Goo concentration highest near the ship.

**Safe tiles:**
- **Maintenance tunnels** — clean corridors between sections. No Goo, no machines. Where grey aliens hide.
- **Control rooms** — behind glass. Computers, switches. Low Goo. Sometimes you can control machines from here (shut off conveyors, drain vats).
- **Grey alien holding cells** — where the greys are chained. Low Goo (the greens don't want their slaves powered up). Rescue points.

## Creature Roster (Updated)

| Creature | Home Zone | Transformation | Status |
|----------|-----------|----------------|--------|
| Human | Town | None | Existing — player start creature |
| Wererat | Sewer | Rat ↔ Wererat | **CHANGED** — was "Sewer Rat", now transforms |
| Clown | Circus | Cryptid Clown | **CHANGED** — clowns are cryptid/Americana creatures, non-human carnival folk |
| Robot | Factory | None (yet) | Existing — from previous plans |
| Skeleton | Graveyard | Skeleton ↔ Zombie | **NEW** — transforms on health loss |

### Creature Transformations

**Wererat (Sewer)**
- Default form: **Rat** — small, fast, fits through tight spaces. The classic sewer rat.
- Transformed form: **Wererat** — larger, stronger, more dangerous. The beast comes out.
- Transformation trigger: TBD (combat? rage? lunar cycle? manual toggle? health threshold?)
- This replaces the old "Sewer Rat" creature entirely. The Rat form preserves the "fits through 1-tile gaps" ability. The Wererat form is the payoff — power at the cost of size/stealth.

**Skeleton ↔ Zombie (Graveyard)**
- Default form: **Skeleton** — bony, rattling, classic undead.
- Damaged form: **Zombie** — when the Skeleton takes enough damage, it shifts into Zombie form. Flesh and rot replace bone. Different stats, different feel.
- This elegantly merges Skeleton (new) and Zombie (previously in roster but unassigned) into a single dual-form creature. The Zombie isn't cut — it's the Skeleton's other half.
- Design questions: Does Zombie form have different abilities? Is the shift reversible (heal back to Skeleton)? Is Zombie stronger or weaker — a desperation mode or a berserker mode?

### Zone Bosses

Every zone has a boss. The bosses aren't just big enemies — they each have a thematic relationship with their zone's creatures, and they're all *characters* with distinct personalities and visual identities.

| Zone | Boss | Relationship to Zone Creature |
|------|------|-------------------------------|
| **Town** | The Financier (Vampire) | Bloodsucking banker — drains you financially and literally |
| **Sewer** | Texas Beholdem | The horror even Wererats fear |
| **Circus** | Bigfoot | The alpha cryptid — king of the carnival creatures |
| **Graveyard** | The Deity (Beach Boy Surfer) | Wants the undead to stop denying death and join the ocean |
| **Factory** | Alien Invasion (Little Green Men + enslaved Greys) | Invaders who want the machines and the Goo |

---

### Boss Profiles

**The Financier — Vampire (Town — Bank Street)**
- A **vampire** who runs Bank Street. The Masquerade plays out in corporate culture, not a circus. Pale skin, expensive suit, old money, tinted windows, corner office that never sees sunlight. "Bloodsucking banker" made literal.
- **The Masquerade:** The vampires on Bank Street hide in plain sight behind handshakes, contracts, and NDAs. Nobody questions why the bankers are pale, why the offices have no windows, why meetings only happen after sunset. It's finance — everyone looks like that.
- **The Sunblock Scheme:** The vampires' master play. They lobbied the FDA to replace **sunblock** with cheaper **moonblock** — a product that does nothing. Two birds, one stone:
  1. **Humans can't go outside safely.** Without real sunblock, the sun burns people. Humans are forced to stay indoors during the day. The streets empty out. The vampires' natural enemy (sunlight-protected humans moving freely) is neutralized. Town during the day is a ghost town — everyone's hiding inside, and the vampires have the run of the place behind their tinted windows.
  2. **Vampires hoard the real sunblock.** They keep the actual sunblock for themselves. With real sunblock, vampires can walk in daylight — the one thing that's supposed to kill them. They flipped the script. Sunlight hurts humans now (no protection) and doesn't hurt vampires (they have the only supply). The natural order is inverted.
  3. **SunMan was collateral damage.** A kid used moonblock thinking it was sunblock. Got a catastrophic sunburn. Now he emits sunlight from his skin. The vampires' cost-cutting scheme accidentally created the one being who IS sunlight. They made their own worst enemy. (He doesn't know this yet.)
- **Power:** Economic, not physical. Deals, loans, leverage, hired muscle, compound interest that compounds YOUR blood. He doesn't fight you — he forecloses on you, sends collectors, raises prices, cuts you off.
- **Visual:** Immaculate suit. Slicked-back hair. Unnaturally pale. Red eyes behind designer glasses. Fangs visible only when he smiles (which is often — he's a banker, he's always closing). The office is gothic-corporate — mahogany, leather, dim lighting, no mirrors. A tube of real sunblock on his desk like a status symbol.
- **Encounter:** Bank Street is his turf. Confronting the Financier is a different kind of boss fight — economic warfare, social maneuvering, and eventually exposing the sunblock scheme. Finding and distributing real sunblock could weaken the vampires AND free the humans to go outside again.
- **Gameplay impact on Town:** Humans staying indoors because of the moonblock scam means Town feels empty during day phases. Indoor areas are crowded. Outdoor areas are dangerous (sunburn risk without real sunblock). Finding real sunblock is a key item — it protects you AND is the weapon against the Financier's power structure.

**Texas Beholdem (Sewer — Deep Sewer)**
- Lightly inspired by Xanathar from D&D, but **obsessed with the American Southwest**. Cowboy culture, desert vibes, tumbleweeds — in a sewer. He doesn't care that he lives underground in filth. In his mind, he's on the open range.
- **Pet:** A black armadillo. His precious companion. Don't touch the armadillo.
- **Signature weapon:** Holds a **royal flush** of poker cards in his **eyestalks** — one card per stalk. Throws them as projectile attacks. Each card is an eyestalk ability. The cards ARE his eye beams, reskinned as thrown poker cards. Five cards, five stalks, five abilities.
- **Visual:** Massive multi-eyed horror, but wearing a cowboy hat. Maybe a bolo tie. Eyes glow purple from the sludge. Each eyestalk grips a poker card, fanned out like a hand. The armadillo rides on him somewhere.
- Encounter location: Deep Sewer — the farthest, darkest part of the zone. His "saloon."

**Bigfoot (Circus — Deep in the carnival)**
- The biggest, most famous cryptid of them all. **The alpha of the carnival.** Bigfoot doesn't run the circus — Bigfoot IS the reason the circus exists. The clowns set up the carnival around Bigfoot. He's the main attraction, the origin, the center of gravity. Everything else orbits him.
- **Visual:** Massive. Towering. Classic Bigfoot — shaggy brown fur, huge footprints, glimpsed between tents. But this isn't a shy forest Bigfoot. This one has been in the carnival too long. He wears a tiny fez hat. Maybe a vest. He's been partially "civilized" by the carnival but he's still a wild, terrifying force of nature underneath the costume.
- **Personality:** Territorial. The carnival is HIS territory. He tolerates the clowns because they bring him audiences (and food?). But outsiders who go too deep into the carnival grounds — past the midway, past the sideshow, into the back where the REAL exhibits live — that's where Bigfoot is waiting. He doesn't perform. He presides.
- **Encounter:** You push deeper into the carnival than you should. The attractions get weirder. The clowns stop being funny and start being nervous. The footprints get bigger. Then you find him. The main event nobody was supposed to see.
- **Other cryptids:** Bigfoot is the boss, but the carnival is home to other Americana cryptids as lesser enemies/NPCs. The Circus is a cryptid menagerie disguised as entertainment. See the Cryptid Creature Table below.

---

### Circus Cryptid Creature Table

The carnival is a cryptid habitat. These are the creatures that live there — sideshow exhibits, carnival staff, and things that lurk behind the tents. Ranked by cultural popularity.

| # | Cryptid | Region | Description | Game Role | Pixel Art Notes |
|---|---------|--------|-------------|-----------|-----------------|
| 1 | **Bigfoot** | Pacific Northwest | 7-10 ft, shaggy brown fur, massive build, huge footprints | **BOSS** — the alpha. Wears a tiny fez. | Large sprite, simple silhouette. Brown fur + fez. |
| 2 | **Mothman** | West Virginia | 6-7 ft winged humanoid, glowing red eyes, dark grey body | Elite enemy. Appears before bad things happen — seeing Mothman means a trap or ambush is ahead. Warning system AND threat. | Wings + red eyes = strong 2-color identity. |
| 3 | **Jersey Devil** | New Jersey | Kangaroo body, bat wings, horse/goat head, cloven hooves, forked tail | Aerial enemy. Swoops, shrieks, hard to pin down on the tile grid. | Complex chimera — lots of sprite detail. Wings + horns + tail. |
| 4 | **Chupacabra** | Texas / Southwest | Small (3-4 ft), hunched, spiny ridge down back, fangs | Pack enemy. Drains Life on contact (blood drain). Fast, comes in groups. | Small, hunched, spiny. Simple sprite, scary in numbers. |
| 5 | **Wendigo** | Great Lakes / Northeast | Emaciated skeletal humanoid, antlered, sunken eyes, impossibly tall | Sub-boss or rare spawn. Hunger-themed — gets stronger the more you've lost. Terrifying. | Antlers + skeletal frame. Tall narrow sprite. |
| 6 | **Flatwoods Monster** | West Virginia | 10 ft tall, ace-of-spades shaped head, glowing eyes, metallic "dress" body | Stationary sentry. Emits noxious mist in a radius (Fun bar hazard). Hisses when you get close. | Geometric shape — perfect for pixel art. Ace-of-spades silhouette is iconic. |
| 7 | **Hopkinsville Goblins** | Kentucky | 3 ft tall, silver-grey skin, huge pointed ears, glowing eyes, long thin arms | Mob enemy. Swarm in groups, float/hover, bulletproof. The carnival's pest problem. | Tiny sprites, deploy in clusters. |
| 8 | **Hodag** | Wisconsin | Bull horns, frog head, dinosaur spines, saber teeth, thick claws | Aggressive territorial enemy. Guards specific areas. Cannot lie down (sleeps standing). | Colorful, monstrous. Horns + spines + teeth = busy but readable sprite. |
| 9 | **Dover Demon** | Massachusetts | 3-4 ft, huge watermelon head, enormous glowing orange eyes, thin fingers, no mouth | Passive/creepy NPC. Watches you. Doesn't attack. Just... stares. Seeing it ticks Fun bar (unsettling fun). | Big head, big eyes, stick body. Dead simple sprite, maximum creepy. |
| 10 | **Skunk Ape** | Florida | 6-7 ft, orangutan-like, reddish-brown shaggy fur, broad face | Tank enemy. Slow, strong, terrible smell (AoE debuff?). Florida's Bigfoot — a lesser version. | Shaggy brown/red sprite. Stink lines. |
| 11 | **Goatman** | Maryland / Texas | Half-man half-goat, horned, sometimes wielding an axe | Aggressive enemy near bridges and back paths. Weapon-wielding. Territorial. | Horned humanoid + axe. Clear readable sprite. |
| 12 | **Bunny Man** | Virginia | Man in a full rabbit suit wielding a hatchet | Slasher enemy. Fast, hatchet-throwing, terrifying. A guy in a bunny suit with a weapon. Perfect carnival horror. | Bunny ears + hatchet. Simple, iconic, disturbing. |
| 13 | **Rougarou** | Louisiana | Humanoid with wolf/dog head, hunched, clawed, tattered clothing | Night-phase enemy (if day/night exists). Swamp-wolf. Curses on hit? | Wolf head on human body. Tattered clothes detail. |
| 14 | **Wampus Cat** | Appalachia | Six-legged panther with a human-like face | Fast enemy. Six legs = extra movement per tick. Haunting scream stuns. | Six-legged cat is visually unique. Human face adds creep factor. |
| 15 | **Snallygaster** | Maryland | Dragon/bird/reptile hybrid, metallic beak, one eye, tentacles, bat wings | Aerial enemy. Silent flyer, snatches items from your inventory. Thief. | One-eyed dragon-bird. Distinctive silhouette. |
| 16 | **Honey Island Swamp Monster** | Louisiana | 7 ft, grey matted hair, ape-like, webbed feet | **Lore connection:** Origin story is a circus train crash — chimps escaped into the swamp. This one came HOME. | Grey ape with webbed feet. Tragic backstory NPC? |
| 17 | **Van Meter Visitor** | Iowa | Winged humanoid, glowing horn on forehead that emits light beam, three-toed feet | Special enemy. Horn beam = ranged light attack. Sulfuric stench AoE. | Bat wings + glowing horn. Strong silhouette. |
| 18 | **Jackalope** | Wyoming / Southwest | Jackrabbit with antelope horns | Passive critter / collectible. Harmless but fast. Catching one could be a side objective. | Tiny sprite — rabbit + antlers. Cute. |

### Design Notes — How to Use the Table

Not every cryptid needs to be in the game at launch. Prioritize by:
1. **Visual distinctness** — can you tell them apart as 16x16 or 32x32 sprites?
2. **Gameplay role** — does each one play differently? (swarmers, sentries, stalkers, tanks, thieves, watchers)
3. **Tier** — Bigfoot is boss, Wendigo/Mothman are elite, most others are regular enemies, Jackalope/Dover Demon are ambient creatures

**Recommended first pass (8 creatures for launch):**
Bigfoot (boss), Mothman (elite), Chupacabra (pack), Hopkinsville Goblins (swarm), Bunny Man (slasher), Flatwoods Monster (sentry), Dover Demon (watcher), Jackalope (critter)

**SunMan (Town — Tutorial NPC)**
- SunMan is the **first NPC you meet.** He's in Town. He teaches you the ropes — how to move, how to fight, how the world works. Your guide to Violencetown.
- **Origin:** Got a horrible sunburn as a boy. The Financier's vampire bankers lobbied the FDA to replace sunblock with cheaper **moonblock** — a cost-cutting move that saved them money and also conveniently weakened the one thing that could hurt vampires (sunlight protection for humans). SunMan's sunburn was a direct consequence. Instead of dying, he now **emits sunlight from his skin**. He IS the sun. The vampires' cost-cutting created their own worst enemy. He doesn't know this yet. The player can discover the connection and tell him — or not.
- **Visual:** Dressed like a **vampire hunter mixed with a superhero**. Long coat meets cape. Utility belt of stakes and garlic next to a glowing sun emblem. Dark goggles or a hood to contain himself when he's not on the job.
- **Role in Town:** He's a hero. He knows Violencetown is dangerous and he wants to help. He teaches you the basics, warns you about the zones, and has strong opinions about Bank Street ("Something's not right about those bankers. They never come out during the day."). He's your first ally and the narrative thread that connects you to the vampire problem on Bank Street.
- **Design note:** SunMan as tutorial NPC means the player meets a superhero vampire hunter BEFORE they know Bank Street is run by vampires. Seeds the plot early.

**The Deity (Graveyard — Manifests within)**
- Not a grim reaper. Not a skeleton god. **A beach boy surfer dude.** Laid back, chill, sun-bleached hair, board shorts, flip flops, maybe a shell necklace. He talks like a California surfer.
- **Philosophy:** Life is "the beach." Death is "the salty ocean." He wants everyone to have a chill time on the beach of life, and when it's your time, you paddle out into the ocean and become sea life again — fish, octopus, coral, whatever. It's beautiful. It's natural. It's the cycle.
- **Why he's angry:** The Skeletons and Zombies are **refusing to leave the beach**. They died. Their wave came. They were supposed to paddle out and become a nice little sea creature. Instead they're still standing on the sand, rotting, rattling, being undead. It's not chill. It's actually really uncool, bro.
- **Visual:** Surfer aesthetic in a graveyard. Board shorts and flip flops among tombstones. Carries a surfboard. Skin has that golden beach glow. But when he's angry — and he IS angry — the ocean comes with him. Waves, salt, seaweed, the crushing depth of the deep sea. The chill facade cracks and you see the cosmic force of the actual ocean of death behind the beach bro persona.
- **Tone:** Speaks casually, uses surfer slang, but what he's saying is terrifying. "Dude, you gotta let go. The ocean is so sick out there. You're gonna love being a fish. Come on, bro. Stop being dead wrong about being dead."

**Alien Invasion (Factory — Spaceship landing)**
- A **flying saucer** docked into the Factory. Classic UFO design fused with industrial architecture.
- **What they want:** The Goo. The Factory's toxic machines produce it. The little green men **eat it**. They came here specifically to steal it and set up a permanent feeding operation. The Factory is their buffet.
- **Little Green Men** are the commanders. Small, big-headed, smart, cruel. Comically greedy — think Glukkons from Oddworld but alien. They gorge on Goo, bully their slaves, and act like they own the place. They're the corporate villains of the Factory — boardroom tyrants who happen to be three feet tall and green.
- **Alien blaster guns:** Comical design — a **red button on top** of the gun with **yellow and black hazard stripes** around it. The little green men press the button with their tiny little finger to fire. It's absurd. The most dangerous weapon in the zone is operated by a little guy pressing a big cartoon button.
- **Grey Aliens** are large, powerful, and **enslaved** by the greens. They haul Goo barrels, operate dangerous machinery, and take the beatings. They're grey in every sense — grey skin, grey mood, grey lives. Living a completely grey existence. Everything about them is sad and colorless. "Why the long grey face?" Free them and they become your friends. They follow you, fight alongside you, and finally have something to not be grey about.
- **The rescue loop (Abe's Oddysee inspired):** Grey aliens are chained throughout the Factory. Free them with a simple follow/wait command system. Lead them to extraction points. Some are hidden in secret areas. The more you free, the weaker the green commanders become — their labor force dries up, their Goo supply chain breaks. Rescuing greys IS the path to beating the boss. You don't just fight the greens — you dismantle their operation by liberating their workforce.
- **Tone:** Dark comedy. The greens are pathetic bullies who think they're geniuses. The greys are sympathetic giants. The Factory is horrifying but also absurd — like Rupture Farms. Propaganda posters on the walls. Goo advertisements. "Employee of the Month" boards with grey alien mugshots (all looking miserable).

---

## Impact on Existing Systems

### What gets removed:
- Simplex noise biome generation (`map.js`)
- Chunk-based procedural generation
- Chunk regeneration timer (600-tick cycle)
- Era/seed-based deterministic generation
- The five noise-driven biomes (Stealville, Sludgeworks, The Glow, Downtown, The Outskirts)

### What stays:
- Tile rendering system (canvas, tile types, colors)
- Player movement on tile grid
- Tick system (pending ABC Category 1 decision)
- Save/load (simplified — no chunk cache, just player position + world state)
- Text log
- Ground items

### What needs to be built:
- Static map data (tile arrays for each zone, or a single large map file)
- Zone boundary definitions
- Zone-specific tile palettes and visual themes
- Map loading from authored data instead of procedural generation
- Potentially a map editor workflow (or just hand-edit tile arrays)

---

## Open Questions

1. **Map size:** How big is each zone? How big is the total map? Needs to feel explorable but not empty.
2. **Zone transitions:** Hard borders (walls/gates) or gradual blending?
3. **Sewer as underworld:** Is the Sewer a separate layer (underground) or a surface zone?
4. **Wererat transformation trigger:** What causes the Rat → Wererat shift? Combat? A cooldown ability? Health threshold? Moon phase?
5. **Creature population:** Do zones have NPC creatures of their type wandering around? (e.g., NPC skeletons in the graveyard, NPC clowns at the circus)
6. **Cross-zone creatures:** Can creatures from one zone wander into another, or are they bound to their home?
7. **Skeleton ↔ Zombie balance:** Is Zombie form stronger (berserker) or weaker (degraded)? Is the shift reversible by healing?
8. ~~Old creatures (Texas Beholdem, Smooth Talker)~~ — **RESOLVED.** Texas Beholdem → Sewer Boss. Smooth Talker → The Financier (Town Boss, Bank Street). Zombie → Skeleton's damaged form.
9. ~~Other zone bosses?~~ — **RESOLVED.** All five zones have bosses with full character profiles.
10. ~~Zone elements for remaining zones~~ — **RESOLVED.** All five zones have elements: Boredom (Town), Sludge (Sewer), Fun (Circus), Death (Graveyard), Goo (Factory). All interact with Life (HP) differently.
11. **Alien invasion timing:** Is the invasion always present, or is it an event that triggers? Does the Factory have a "normal" state before the aliens arrive?
12. ~~Sludge vs Goo gameplay~~ — **RESOLVED.** Sludge = slow + DoT. Goo = power up + speed up but costs Life per action. Completely different risk profiles.
13. **The Deity's ocean:** Does the Deity's presence bring actual water/ocean tiles into the Graveyard? Salt water flooding crypts, seaweed on tombstones? Could be a visual tell that the Deity is near or active.
14. **Boredom full bar:** Time skip is the current idea but needs design work. What does "time skips" actually mean mechanically? World changes around you? You teleport? NPCs act without you?
15. **Fun bar triggers:** What fills the Fun bar? Proximity to clown performances? Interacting with carnival games? Ambient in the zone? Can you avoid it or is it unavoidable?
16. **Fun Berserk specifics:** What random actions does your character do? How long does it last? Can the clowns trigger it intentionally as an attack?
17. **How to lower Fun, Goo, Death bars:** Sludge has soap+water, Boredom has spending money. What lowers Fun? Goo? Death? Each needs a scarce resource or action.
18. **Zone transitions and creature swaps:** When you cross from Town to Sewer, do you instantly become the Wererat? Transition animation? Do you keep items across zones? (Goo burns items — does that mean Factory items only?)
19. **Bar persistence:** When you leave a zone and come back, is the bar where you left it, or does it reset/decay?
20. **Soap as loot:** Is soap a common or rare item? Can you buy it in Town? Carry it into the Sewer? Or is it sewer-only loot?
