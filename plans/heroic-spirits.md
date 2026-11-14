# Heroic spirits — the autoplay's runs, seen in the world

## Goal

Every autoplay run becomes a **heroic spirit**: a named, read-only record of what one hero did each
turn and how it ended. Spirits never touch the physical world — no collision, no items, no draws on
`game.rng`, no effect on balance — and they are shown only where they teach something, such as a
spirit's last turns replayed at the door of the boss that killed it.

The autoplay keeps testing exactly as it does now. Its runs become content as a by-product, and the
sim's 150 runs a check become something Caelan can *watch*: a hero that cheeses a boss from one
doorway, or that never takes the side route, shows up on screen long before it moves a score.

## A spirit record

| Part | Holds |
|---|---|
| Identity | The hero it belongs to and which attempt it was (the seed). A hero is a named inclination — every seed the fighter plays is one more attempt by the same hero — so a few recurring heroes fill the world, not 150 strangers |
| Provenance | Seed, script, game version, a hash of each zone map it walked, the sim baseline it came from |
| Track | One row per turn: map, x, y, facing, action kind, HP, target id. **State, not key presses**: a track is drawn, never re-simulated, so it cannot desync and cannot touch the dice |
| Outcome | Cleared or fell; the turn; the quest stage; what killed it |
| Anchors | Three to five remembered facts ("Paul Bunyan fell to the Sewer's boss on turn 41, attempt 37"), kept as data (`kind`, `turn`, `map`, `who`) so the words are written where a spirit is shown. A rival (`game/rivals.js`) could later say the same kind of thing in the same shape |
| Knowledge | 0-3 per enemy, zone and quest, counted from the track's kills and clears |

Measured on seed 1: Paul Bunyan's quest run is 118 rows, about 15 KB of plain JSON; Amelia
Earhart's loops run is 73 rows, about 7 KB. Packed rows would be a tenth of that if a set ever
needs to ship small.

## Rules

1. **Recording is passive.** With the recorder on, a run draws `game.rng` exactly as often and ends
   on exactly the same fingerprint as with it off. `autoplay:check` and `sim:check` show no drift.
2. **Showing a spirit never draws `game.rng`.** Which spirit shows, and any shimmer, comes from its
   own hash-keyed stream (the way CK2's away news does) or from none.
3. **The goldens stay as they are.** The spirits players see come from a separate harvest, which
   may play with more inclinations and with mistakes switched on. Nothing tuned to make spirits
   nicer to watch goes into the shared `decide()` that the autoplay tests with.
4. **A spirit set belongs to a sim baseline.** When the baseline is re-recorded, the set is
   harvested again. A spirit whose zone map hash no longer matches stops showing its track; its
   outcome line and anchors stay, as history.
5. **Show few, at the decision point, and prefer the ones that failed** at the stage the player has
   reached. A death warns about the fight; a clean clear spoils it.

## Slices

1. **The recorder.** `game/spirits.js` (pure, node-tested): build a track row from a plain view of
   the game, build a record from a finished run (name, outcome, anchors, knowledge). `run.js` keeps
   the structured track beside its existing flight-recorder `trace`, uncapped, and puts the record
   in the report. The heroes of HS-R1 who play an existing script are named here. No UI.
1b. **The gate's evidence.** `diffSpirits` names the first track row where two spirits of the same
   run part, the outcome fields that changed, and the anchors lost, gained or moved.
   `autoplay:write` records the golden runs' spirits in `tools/autoplay-spirits-golden.json` (a
   golden by name, so the loop guard protects it); `autoplay:check` prints the diff under any drift,
   or `spirits match`. Evidence only: pass or fail stays the golden's. Planted check: Fireball
   20 -> 19 names each hero's first changed move (Paul Bunyan's row 64: the cast lands on the
   Wererat, not a Violet Fungus), his falls going 2 -> 4, and the clear moving from turn 105 to 120.
2. **The harvest.** A tool that plays the harvest runs and writes the curated spirit set (map
   hashes included) next to the sim baseline. Mary Shelley's caster inclination arrives here. A test that retires a track whose map hash moved, and
   that a replayed track never stands on a tile that is no longer walkable — a free map-drift check.
3. **First sight: the boss door.** A spirit that died to the zone's boss replays its last few turns
   when you step up to that boss's door, drawn faint, opt-in. Touches the renderer and `main.js`.
4. **The hub.** A roster of spirits in the Town and a notice board of one-line outcomes (building on
   CK2's news line); an all-attempts montage after a stage is cleared; your own runs kept as
   "past self" spirits.

Live heroes — spirits that act in the world — are not this branch.

## Acceptance (slice 1)

- `npm test` passes, with new tests for the row and record builders. The recorder's test hands it a
  game whose `rng` throws if drawn from.
- `npm run autoplay:check` passes with no drift.
- The report of a quest run carries a spirit record whose track has one row per action the hero
  took, a row for each fall and each foe felled, and whose outcome matches the report's `finished`
  and `deaths`.
- The naming grep returns zero lines.

## Overlaps with unmerged branches (11-13)

- `feature/ah1-bots-carry-food` edits `game/autoplay/player.js`. Slice 1 does not touch it.
- `feature/sim-baseline-refresh` re-records `tools/autoplay-sim-baseline.json`. The harvest
  (slice 2) lands after it.
- `feature/ck2-away-city-news` adds the news line the notice board (slice 4) builds on.
- `feature/ne2-rival-title` changes how rivals read; anchors follow the rival record's shape.

## Rulings

- HS-R1 (11-13): The first heroes are **Paul Bunyan**, **Johnny Appleseed**, **Mary Shelley** and
  **Amelia Earhart**.

## Open questions

- HS-Q1: Which hero plays which? The lean:
  - Paul Bunyan: the fighter (`quest`), the axe straight through.
  - Johnny Appleseed: the sneak (`sneak`), the wanderer who walks around trouble.
  - Amelia Earhart: the everyday loops (`loops`), the traveller who crosses every zone.
  - Mary Shelley: a new caster inclination, spells before steel. It exists only in the harvest
    (rule 3), so it adds a hero without touching the goldens.
- HS-Q2: The first thing players see: the boss-door replay (the lean) or the Town roster?
- HS-Q3: Your own runs as "past self" spirits: on by default, or opt-in?

## Out of scope

Spirits acting in the world, any language model, final copy, and spirit art (drawn as canvas
primitives first).
