# plans/_archive — shipped or superseded, kept for the record

Nothing here is open work. Don't build from these docs. Each one was either built or overtaken by a
later design, and the code is the truth. Links inside them are relative to `plans/`, where they were
written, so a link may not resolve from here.

## Moved from the `plan` branch, 2026-09-24

Before this move, these 14 docs existed only on `plan`, which has no history in common with `dev`.
Their commit history stays there (`git log plan -- plans/<file>`). The verdicts come from the plan
branch's own 16-agent audit of 2026-07-23 (`undeveloped-backlog.md` §4, archived here), carried
forward by `plans/roadmap-2026-09.md` §6.

| Doc | Verdict |
|---|---|
| `action-wheel-overhaul.md` (+ `-implementation`) | **Superseded** by the `wheel-model.js` node-tree wheel |
| `combat-wheel-rework.md` (+ `-implementation`) | **Built** (`ff5f995`: the FIGHT / TRICK / TREAT / FLIGHT tree and the reticle), since extended |
| `combat-wheel-radial-overhaul.md` (+ `-implementation`) | **Built** (the sunburst, over 4 merged phases). Still unbuilt, and minor: CVD colour presets and the hover-before-AIM predictive highlight |
| `combat-wheel-effects.md` | **Built** (`832d097`: reaction/aggro bus, AoE helper, real-placement throw, Trade hub) |
| `combat-feel-pass.md` | **Built** (the 3×3 throw burst, the Sludge Sack, typed hit-splats) |
| `two-wheels-phase0-color-language-implementation.md` | **Built** (phase 0 of `plans/two-wheels-focus-state-and-color-language.md`) |
| `zone-stub-expansion.md` | **Built** (the cross-shaped Town hub and the zone stubs, which have since grown into full zones) |
| `road-to-1.0.md` | **Built** (the critical-path fixes, audio, options, ending, saves, test harness). The itch.io page it planned was dropped when the game went web-first on Cloudflare |
| `roadmap.md` | **Superseded** by `plans/roadmap-2026-09.md`. Its post-1.0 threads are that doc's §5 |
| `undeveloped-backlog.md` | **Superseded** by `plans/roadmap-2026-09.md` |
| `next-session-open-work.md` | **Superseded** by `plans/roadmap-2026-09.md`. Its open rulings (A1, A2, A3, B3) and its ideas (§E) are carried in that doc's §2 and §4 |

Eight other plan-only docs moved to `plans/` rather than here, because they are still open work or
code and live docs cite them: `bestiary.md`, `sewer-crat-quest.md`, `wild-ideas.md`,
`movement-feel.md`, `world-structure.md`, `chapter-two-downtown-canyon-and-cohesion.md`,
`sewer-armor-weapons-and-carnival.md` and `two-wheels-focus-state-and-color-language.md`.

## Earlier

| Doc | Verdict |
|---|---|
| `design-memory-march-2026.md` | Historical. It was archived before this index existed |
