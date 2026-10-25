# Ticket board — the roadmap board becomes the work queue

**Date:** 2026-10-20
**Status:** BUILDING on `feature/ticket-board`
**Why (Caelan, 2026-10-20):** ideas arrive faster and bigger than they can be built, and in an
order nobody can build them in. He wants every idea he says written down as a ticket, and a
Claude loop on his PC that works through ready tickets one at a time while he is away, the way
development runs at work, without Jira and without writing tickets himself.

## 1. The flow

**He talks → Claude tweaks → he rules → the loop builds → he merges.**

1. **Idea.** Anything he says becomes an `idea` card in his own words. Nothing is decided at
   this stage, and capture is cheap on purpose.
2. **Tweaking** (Claude, in any session) turns an idea into three things:
   - recon: what already exists in the code;
   - `ruling` cards with multiple-choice options for every judgment call;
   - `slice` cards, each sized for one branch in about a day.
3. **Rulings.** He answers on the board by clicking an option. The pick is stored on the card.
4. **The loop** builds one pickable slice per run to a pushed branch and moves it to Review.
5. **Merge** is his call, as always (`CLAUDE.md`).

## 2. The model

Three **kinds**: `idea`, `ruling`, `slice`. Seven **lanes**, in board order:

| Lane | Holds |
|---|---|
| `idea` | his words, not tweaked yet |
| `ruling` | a question only he can answer |
| `ready` | tweaked slices; some may still be blocked |
| `doing` | a slice a loop run has claimed |
| `review` | branch pushed, waiting on his merge call |
| `done` | finished. Do not re-implement |
| `someday` | parked on purpose, so it is not debt |

**Fields every card has:** `id`, `title`, `kind`, `lane`, `order`, `blockedBy`, `note`, `doc`,
`size`. Optionally `zone` and `slot`, the spine tags `CLAUDE.md` asks new ideas to carry.

**Slices also have:**
- `touches`: the files the slice expects to edit;
- `acceptance`: the checks that say it is done;
- `branch`: set when a run claims the slice;
- `claim: {by, at}`;
- `summary`: what the run did, written when it moves the slice to Review.

**Rulings also have:**
- `options`: `[{id, label, detail}]`;
- `recommended`: an option id;
- `pick: {option, note, at}`: written by the page when he clicks.

**Pickable:** a `slice` in `ready`, unclaimed, every blocker done, and no file in `touches`
also in the `touches` of a slice in `doing` or `review`. Those are the unmerged branches, and
the repo's hygiene rules say not to stack core-file work on them. An unknown blocker id still
blocks, as before.

**WIP cap:** a run builds nothing while `doing` + `review` hold 10 or more slices (2 until
2026-10-25, `plans/loop-limits-ten.md`). Below that, `nextSlices()` hands out up to 10 picks a
pass, no two sharing a file.

`nextSlice(cards, { wipCap })` in `board-model.js` is the one place this is decided. It is pure
and node-tested, and `next-slice.mjs` prints its answer from a db dump.

## 3. Source of truth

**The db is the record.** `cards.json` was a seed extracted from `roadmap-2026-09.md`, and
because the two drifted, "board not reseeded" was a standing note for a month. As of this
branch:
- the live db has no drags since the 10-03 seed;
- 7 rulings have since been struck in the roadmap;
- 15 cards (SP1–SP9, RC, RV, AB, FIN, SR, the v0.29.0 ship row) were never written.

`migrate-v2.mjs` maps `cards.json` onto the new model one last time:

| Old lane | New lane |
|---|---|
| now | ready |
| rulings | ruling |
| ready | ready |
| design | idea |
| later | someday |
| done | done |

`build` becomes kind `slice`, `design` and `later` become `idea`, and `done` keeps its source
kind. After the migration the board is written directly, and `extract-roadmap.mjs` is not run
again.

## 4. Privacy

**The repo is public; the board is private.** Idea, ruling and slice content written after the
migration lives only in the db. It never goes into `cards.json`, `dist/` or any committed file.
`cards.json` stays as the pre-migration public snapshot that the page shows when it has no
store.

## 5. The page

- Lanes and kinds as above. The gold strip becomes **Pickable now**.
- A ruling card shows its options as buttons. A click writes `pick` and moves the card to
  `done`, which unblocks whatever it gated. A short note field rides along.
- An **idea box** at the top writes a new `idea` card with his words, so a thought can land
  without a Claude session.
- Kept: drag to move, the hostile-input defences (`__proto__` lanes, unknown lanes stay
  visible, `esc()` on every string), and the graph view.

## 6. The loop

The run's rules live in `tools/roadmap-board/LOOP.md`. That is the file a `/loop` prompt
points at.

**Verified 2026-10-20:** a `set` and a `delete` on the live db went through from a desktop
session in auto mode with no approval stop. A loop in a stricter permission mode would stop on
every write. That is the first thing to check if a run stalls.

## 7. Out of scope

- A loop that tweaks ideas into ruling stacks on its own.
- Cloud runs, which may not reach the board.
- Rewriting `roadmap-2026-09.md`. It stays the public record of shipped work.

## 8. Your turn on every card (added 2026-10-21)

**Why (Caelan, 2026-10-21):** he opened the board and found nothing to press: no approve, no
feedback, and multiple choice on only the newest rulings, which sat under 16 rulings with none.
The board is where he decides, so every card needs a gesture.

| Card | Gestures |
|---|---|
| ruling | option buttons, plus a note (already built) |
| idea | **Tweak it**: Claude turns it into rulings and slices. **Someday**: parked |
| ready slice | **Approve**: the loop may build it. A tweaked slice waits for this |
| review slice | **Merge it**: his merge call, made on the card. **Changes**: with a note |
| every card | a **feedback box**: a short thread on the card, his lines and Claude's replies |

- **Your turn** strip at the top: every card waiting on him (an open ruling with options, an
  untriaged idea, an unapproved ready slice, a review card with no verdict).
- **Claude's turn** strip: every card he has acted on that Claude has not handled yet (feedback
  with no reply, an idea marked Tweak it, a verdict on a review card).
- `nextSlice()` now also requires `approved`. The skip reason is "waiting for your approval".
- `LOOP.md` gains a step before building: clear Claude's turn first.
- The 7 rulings already decided on 2026-10-03 (CG, OBJ, P1, SF, V2, Z1, Z2) move to Done.
  OBJ (his copy) stays a ruling with options. SP1–SP9 get options, written to the db only.

## 9. What a blocked card waits on (added 2026-10-23)

**Why (Caelan, 2026-10-23):** 15 approved slices sat in Ready and none could start. Each waited
on a ruling, or on an earlier slice that waited on one, and nothing on the card said so. He wants
to see on the card itself what it needs from him, answer there, and press send.

- **`waitingOn(cards, id)`** walks a card's open blockers all the way down and returns the leaves:
  open rulings he can answer, slices he hasn't approved yet, and rulings waiting on Claude for their
  options. A slice blocked by a slice that is blocked by a ruling waits on that ruling.
- **A blocked Ready slice shows "Waiting on you"** with each of those rulings inline: its
  question, its option buttons and its own box (Enter sends). Answering there is the same answer
  as on the ruling's own card. A slice he hasn't approved shows an Approve button inline.
  An approved slice with nothing open still reads "the loop may build it". One with an open
  blocker says how many answers it needs instead.
- **`frees(cards, id)`**: the approved slices a ruling's answer would let start (directly or
  down the chain). An open ruling shows "Answering this frees …", and the Your turn strip puts
  the rulings that free the most work first, with the count on the chip.
- **A question Claude asked** (`feedback` ending in `ask: true`) shows on the card unfolded, just
  above the box, instead of inside the folded thread.
