# Feature: Quest Journal — The Witness Log
**Phase:** Phase 2 — Life in the City
**Priority:** High (persistent consequences require persistent memory)
**Status:** Research (Gate 1)

> **Origin:** Gap analysis against early CRPG wiki structures (Arena, Battlespire, Redguard). Every one of those games shipped with quest information pages because they shipped with quest journals. Violencetown's "anthology episodes, persistent consequences" design pillar makes a player-facing record structurally necessary — without one, consequences accumulate invisibly and the player loses the thread.

> **Connects to:** `plans/cosmology-and-arc.md` (the narrative events this journal tracks), `plans/give-action-and-disposition.md` (disposition changes are journal-worthy events), `plans/sewer-npc-skeleton.md` (NPC barks and world-state changes are journal entries). Future connection to Lore Documents (collectible found documents pinned into the journal).

> **Design DNA constraint:** This is NOT a quest tracker with objectives and checkboxes. The locked tonal frame is "documentarian aesthetic — blurry photos, redacted memos, witness affidavits, found tape transcripts." The journal is Night Kid's **witness testimony** — what they saw, who they talked to, what changed. It's evidence, not a to-do list.

---

## Gate 1: Research & Discovery

### Genre References

1. **Outer Wilds** — The ship log. Tracks *discovered information*, not quest objectives. Each entry is a node; connections between nodes form a knowledge graph. The player's understanding of the world IS the progression. The log never tells you what to do — it shows you what you know. This is the single best reference for Violencetown's journal because it shares the same design pillar: knowledge as progression, not stat growth.

2. **Morrowind** — The journal is raw narrative text, not structured quest entries. "I met a woman named Caius Cosades in Balmora. He told me to join the Blades." No checkboxes, no objective markers. The journal reads like a diary. Players loved it AND hated it — beloved for immersion, hated for findability. Morrowind later patched in a topic-sort overlay. Lesson: raw narrative is the right base layer, but you need a secondary sort/filter for retrieval.

3. **Return of the Obra Dinn** — A logbook that records deductions. The player fills in identity + cause-of-death for each crew member. The game confirms when three entries are correct. The journal is a *puzzle interface* where accumulated evidence snaps into conclusions. Relevant for Violencetown's Cryptid Cards — each cryptid's card could be a journal page that fills in as you encounter evidence.

4. **Disco Elysium** — The Thought Cabinet. Ideas are "internalized" as gameplay modifiers. The journal isn't just a record — it's a *system*. Thoughts change your stats, unlock dialogue options, alter the world. For Violencetown, journal entries could eventually gate NPC conversations: "You know about moonblock. Jersey doesn't know you know." Defer the mechanical effects; the tracking is the foundation.

5. **Sunless Sea / Sunless Skies** — Journal entries accumulate as story fragments. Each port visit, each event, each officer interaction adds a short paragraph. The journal becomes a personal travelogue — same trip, different journal every playthrough. The anthology-episode model maps directly: each Violencetown scene adds its own fragment.

6. **Stick RPG** — The game Violencetown descends from had no journal at all. Actions happened, stats changed, and you remembered what you did. This worked because the game was small enough to hold in your head. Violencetown is already too large for that — five zones, six cast-spine NPCs, faction politics, element interactions, transformation unlocks. The journal is the affordance that lets the game be bigger than working memory.

### Player Experience Goal

> "You open the journal and it reads like a conspiracy board — torn pages, scratched notes, names circled in red. You don't remember writing half of it. But it's all true, and it's all connected, and now you can see the pattern."

### Technical Feasibility

**Affected modules:**
- `game/main.js` — Journal data structure. Event emission: game events (NPC encounters, disposition shifts, zone discoveries, item pickups of significance, boss defeats, transformation unlocks) emit journal entries. Journal persisted in save data.
- `game/ui.js` — Journal panel render. A dedicated view (toggled by a key, probably `[J]`) that displays entries. Needs scrolling, section headers, and eventually a filter/search.
- `game/npc.js` — NPC interactions that are journal-worthy emit entry events. First encounter with a named NPC, disposition threshold crossings, bark lines that contain lore.
- `game/data.js` — Journal entry templates per event type. Pre-authored fragments for key narrative beats (Opening Act steps, boss encounters, transformation moments). Generic templates for common events ("Met a [type] in [zone]").
- `game/renderer.js` — Optional: journal-entry notification on the game canvas (a brief flash or icon when a new entry is added, like Outer Wilds' "Updated" ping on the ship log).
- New file: `game/journal.js` — Journal class. Stores entries, handles deduplication, exposes query/filter API.

**Known constraints:**
- No save system exists yet (resets on reload). Journal entries are ephemeral until save/load ships. This is acceptable — the journal still serves within a single session, and the save system (Phase 5) will persist it. Same constraint as disposition, NPC state, chest contents.
- Journal entries must be deterministic given the game state — no RNG in entry generation. Same event, same entry text. This keeps the journal a reliable record.
- The journal should never spoil content the player hasn't reached. Entries are always retrospective ("You saw X") never prospective ("Go find X"). No objective markers.
- Text rendering on canvas is expensive for long entries. The journal panel should be DOM-based (HTML overlay), not canvas-rendered. This matches the existing status panel approach.
- Entry volume: if every NPC bark is a journal entry, the journal drowns in noise. Need a significance threshold — only events above a certain narrative weight get logged. First encounters yes, repeat barks no.

**What already exists:**
- Text log in `ui.js` — currently a scrolling message feed. The journal is NOT the text log; it's a curated subset. But the text log's event stream is the input pipeline for journal entries.
- NPC encounter tracking doesn't exist yet, but the FSM in `npc.js` (from sewer-NPC-skeleton) provides the hooks: state transitions, bark emissions, and adjacency detection are all events that can emit journal entries.
- The cosmology doc's Opening Act is a 11-step beat structure. Each beat is a natural journal entry.

### Scope — Minimum Viable Feature

**In scope for first ship:**

- `Journal` class in `game/journal.js`:
  - `entries: []` — ordered array of `{ id, timestamp (tick number), zone, category, text, related: [] }`
  - `addEntry(category, text, related)` — deduplicates by id (derived from category + key content hash)
  - `getByCategory(cat)` — filter entries by category
  - `getByZone(zone)` — filter entries by zone
  - `getRecent(n)` — last N entries
- Categories: `ENCOUNTER` (first meeting with a named NPC), `DISCOVERY` (entering a new zone or sub-area for the first time), `EVENT` (disposition threshold crossed, boss defeated, transformation offered/accepted), `LORE` (found document or significant examinable — placeholder for future Lore Documents feature), `NOTE` (player-authored, stretch goal)
- Journal entries emitted automatically by game events:
  - First NPC encounter: "Met [name] in [zone]. [one-line first-impression from NPC data]."
  - Zone first entry: "Entered [zone name]. [one-line atmosphere text from zone data]."
  - Disposition flip: "[NPC name] has come around. They're on your side now."
  - Boss defeat: "[Boss name] is down. [one-line aftermath]."
  - Transformation offered: "The [creature] form is available. Something in you could change."
- Journal panel: `[J]` key toggles a DOM overlay. Displays entries in reverse chronological order. Category icons (simple emoji or character markers) in the margin. Scrollable.
- Section headers group entries by zone or by session (separated by "—" dividers).
- New-entry notification: a brief `[!]` flash in the status panel when a journal entry is added, with the entry's first line shown in the text log.
- Journal data included in the save blob (when save system ships). Until then, ephemeral per session.

**Out of scope (explicit):**

- Knowledge graph / node connections (Outer Wilds-style). First ship is a flat list; graph view is a future layer.
- Player-authored notes. The player can't write in the journal yet — entries are system-generated. Manual notes are a future feature that pairs well with a "pin" or "star" mechanic.
- Mechanical effects from journal entries (Disco Elysium thought-cabinet style). The journal is read-only; it doesn't modify game state.
- Cryptid Card integration. Cryptid Cards will eventually be journal pages that fill in progressively. This requires the Lore Documents item type, which is a separate feature. The journal's `LORE` category is the forward-compatible hook.
- Quest objectives, waypoints, or map markers. The journal records what happened, not what to do.
- Voice/audio playback of entries.
- Filtering by keyword or full-text search. First ship: category filter and zone filter only.

### Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| **Journal floods with low-value entries.** Every minor NPC bark, every item pickup, every tile step generates noise. | High | Strict significance gate: only first-encounters, zone-firsts, disposition flips, boss defeats, and transformation moments generate entries. Repeat encounters do not. The journal is a highlight reel, not a transcript. |
| **Entries feel generic.** "Met a Bandit in Sewer" repeated 30 times. | High | Per-archetype first-encounter templates authored in `data.js`. Named NPCs get unique hand-authored entries (Jersey, Sun Man, Carrion, etc.). Generic entries use archetype + zone combination for variety ("A violet fungus was hauling soap through the mine. It didn't seem to notice you."). |
| **Journal panel obscures gameplay.** Full-screen overlay blocks the game while reading. | Medium | Journal panel is a side panel (right side, over the status area) or a modal that pauses the tick timer. Since the game is tick-based (not real-time), pausing during journal review is natural and expected. |
| **No save system means journal resets every reload.** Players lose their accumulated record. | Medium | Accepted limitation — same constraint as every other stateful system (NPC positions, chest contents, disposition). The save system (Phase 5) resolves this. In the meantime, the journal's value is within-session orientation: "what happened in the last 20 minutes." |
| **Entry text needs to be good writing.** Bad journal prose undermines the documentarian aesthetic. | Medium | Author key entries (cast-spine NPCs, boss fights, zone entries) by hand in `data.js`. Use templates with slot-fill for generic entries. Budget explicit writing time for the ~30 hand-authored entries needed for the opening act + sewer content. |

---

## Open Questions (For Gate 2)

1. **Tone of journal voice.** Is the journal written in Night Kid's voice (first person, colloquial) or in a neutral documentary voice (third person, clinical)? First person is more immersive; third person is easier to template. Recommendation: first person for hand-authored entries (cast-spine moments), third person for system-generated ones. The tonal shift is acceptable — Night Kid writes about important things, the "record" captures the rest.

2. **Journal as conspiracy board.** Should the journal eventually support a spatial/visual layout — entries as pinned notes on a board, with red string connections? This would be the ultimate expression of the documentarian aesthetic AND the Outer Wilds knowledge-graph concept. Massive scope, but worth keeping as a north star.

3. **Lore Document pinning.** When the Lore Documents feature ships, found documents should appear as journal entries with an expanded view (click to read full text). This means journal entries need a `detail` field for long-form content, in addition to the one-line `text`. Add the field now even if nothing populates it yet.

4. **Per-creature journal perspectives.** When the player transforms, does the journal voice change? Wererat Night Kid might note different things than Human Night Kid. This is expensive (per-creature entry variants) but powerfully expressive. Connects to the locked design principle: "per-character map variation — same map, different witness."

5. **Session dividers.** If save/load ships, the journal spans multiple play sessions. Should sessions be visually separated? ("— Session 3, 2026-05-22 —") or is the journal a continuous narrative with no meta-awareness of sessions?

6. **Entry cap.** What happens after 500 entries? 1000? Infinite scroll? Pagination? Auto-archive old entries into a "cold storage" section? Probably not a problem for v1 (sewer content generates ~20-30 entries per session), but needs a plan before world expansion.

7. **The text log relationship.** The text log is the real-time feed; the journal is the curated archive. Should the text log have a "pin to journal" action? Or should curation always be automatic? Manual pinning gives the player agency over what matters; automatic curation is zero-friction. Probably: automatic for system events, manual pin for "that NPC bark was interesting and I want to remember it."
