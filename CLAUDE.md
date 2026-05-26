All feature planning and development follows the 4-gate pipeline defined in GAME_STUDIO_PLAN.md. Read it before starting any feature work.
Always develop on the dev branch.
Always plan on the plan branch.

## Naming

The game's name is always one word: **Violencetown**. Never "Violence Town", "violence-town", or "violence_town". Casing varies by context (Title in prose, ALLCAPS for the splash, lowercase for identifiers / URLs / branch names); spacing does not.

Citizens of the game are **Violencians** — this is the in-fiction demonym and is correct as written; do not "fix" it.

Before merging, run `git grep -iE 'violence[ _-]+town'` from the repo root — it must return zero lines.
