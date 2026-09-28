# Violencetown Game Studio Plan

> A structured feature development pipeline modeled after indie game studio best practices.
> Every feature ships through four gates: **Research, Design, Development, and Polish.**

---

## Mobile-First Planning Workflow

**Planning happens on mobile. Development happens on desktop.**

When a planning or design conversation happens in Claude Code (especially on mobile), every plan, feature spec, or design decision must be **committed and pushed immediately** — not held in conversation context. The assumption is:

1. Planning sessions happen on **Claude Code mobile** while away from the desktop.
2. Every plan, research brief, feature template, or design document gets written to a file, committed, and pushed **before the conversation ends**.
3. When returning to the desktop, all planning artifacts are already in the repo and ready to drive development.

**Rule: If it was discussed and decided, it gets committed.** No plan lives only in chat history. Conversations are ephemeral — the repo is the source of truth.

This applies to:
- New feature plans (use the Feature Template below)
- Updates to existing plans or the ROADMAP
- Research findings and design decisions
- Scope changes, priority shifts, or architectural decisions
- Any "let's do X" that should survive the session

**File locations:**
- `GAME_STUDIO_PLAN.md` — This process document
- `ROADMAP.md` — Phase-level goals and milestones
- `plans/` — Individual feature plans (one file per feature, e.g., `plans/fight-fog.md`)

---

## How to Use This Document

Each feature in Violencetown (NPC systems, combat, inventory, stealth, taxi mechanics, etc.) follows this pipeline before it ships into a playable build. Copy the **Feature Template** at the bottom for each new feature, fill it out phase by phase, and track it through to completion.

This process is designed for a small team (or solo dev with AI-assisted development) — it borrows from industry workflows used by studios like Supergiant Games, Team Cherry, and ConcernedApe, scaled down to stay lean without sacrificing quality.

---

## The Four Gates

### Gate 1: Research & Discovery

**Purpose:** Understand the problem space before writing a single line of code. Prevent scope creep and reinventing the wheel by studying what already works.

| Step | Description |
|------|-------------|
| **Genre Analysis** | Study 3-5 games that implement a similar feature well. Document what works, what doesn't, and why. Focus on games in the same genre (roguelikes, tactical, procedural). |
| **Player Experience Goal** | Write a single sentence describing the *feeling* the feature should create. (e.g., "The player should feel like every alley could be an ambush or an escape route.") |
| **Technical Feasibility** | Identify constraints from the current codebase — what systems exist, what needs to be built, what might break. Review the module that will be most affected. |
| **Scope Definition** | Define the Minimum Viable Feature (MVF) — the smallest version that delivers the player experience goal. Explicitly list what is OUT of scope for this pass. |
| **Risk Assessment** | Identify the top 3 risks (technical, design, or schedule) and a mitigation plan for each. |

**Exit Criteria:** A short research brief (1-2 pages) that the team reviews before any design work begins. No code yet.

**Why this matters:** Post-mortems from failed indie studios consistently cite scope creep and overambition as the #1 killer. This gate forces you to define boundaries *before* momentum builds. Studios like Supergiant (Hades) are known for extensive pre-production research — studying player feedback loops and genre conventions before committing to implementation.

---

### Gate 2: Feature Design & Integration Blueprint

**Purpose:** Design the feature end-to-end with full awareness of how it integrates with every existing system. No surprises during development.

| Step | Description |
|------|-------------|
| **System Design Document** | Describe the feature's data structures, state management, and core logic. Include pseudocode for the main loops. For Violencetown: how does it interact with the tick system? The chunk loader? The player state? |
| **Integration Map** | Draw a dependency diagram showing which existing modules (`main.js`, `player.js`, `map.js`, `data.js`, `ui.js`, `utils.js`) are touched and how. Flag any modules that need interface changes. |
| **Data Schema** | Define new entries for `data.js` (tiles, items, NPC definitions, loot tables). Specify the exact shape of any new objects. |
| **UI/UX Specification** | Sketch the visual representation — canvas rendering, panel updates, log messages, player feedback. Specify exactly what the player sees and when. |
| **Save/Load Impact** | Define what new state needs to be persisted to LocalStorage. Plan for backwards compatibility with existing saves (version the save schema, provide defaults for missing fields). |
| **Edge Cases & Failure Modes** | List at least 5 edge cases. What happens at chunk boundaries? What if the player dies mid-action? What if two systems conflict? |
| **"Done When" Scenario** | Write a concrete play scenario (like the ROADMAP.md "done when" entries) that proves the feature works end-to-end. |

**Exit Criteria:** A design document reviewed and approved before development begins. Any blocking questions resolved.

**Why this matters:** The Technical Design Document (TDD) is industry-standard in both AAA and successful indie studios. Team Cherry (Hollow Knight) is known for tight system integration — every mechanic feeds into the core loop. Designing the integration map upfront prevents the "it works in isolation but breaks everything else" problem that plagues game development.

---

### Gate 3: Development & Quality Engineering

**Purpose:** Build the feature with a focus on stability, security, and zero regression. Ship code you'd be proud to maintain a year from now.

#### Development Standards

| Practice | Description |
|----------|-------------|
| **Branch Strategy** | One feature branch per feature (`feature/npc-combat`, `feature/inventory-grid`). Short-lived — merge within days, not weeks. |
| **Incremental Commits** | Small, descriptive commits. Each commit should leave the game in a playable state. Never commit broken builds. |
| **Module Boundaries** | Respect the existing module architecture. New systems get new files. Existing modules are extended through clean interfaces, not monkeypatched. |
| **Defensive Coding** | Validate data at system boundaries (chunk loading, save/load, player input). Trust internal module contracts. Don't over-validate internal calls. |

#### Quality Checklist (per feature)

- [ ] **No Regression:** All existing features still work. Walk the map, use the tick system, verify biome generation, check save/load round-trip.
- [ ] **Performance:** No visible frame drops or tick timer stuttering. Chunk loading remains smooth at the 5x5 radius.
- [ ] **Save Integrity:** New state serializes and deserializes correctly. Loading an old save (without the new feature's data) doesn't crash — defaults are applied gracefully.
- [ ] **Input Handling:** New controls don't conflict with existing keybinds. Action queue behaves correctly with new action types.
- [ ] **Edge Cases:** Chunk boundary behavior tested. Rapid input tested. Pause/resume tested. Death/respawn with new feature state tested.
- [ ] **Memory:** No leaks from event listeners, canvas operations, or chunk cache growth. Verify with browser dev tools.

#### Security & Stability Considerations

| Concern | Approach |
|---------|----------|
| **Save Tampering** | Validate save data on load. Apply sensible defaults and clamp values to valid ranges. Don't trust deserialized data blindly. |
| **Input Injection** | Sanitize any player-facing text input (if added). Canvas rendering is inherently safe from XSS, but log messages should escape special characters. |
| **State Corruption** | Use atomic save writes — write to a temp key, then swap. Keep one backup save slot. Version the save schema so old saves can be migrated. |
| **Determinism** | Seeded RNG (Mulberry32) must stay deterministic. New features that use randomness must pull from the seeded generator, not `Math.random()`. |

**Exit Criteria:** Feature is playable, passes the full quality checklist, and the "done when" scenario plays out successfully.

**Why this matters:** Technical debt is the silent killer of indie projects. Post-mortems repeatedly show that teams who skip quality gates end up spending more time fixing regressions than building new features. The zero-dependency architecture of Violencetown is a strength — maintaining it requires discipline at the development gate. Save system integrity alone has destroyed player trust in otherwise great games (reference: numerous post-mortems on save corruption issues).

---

### Gate 4: Code Review & Polish

**Purpose:** Fresh eyes catch what tunnel vision misses. Polish transforms "it works" into "it feels right."

#### Code Review Checklist

| Area | Review Focus |
|------|-------------|
| **Readability** | Can someone unfamiliar with the feature understand the code? Are variable names descriptive? Is the control flow clear? |
| **Architecture** | Does the code respect module boundaries? Are there new dependencies that should be documented? Could any new code be simplified? |
| **Data Flow** | Trace data from input through processing to rendering. Are there any places where stale state could leak through? |
| **Performance** | Are there unnecessary allocations in hot paths (render loop, tick resolution)? Are chunk operations efficient? |
| **Consistency** | Does the code match the style of the existing codebase? ES6 modules, consistent naming, similar patterns? |

#### Polish Pass

| Area | Description |
|------|-------------|
| **Visual Feedback** | Does the feature communicate clearly through the canvas? Are colors consistent with biome palettes? Do animations/transitions feel right at the tick pace? |
| **Log Messages** | Are text log entries informative and flavorful? Do they match the game's tone? ("You step in sludge. Your shoes dissolve." not "Sludge damage applied.") |
| **Audio Hooks** | (Future) Are audio trigger points identified even if audio isn't implemented yet? Leave clean hooks. |
| **Accessibility** | Are new controls documented? Is color alone used to convey critical info (colorblind concern)? |
| **Playtesting** | Play for 10+ minutes with the new feature active. Does it enhance the core loop? Does it create emergent moments? Does it *feel* like Violencetown? |

#### PR & Merge Protocol

1. PR description includes: what changed, why, the "done when" scenario result, and any known limitations.
2. At least one review pass (self-review counts for solo dev, but use a structured checklist — don't just skim).
3. Squash or clean up commits before merge — the main branch history should read like a changelog.
4. Tag the merge with the feature name for easy rollback if needed.
5. Verify the game runs from a fresh `python -m http.server` after merge.

**Exit Criteria:** Code reviewed, polish pass complete, merged to main, and verified playable.

**Why this matters:** Successful indie studios treat polish as a non-negotiable phase, not a "if we have time" afterthought. Supergiant Games famously iterates on game feel until every interaction has satisfying feedback. Code review — even self-review against a checklist — catches bugs that cost 10x more to fix after they're live. The PR protocol prevents "works on my branch" syndrome.

---

## Feature Development Template

Copy this template for each new feature:

```markdown
# Feature: [Name]
**Phase:** [Which ROADMAP phase this belongs to]
**Priority:** [Critical / High / Medium / Low]
**Status:** [Research / Design / Development / Review / Shipped]

## Gate 1: Research
- **Genre References:** [3-5 games studied]
- **Player Experience Goal:** [One sentence]
- **Technical Feasibility:** [Affected modules, known constraints]
- **Scope (MVF):** [What's in]
- **Out of Scope:** [What's explicitly out]
- **Risks:** [Top 3 with mitigations]

## Gate 2: Design
- **System Design:** [Core logic, data structures, pseudocode]
- **Integration Map:** [Which modules change and how]
- **Data Schema:** [New data.js entries]
- **UI/UX Spec:** [What the player sees]
- **Save/Load Impact:** [New persisted state, migration plan]
- **Edge Cases:** [At least 5]
- **Done When:** [Concrete play scenario]

## Gate 3: Development
- **Branch:** `feature/[name]`
- **Quality Checklist:** [All items from Gate 3 checked]
- **Known Issues:** [Anything deferred to a follow-up]

## Gate 4: Review & Polish
- **Code Review:** [Checklist completed, findings addressed]
- **Polish Notes:** [Visual, audio hooks, log messages, feel]
- **Playtesting Result:** [10+ minute session notes]
- **Merged:** [Date, commit hash]
```

---

## Applying This to the Violencetown Roadmap

| ROADMAP Phase | Features to Plan |
|---------------|------------------|
| **Phase 2 — Life in the City** | NPC Spawning & AI, On-Map Combat, Death & Respawn, The Duke NPC, Ground Items & Pickup, Fog of War |
| **Phase 3 — The Bag** | 2D Inventory Grid, Bag Damage System, Tag-Based Crafting, Environmental Interaction, Shoestraction |
| **Phase 4 — Noise & Stealth** | Noise Propagation, Light & Fog of War, Sound Weapons, Status Effects, Hit-and-Run Loop |
| **Phase 5 — The Taxi** | Taxi Assembly, Garage UI, Multi-Tile Driving, Duke Missions, Faction Reputation, Zone Mechanics, Cryptids |
| **Phase 6 — Entropy** | Entropy Event System, Day/Night Cycle, Procedural Audio, Content Expansion |

Each feature in each phase gets its own copy of the template. Features within a phase can be developed in parallel if they don't share dependencies, or sequentially if they build on each other.

---

## Anti-Patterns to Avoid

These are drawn from real indie studio post-mortems:

| Anti-Pattern | Why It Kills Projects | Prevention |
|-------------|----------------------|------------|
| **"Just one more feature"** | Scope creep delays shipping indefinitely | Gate 1 scope definition with explicit "out of scope" list |
| **Cowboy coding** | No review = bugs compound silently | Gate 4 is mandatory, not optional |
| **Gold plating** | Polishing a feature nobody asked for | Player Experience Goal keeps focus on what matters |
| **Big bang integration** | Merging a month of work = merge hell | Short-lived branches, incremental commits, daily merges |
| **Ignoring save compat** | Players lose progress = players leave | Gate 2 save/load impact analysis + Gate 3 migration testing |
| **Building engine, not game** | Writing tools instead of gameplay | Technical feasibility check in Gate 1 flags this early |
| **No playtesting** | "It works" != "it's fun" | Gate 4 mandatory 10-minute play session |
| **Burnout sprints** | Unsustainable pace = abandoned project | Phases are milestones, not deadlines. Each phase ships a playable game. |

---

## Summary

This pipeline ensures every feature in Violencetown is:

1. **Researched** — grounded in what works, scoped to what's achievable
2. **Designed** — integrated end-to-end before a line of code is written
3. **Developed** — with quality, stability, and security as first-class concerns
4. **Polished** — reviewed, playtested, and ready to ship

The goal is not bureaucracy — it's preventing the mistakes that kill indie games. Every gate has a clear exit criteria. Skip nothing, ship everything.

*"20 minutes of play feels like a story happened to you that you didn't plan."* — That's the bar. This process gets us there.
