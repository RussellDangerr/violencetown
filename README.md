# Violencetown

A browser-based 2D action-RPG of small violences, set across a hand-authored, directional world — built as a systems-design playground in **zero-dependency vanilla JavaScript**. No engine, no build step: open a file and play.

**▶ Play it live: [violencetown.russelldangerr.com](https://violencetown.russelldangerr.com)**

`Vanilla JS (ES modules)` · `HTML5 Canvas` · `zero dependencies` · `no build step` · `installable PWA`

<!-- SCREENSHOT SLOT — replace the blockquote below with a real capture, e.g.  ![Violencetown](docs/hero.gif) -->

---

## Why it might be worth a look

Violencetown is a small game with deliberately deep systems. The interesting part isn't the content (yet) — it's the machinery:

- A **turn-based world on one clock**: one input = one action = one world-tick, so combat, moods, the day/night cycle and every random roll advance only when you act. Townsfolk keep wandering while you stand still, on their own dice, so how long you think can never change an outcome.
- A **radial action wheel** driven by a pure state machine, where a single function is the source of truth for *"which tiles does this action hit"* — read identically by the highlight, the friendly-fire confirm, and the damage resolver.
- A **disposition economy**: every NPC carries one mood scalar that gifts, bribes, and dialogue all move through a single seam; cross a threshold and an enemy flips into an ally that fights for you — and that same scalar prices what a merchant charges.
- **Determinism by construction**: all randomness flows from one seeded generator, so a run is reproducible and resumable.

If you're evaluating how I think about systems, product, and architecture, the [Design notes](#design-notes) are the quickest read; the code in [`game/`](game/) backs them up.

## How this was built

I ([Caelan Gander](https://github.com/RussellDangerr)) designed the game's systems and made the architecture and product calls — the wheel grammar, the disposition/economy model, the zero-dependency "no build step" constraint, the scope decisions. **Claude Code** (Anthropic's agentic coding CLI) did a large share of the implementation, working under that direction with tight review loops.

I'm calling that out plainly rather than implying solo from-scratch engineering: directing AI coding tools well — while owning the design, the architecture, and the tradeoffs — is a real part of how this was made, and a skill I care about. The design docs under [`plans/`](plans/) are the paper trail — option matrices, risk analysis, and the four-gate pipeline the work followed.

## Run it locally

No install, no build, no dependencies.

```bash
git clone https://github.com/RussellDangerr/violencetown.git
cd violencetown
python dev-server.py 3001      # serves game/ at http://localhost:3001/
```

Or just open `game/index.html` directly in a browser. The dev server is only needed for live-reload while developing (it disables module caching so edits show on reload) — the game itself is plain static files. It's also installable as a **PWA** for a full-screen, offline app.

## Design notes

The systems most worth reading, and the reasoning behind each.

### 1. The radial action wheel — one grammar, one source of truth
[`game/wheel-model.js`](game/wheel-model.js) is a **pure state model** (no DOM, no canvas): a node tree `MENU → categories → verbs → leaves`, walked by exactly one grammar — *cycle* (rotate the active ring), *drill* (push into a child / aim / fire), *back* (pop). Per-ring cursor memory means re-entering a ring lands where you left it.

The load-bearing decision: a single function, `affectedTiles`, computes which tiles an action hits — and the on-screen highlight, the friendly-fire confirmation, and the damage resolution **all read from it**. They can't disagree, because there's only one answer. Keeping the model DOM-free also makes it unit-testable in plain Node, no browser required.

### 2. The disposition / trade "transaction spine" — one scalar, many verbs
Every NPC carries a `disposition` value (−100…+100). Gifts (weighted by what that NPC values), flat bribes, and dialogue choices **all move it through one seam** — `reactToTransaction` in [`game/give-action.js`](game/give-action.js). Cross `flipThreshold` and a consequence fires: the NPC drops hostility and joins your side, or a merchant opens a discount. That *same* scalar buckets into eight price bands in [`game/trade.js`](game/trade.js) that set what you pay — with a deliberate spread so flipping items for profit is never free money.

The reasoning: "social" and "economic" behaviour are usually separate systems. Here they're two readers of one number, which keeps NPC relationships legible (one meter, shown as a mood face above their head) and the whole economy internally consistent.

### 3. Throw-resolution — respect the target, share the geometry
Thrown consumables (`resolveThrow` in [`game/items.js`](game/items.js)) fly straight or land on a reticle-chosen tile, then **burst over a 3×3 area at half effect** — damage hits hostiles only, heals touch friendlies only, with an explicit exception when you deliberately aim a heal at a friendly through the confirm gate. Crucially, the burst tiles come from the *same* `affectedTiles` geometry the wheel's highlight uses, so the preview you see is exactly what resolves.

### 4. The fight HUD — the dock has two faces, and the dial has a cell

A fight already changes the world: one flag (`game._fightOn`) drives the **fog of war** over everything the fighters can't see. The HUD reads that same flag. The bottom dock keeps its geometry to the pixel and swaps only its *contents* — the quest log becomes a **combat log**, and two read-only panels fade in over the fogged margins: your six equipment slots on the left, on the right the enemy's HP, gold, carried kit, and which of Coin / Kit / Gear you could actually steal. Nothing in the fight HUD can equip anything; it exists so you never feel the need to go and check, which is the same reason tabletop RPGs make swapping armour mid-fight expensive.

Two details that are the interesting part. The two panels are deliberately **not** mirror images — you have six named body slots, an enemy has a flat loadout and a gold number, so faking symmetry would invent structure the game doesn't have. And the "what could I steal" question is answered in exactly one function, read by both the wheel (which greys the branches you can't use) and the panel (which says why) — so they can't drift apart.

The wheel's dial is **laid out, not just drawn**: `hudLayout` reserves it a column of the dock that nothing else may enter, and the HUD's non-overlap invariant covers the open wheel across a table of viewports — which is how the dial stopped landing on the message log on tall screens.

### 5. The autoplay — an eval that owns the clock

`npm run autoplay` plays quest 1 by itself in headless Chrome: a scripted "standard player" walks to the car, goes down into the sewer, fights, and either finishes or says exactly why it didn't. Every run is scored per quest stage (turns, HP lost, hits, deaths) against a committed golden, so a balance change shows up as numbers moving rather than as a bug found weeks later. No dependencies: Node's built-in `WebSocket` drives the Chrome DevTools protocol directly.

The interesting part is why it needed its own clock. Every random roll already went through one seeded generator, so a seed *should* have replayed a run — and it didn't. The town's ambient life runs on a wall-clock heartbeat and spends that generator on where people wander, so how long the page took changed the outcome: same seed, no input, a different end state depending on how long you waited. The fix is a virtual clock installed before the game boots (`performance.now`, timers, animation frames), which the autoplay advances and freezes while a map loads. With it, three runs with random real-world pauses end in one identical state; a control run on the real clock ends in three. The same timeline plays headless at about 3× real time or paced for watching, so the run you watch is the run the check scored.

Its first findings were real ones, and each became a fix:

- **The fight was a wall.** The standard player — wooden sword, heal when low, fight what's beside you — cannot get past the Fungus King. That is by design: the King is meant to be snuck past.
- **But nothing could be snuck past.** A second player sneaks, routing by the enemies' own vision rules (a tile in someone's sight cone costs forty steps of detour), and it proved the sewer as built had no unseen route: from the entrance, hidden ground reached two tiles. Turning two sentries to face away opened one, and a test now pins that it stays open.
- **A boss hit from the side never fought back.** Noise from each blow reset the enemy's alertness, so a flanked boss sat frozen through twelve hits. Now a blow tells its victim where you are, and it turns to face you.

A level-design question and an AI bug, found by a test rather than a playtester — and every fix showed up in the check as numbers moving, before it was recorded as the new baseline.

### 6. Hit splats and the cascade — the order is the joke

A fight here is meant to be slapstick: everyone messing each other up, plans ruined by whoever moves first. Turn-based games resolve a round in some order even when it looks simultaneous — RuneScape's tick, Pixel Dungeon's actor queue — and Violencetown's enemies already acted one after another; they just all *drew* in the same 150 ms, which flattens the joke. Behind `?turns=cascade`, the enemy phase plays back one actor at a time, ~130 ms apart: each attacker lunges on its own beat, your HP bar drops blow by blow, and any key plays the rest at once, so it never makes you wait.

The interesting part is proving it changes *nothing* but timing. Every random roll the game spends in a blow — which way you stagger, how a word scatters — is rolled at the hit, not when the effect plays, so the seeded generator hands out the same numbers with the cascade on or off. A unit test pins that against the real damage function and fails if any roll moves into the held effect; and the quest-1 autoplay, run with the cascade on, matches its recorded golden exactly.

The splats were rebuilt around legibility: each damage type is its own pixel silhouette (a burst, drips, bubbles, flames, a crystal, a spark, a heart) drawn by a generator script that reads the game's own colour table; the digits sit in a body sized to the number; several on one target are laid out by *how many* there are — one centred, then a stack, a triangle, the compass points — above the head and growing upward; and while a splat is up, the head space is its own, so the HP bar and speech balloons step aside and return with the new value. The layout rules are pure functions with a no-overlap invariant tested across every count, crits and four-digit numbers.

Then four AI agents played the branch headless in parallel — the cascade, the splats, a flag-off regression sweep against `dev`, and odd viewports — each reproducing every finding twice. They confirmed nothing changed an outcome, found six cascade bugs (all fixed), and turned up an older one worth the whole exercise: an enemy killed by its own poison at the start of its turn still took that turn, and its death was never handled — so a poison finish on the Were-Rat dropped no catalytic converter, and quest 1 could not be won.

### 7. One clock — thinking time changes nothing

The autoplay (§5) exposed a deeper problem than replay: out of a fight, a half-second timer still moved the day, faded every NPC's mood toward neutral, and walked the townsfolk with the same random generator that rolls fights and thefts. Standing still changed the world, and so did the time you spent deciding — a slow thinker met different dice. The fix makes the player's committed action the only clock: the day is 600 actions long and saved with the game, moods fade every 40 actions, and pause really pauses. The town keeps its look of life — people still wander on the timer while you stand there — but wander now draws from a stream of its own, so it can never touch an outcome's roll. A held walk also stops the moment a fight starts or someone notices you, so walking can no longer carry you through enemy blows.

Proving it was the interesting part. The autoplay's numbers moved, and "it changed" is not a result: switching each change off in turn showed that the whole difference came from the dice split — wander had been spending fight rolls between actions — while the new day clock and mood fade moved nothing. Only then was the new baseline recorded.

More system write-ups (combat feel, zone pursuit, the poisons) live in [`plans/`](plans/).

## How it works (mechanics)

- **Turn-based:** one input = one action = the world advances a turn. Firing a wheel action is your turn; waiting (`T`) and item use cost a turn too.
- **Hand-authored, directional world:** the Street (hub) sits at the center, its only way out — a **bridge north** — blocked until your car runs. The **Sewer** lies east, the **Factory** (home to Puck, a friendly trader) west, and a southern chain runs **Carnival → Graveyard → Wilderness** (a pitch-black, too-dangerous border). You travel by walking into a zone's edge.
- **Combat:** the wheel's verbs resolve over flat HP, flat damage, and flat armor reduction — no dice, no misses. Hits pop **typed hit-splats** — a pixel silhouette per damage type — laid out above the target by how many have landed.
- **The HUD knows you're fighting:** the dock swaps its quest log for a **combat log** and two read-only gear panels appear over the fogged edges of the world — yours and the target's — and go again when the fight does.
- **NPCs & the disposition economy:** every NPC runs a finite-state machine (idle / wander / work) over the disposition value above. **Puck**, in the Factory, runs a **shop** (`E` to open) with disposition-driven prices.
- **Zone pursuit:** flee a fight through a door and the hostiles on your heels **follow you into the next zone**. Wedge the **[pipe]** into the door to jam it and buy a reprieve.
- **Seeded RNG & save:** all gameplay randomness comes from one Mulberry32 generator (deterministic, resumable), with a versioned localStorage save (atomic write + one backup slot). `CONTINUE` on the splash resumes your last session. No accounts.

## Controls

Keys are **modal** — the same key means different things depending on what's open. `Tab` is the clearest case: it opens the Remoticon from the world, and pockets it again from inside.

**In the world**

| Key | Action |
|-----|--------|
| W A S D / Arrows | Press toward a *new* facing to **turn in place**; press the way you're already facing (or keep holding) to **walk**. Hold two directions to move diagonally. Items are picked up automatically. Walk into a zone's edge to travel. |
| Space | Open the **action wheel**, pre-aimed at the nearest enemy. Double-tap to repeat your last action. |
| Tab | Open the **Remoticon** (your device) on the ITEMS tab |
| C / J / M | Jump straight to the Remoticon's **Gear**, **Quests**, or **Map** tab |
| Shift + ←→ / ↑↓ | Drive the **usable bar** along the bottom — `←→` changes category, `↑↓` steps through items |
| Enter | Use the item currently showing on the usable bar |
| 1–9 | Select an inventory slot |
| F | Open the **verb menu** for whatever you're facing (attack, talk, trade, examine…) |
| E | **Trade** with an adjacent vendor, else **talk** to an adjacent NPC, else **examine** what you face |
| T | Wait one turn |
| L | Message-log history |
| P | Pause |
| ? | How-to-play (works anywhere) |
| Esc | Cancel / close whatever is open |

**In the action wheel** — one grammar, three keys. It's a menu tree, not a set of rings you pick between.

| Key | Action |
|-----|--------|
| ← → (or A D) | Spin the current ring |
| ↑ / W / Space / Enter | Go **deeper** — and firing an action is just drilling into it |
| ↓ / S / Esc | Back **out** one level; closes the wheel at the top |
| Arrows, while aiming | Nudge the reticle tile by tile |

When an action would catch a friendly, the wheel asks first: `↑` confirms, `↓` cancels.

**In the Remoticon** — `Tab` or `Esc` pockets it, `[` `]` (or `←→`) cycle tabs, and `C` `J` `M` `R` jump to Gear / Quests / Map / Rings.

**Touch and mouse.** Tap the ground to path there — the only route that walks more than one tile at a time. `✦` opens the wheel and fires it (it's hidden on desktop, where `Space` does the job); `▤` opens the Remoticon, `☰` the menu. In-canvas panels are tapped directly.

Two asymmetries worth knowing: **the Remoticon's item, gear and ring actions are pointer-only** — there's no keyboard cursor inside it yet — while **aiming the reticle, turning in place, and the 1–9 hotbar are keyboard-only**.

## Project structure

```
game/
  index.html        # Game page (splash + UI shell)
  main.js           # Game class: loop, input, state machine, combat dispatch, save hooks
  renderer.js       # Canvas rendering — world, HUD, modals, hit-splats, lighting
  wheel-model.js    # Pure state model for the radial action wheel (see Design notes)
  map.js            # Map loader, tiles, transitions, regions
  *-map.json        # Hand-authored zones (town, sewer, factory, carnival, graveyard, wilderness, interiors)
  world-map.js      # Zone graph for the Remoticon's MAP tab
  sewer-setpiece.js # Hand-scripted sewer encounter
  data.js           # Constants + tile definitions
  items.js          # Item defs; equip / use / throw resolution
  weapons.js        # Weapon defs + their wheel verbs
  inventory.js      # Pure bag model — stacking, zone routing (safe vs pack)
  inspector.js      # Item stats, verbs, and gear-swap deltas
  drops.js          # Loot tables + what breaks on defeat
  combat.js         # One damage pipeline — flats add, categories multiply, armor last
  buffs.js          # Timed modifiers
  enemies.js        # Enemy class, line-of-sight, enemy-turn resolution, challenge GP
  ai.js             # Allegiance + hostility predicates (the one source of truth)
  npc.js            # NPC finite-state machine (idle/wander/work)
  pathing.js        # Greedy chase + BFS pathfinding
  give-action.js    # Disposition / bribery / ally-flip (see Design notes)
  trade.js          # Shop / barter pricing — disposition bands (see Design notes)
  quests.js         # Data-driven quest engine
  dialogue.js       # NPC dialogue tables
  examine.js        # Layered examine text
  spells.js tricks.js # Wheel-granted abilities
  rings.js ring-data.js # Remembrance rings — sockets and their effects
  defeat-scenarios.js # What happens when you lose (instead of a game-over)
  save.js           # Versioned localStorage save/load
  rng.js            # Mulberry32 seeded RNG
  utils.js          # Shared helpers
  audio.js          # Procedural Web Audio SFX + ambient bed
  settings.js       # Options / accessibility store
  xmb.js            # Model for the always-on usable bar
  sprites.js layout.js ui-sprites.js bitmap-font.js  # Rendering support (sheets, rects, panels, font)
  content-validate.js # Startup sanity checks on authored content
  assets/           # First-party procedural atlases (font, UI panels) + VT323 font
  assets-placeholder/kenney/  # Curated Kenney CC0 sprite sheets (with their license)
  manifest.webmanifest sw.js  # PWA manifest + offline service worker
dev-server.py       # No-cache dev server (serves game/)
tools/              # Asset generators (font, UI panel, PWA icons)
plans/              # Design docs — feature briefs, research, decision matrices
tests/              # Zero-dep Node test suite (node --test)
GAME_STUDIO_PLAN.md # The four-gate development pipeline
```

## Development

Feature work follows the four-gate pipeline in [`GAME_STUDIO_PLAN.md`](GAME_STUDIO_PLAN.md); phase goals live in [`ROADMAP.md`](ROADMAP.md) and per-feature briefs in [`plans/`](plans/). There's a zero-dependency Node test suite under [`tests/`](tests/) (`node --test`) covering the core logic (combat, pathing, wheel model, save round-trip, quests), and a headless autoplay (`npm run autoplay:check`) that plays quest 1 end to end against a scored golden.

## License

[MIT](LICENSE) for the project's own code. Third-party assets:

- **Kenney** sprite packs — CC0 1.0 (public domain) — in `game/assets-placeholder/kenney/`, under the license bundled there.
- **VT323** font — SIL Open Font License 1.1 — in `game/assets/fonts/`.
