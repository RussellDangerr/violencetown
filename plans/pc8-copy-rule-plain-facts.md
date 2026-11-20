# PC8: the loop's copy rule is plain facts, everywhere

## Goal
Widen the loop's copy rule from "placeholders are plain" to "all text the loop has written is
plain". Any line a player reads that is AI-written creative writing (a joke, a character's voice,
atmosphere, story prose) gets replaced with a flat, true statement of fact. Caelan writes the
flavour himself later; until then the game says only what is true.

## Why
People are wary of generative AI in creative work, and Caelan wants the creative side of the game
to come from people. So the loop stops writing flavour at all, and removes what it wrote before.

## The rule (LOOP.md section 6)
- Text is plain, flat and true to the code: what the thing is, what it does, its numbers, where
  it comes from, and what the player should do about it.
- No jokes, no voice, no atmosphere, no story prose.
- Every name is kept, whoever invented it.
- Caelan's own quoted lines, and the design facts written in `plans/`, are kept.
- No square brackets in anything a player sees.
- Lines that are already creative writing no longer stay: they are replaced.

Item text follows one pattern: the generated stats line, then at most one short physical fact that
Caelan or the item's data already states, then the generated "Dropped by / Sold by / Found in"
line. Written that way, a reader (or another AI) learns the item's class, role and source from the
text alone.

A copy slice greps `tests/` for every string it will change before editing anything. If a test
that pins one of those strings is outside the card's `touches`, the builder stops and reports
BLOCKED with the full list, so the loop can widen `touches` and rebuild.

## Ruling it rests on
PCR3, picked by Caelan on 2026-11-17: AI-written creative copy is replaced with deadpan, factual
text; every `[TEXT]` becomes a plain line saying what the thing is; item text carries every number
and interaction; every name stays; no square brackets; spoilers don't matter yet. It reverses the
part of PCR1 that let existing creative lines stay.

## Acceptance
1. `tools/roadmap-board/LOOP.md` section 6 states the rule above.
2. The sentence letting existing creative lines stay is gone; section 6 says they are replaced.
3. Section 6 gives the item-text pattern.
4. Section 6 says a copy slice greps tests for every string it will change, and reports BLOCKED
   with the full list if a pinning test is outside `touches`.
5. `.claude/agents/slice-builder.md`'s copy bullet points at section 6 and says the same in a
   sentence.
6. `.claude/agents/slice-checker.md` checks every new or changed line against the code and reports
   any cause or effect the code doesn't have.
7. `npm test` passes. A new test, `tests/copy-rule-doc.test.js`, pins the rule's key clauses in the
   three files.

## Out of scope
Rewriting any game text. That is the copy slices that follow this rule. Nothing changes on
screen; this is a process rule only.
