# The board loop — the rulebook

Start it in a desktop session in this repo, in auto mode: `/loop /board-loop`. That fires the
`board-loop` skill (`.claude/skills/board-loop/SKILL.md`) once per pass. The skill follows this
file. The design is `plans/board-loop.md`; the board itself is `plans/ticket-board.md`.

**The board:** https://claude.ai/code/artifact/267dc977-cb87-453f-9ba8-ce6479a79ce7, collection
`cards`, one document per card. Every write is pinned to the version from the latest read. On a
version clash, re-read and redo; never force.

**Vocabulary:** the step that turns an idea into rulings and slices is called **tweaking**.
Caelan dislikes the other word for it; never use it.

## 1. One pass

1. **Read the board.**
   - `ArtifactData list`, collection `cards`, `query.limit: 1000`, with `out_dir` set to a
     **fresh** scratchpad folder (a list only overwrites the ids it returns).
   - Keep every card's `version`.
   - **If the read fails**, add 1 to the count in `<scratchpad>/board-loop/unreachable.txt` and go
     straight to the wait (§7). A good read sets it back to 0.
2. **Recover stale work.** A card in `doing` whose `claim.at` is over 2 hours old means a pass
   died mid-slice.
   - Leave its branch alone.
   - Move the card to `ready` and drop `claim`.
   - Note "resume from `<branch>`".
3. **Clear Claude's turn**, in this order. Do at most 10 merges, 10 Changes builders and 10
   tweaks per pass. Items 4, 6 and 7 share the 10 tweaks.
   1. **Merge it** (§4).
   2. **Changes:** hand the slice back to a builder on its existing branch. When it reports DONE,
      move the card to `review` and clear `verdict`. Anything else is a FAILED (§3).
   3. **Feedback with no reply:** answer on the card by appending `{from: "claude", text, at}` to
      `feedback`. Add `ask: true` only when the reply needs his answer.
      - **His own answer to a ruling** (`pick.option: "other"`, typed in the card's box) comes in
        the same way. If it settles the question, reply in one line saying how it will be used.
        It then counts as his pick, and builders get his words.
      - If it doesn't settle the question, reply with `ask: true`. Move the ruling back to the
        `ruling` lane and drop `pick`, so it returns to Your turn. Offer new options if his words
        suggest them.
      - **A card with `fails`:** set it back to 0 once you act on his reply, so the card can be
        built again.
   4. **Tweak it** (§5).
   5. **A ruling with no options:** write 2–4 options and a recommended one (§6).
   6. **A Ready slice with no acceptance:** tweak it (§5).
   7. **Scout defects and tweaks he hasn't triaged** (`source: "scout"`, `scoutKind` `defect` or
      `tweak`, no `triage`): tweak them under the standing delegation (§11).
4. **Ask what's next:** `node tools/roadmap-board/next-slice.mjs <that folder>`.
   - `wip-cap` or `nothing-pickable`: no build this pass. Go to step 8.
   - `ok`: carry on with `picks` (up to 10). Only an approved, tweaked, unblocked slice is ever
     picked, and no two picks share a file. Steps 5 to 7 run for each pick.
   - It also prints `openRulings` (for §5's pause) and `idleWait` (for §7's wait).
5. **Recon.** Run `git fetch`, `git branch -r --no-merged origin/dev`, and `git log -S` on the
   slice's key names. A hit drops that pick only; carry on with the rest:
   - **It already shipped:** note where, and move the card to `done`.
   - **It overlaps a branch still in review:** add that card's id to `blockedBy` and leave the
     slice in `ready`. It frees itself when that branch merges.
   - **Anything else that makes it wrong to build:** note why and move the card to `someday`.
6. **Claim it** with a pinned `update`:
   `{lane: "doing", claim: {by: "loop", at: <now>}, branch: "feature/<slug>"}`.
   - `<slug>` is the card id in lower case, plus 2–4 words of its title, hyphenated.
7. **Build it in a fresh helper.**
   - Spawn the `slice-builder` agent. Its prompt carries:
     - the card JSON;
     - the picks of every ruling in its `blockedBy`;
     - `slug`;
     - the `touches` list.
   - Read its report, then write the card with a pinned `update`:
     - **DONE:** `{lane: "review", summary, branch}` and drop `claim`.
     - **BLOCKED:** write the new ruling card it asked for and add its id to the slice's
       `blockedBy`. Move the slice to `ready` and drop `claim`.
     - **FAILED**, or no report at all: move the slice to `ready`, drop `claim`, add 1 to
       `fails`, and put the failure plus the branch sha in `note` (§3).
8. **Scouts** (§10), when due: alongside the builders, never instead of them.
9. **Post the update and pick the wait** (§7).

**Up to 10 slices per pass**, one builder each. Recon and claim every pick first, then spawn all
the builders (and every scout that is due) in the same message so they run at once. `next-slice.mjs` never hands out two that share a file, so their branches can't collide. A
pass that cleared Claude's turn may still build.

## 2. What a slice must prove (the builder's definition of done)

Judge every gate by its exit code; claims don't count. All are fatal:

1. **Preflight.**
   - `git status --porcelain` is clean.
   - The branch is `feature/<slug>`, cut from `origin/dev`.
2. **Spec first.** The first commit adds `plans/<slug>.md`, written in plain words. It covers
   the goal, the acceptance checks, the rulings it rests on with their picks, and what is out of
   scope. It never pastes other board content: the repo is public.
3. **Build inside `touches`.**
   - New test files are always allowed.
   - Anything else outside `touches` means stop: report BLOCKED with a ruling.
4. **`node tools/roadmap-board/loop-guard.mjs --slug <slug> --touches <a,b,…>`** exits 0. It
   checks:
   - the branch name;
   - scope;
   - forbidden paths;
   - spec first;
   - no test removed, skipped or narrowed.
5. **`npm test`.** Record "N tests / M suites / 0 fail", plus the change from the count on
   `origin/dev` measured in the same pass. A feature with no new test is a fail, unless the card
   says there is no testable logic.
6. **The other repo gates.**
   - `npm run -s balance:check`
   - The naming grep from `CLAUDE.md` prints nothing.
   - `git ls-files | grep -i limezu` prints nothing.
7. **`npm run autoplay:check`.** It plays quest 1 in headless Chrome and fails on any page
   error, so it is also the "the game runs" check. Drift is never "fixed" with `autoplay:write`
   (§3).
8. **Evidence** for anything a player can see.
   - Exact-frame screenshots at 3440×1440, plus a GIF if it moves (`npm run autoplay --
     --gif=…`). Save them to the scratchpad, never commit them, and name them in the summary.
   - If no picture is possible, the summary says UNSEEN.
9. **Push** with `git push origin HEAD:refs/heads/feature/<slug>`.
   - Exactly that refspec: never `--force`, `--tags` or `--all`.
   - Never `dev` or `main`.

**The summary is built from command output, in this order:**
1. **What he can now see or do**, in one line, in player words.
2. **Evidence:** screenshot or GIF paths, or UNSEEN.
3. **Needs your eye:** at most 5 items, or "nothing". Placeholders go here, and so do numbers the
   pass had to use but did not choose.
4. **Gates:** pass or fail, with counts.
5. **Not done:** what was left out.
6. **Branch**, with its sha.

## 3. When something fails

- **Red tests:** at most 2 fix attempts on the code. Never edit an assertion unless the card's
  acceptance says the behaviour changes, and then only in its own commit. Still red means
  FAILED.
- **A flaky test:** rerun that one file 5 times. Mixed results mean FAILED with the test's name.
  Never retry until it goes green.
- **Autoplay drift:** run it again with `--repeat=2` to separate noise from a real change. Put
  the drift in the note, report BLOCKED, and ask "accept the new golden?". Only that ruling's
  pick may rewrite the golden.
- **A judgment call the rulings don't settle** (§6): BLOCKED. Commit only work that passes the
  tests, prefixed `wip:`. Never `git stash`.
- **A guard failure:** FAILED. Never edit the guard to pass it.
- **No written outcome:** a step that ends without its DONE is a FAILED for that card. That
  covers a Changes builder that isn't DONE, a merge push that is rejected or doesn't show in
  `ls-remote`, and a builder that returns no report.
- **Counting failures:** every FAILED adds 1 to the card's `fails`. On the second, also append
  `{from: "claude", text, at, ask: true}` naming what failed. From then on `next-slice.mjs`
  skips the slice, and a merge clears `verdict`, until his reply sets `fails` back to 0
  (§1 step 3.3).

## 4. Merge it

His click on the card is the merge call. Do it away from his checkout:

1. `git fetch origin`, then
   `git worktree add --detach <scratch>/vt-merge origin/dev`.
2. Inside it, run `git merge --no-ff --no-commit origin/<branch>`.
   - A conflict means `git merge --abort`.
   - Then remove the worktree, clear `verdict`, and leave the card in `review`.
   - Reply `{from: "claude", ask: true}` naming the files.
   - Never resolve a conflict in `main.js`, `wheel-model.js`, `trade.js` or `give-action.js`
     unattended.
3. Run every gate from §2 (5–7) on the merged tree. Any red means `git merge --abort` and a reply
   to him, as above.
4. Commit the merge, with a message saying what merged and the gate counts, then
   `git push origin HEAD:refs/heads/dev`.
5. Run `git ls-remote origin dev` to check it landed. Then remove the worktree, move the card to
   `done`, and drop `verdict`.
   - A rejected push or a `ls-remote` that doesn't match: remove the worktree and count a FAILED
     (§3). The card stays in `review`; its `verdict` stays until the second failure.

Never touch `main`, never tag, never release. Those are his.

## 5. Tweaking an idea

1. **Recon.** Find what already exists in the code (cite `file:line`), and check whether it
   already shipped (`git log -S`).
2. **Place it on the spine.** Name the zone and slot it fills (`plans/spine.md`). Decide which of
   three cases it is:
   - **a pool entry:** no structural question;
   - **a new system:** engineering plus at most one ruling;
   - **it would change a Locked row:** a single ruling naming the row it replaces. Recommend the
     pool unless it truly can't fit.
3. **Write the cards.**
   - At most 10 rulings and 10 slices per tweak.
   - Slices: about a day each, with `touches`, `acceptance` and `blockedBy`.
   - Each slice must be something he can see on screen, or have a stated reason why it can't.
4. **Pause when he's busy.** Count only open rulings (`openRulings` from `next-slice.mjs`):
   ideas, approvals and asks don't count. At 10 or more, start no tweak on the loop's own
   initiative (§1 step 3.6 and 3.7). His Tweak it is always done: write the slices that need no
   ruling now, and queue its rulings in the idea's `note` for a pass with room. Say so in the
   update.
5. **Close the idea.** Move it to `done` with a note naming the cards it became.

## 6. What the loop decides, and what becomes a ruling

**The loop decides** anything a player never notices: code structure, tests, internal ids,
refactors that leave the autoplay golden untouched, tooling, commit order.

**A ruling card is needed** for anything a player would notice:
- names of items, bosses, zones and UI labels;
- every line of copy and flavour (never written by the loop);
- tuning numbers;
- art picks;
- anything that changes what is on screen;
- the spine's Locked rows.

**Grey areas:**
- **A placeholder must exist:** make it obviously fake. Use `[TEXT]`, a tinted square, or a number
  left exactly as today. List it under "Needs your eye".
- **The golden moved:** something a player sees changed. Stop and ask.
- **Unsure:** ask only if guessing wrong would cost more than about an hour to redo. Otherwise
  pick, flag it under "Needs your eye", and let him overrule.

**How a ruling card reads:**
- The title is the question, in plain words, with no codes.
- One decision per card.
- 2–4 options. Each is one sentence on what the player sees, plus one line on what it costs.
- A `recommended` option, with one line saying why.
- The note says "If you don't pick, I'll use <recommended>." The loop picks only under the
  standing delegation (§11); otherwise the slice stays blocked until he does.

## 7. The update and the wait

- **The update:** end every pass with at most 6 lines, in plain words:
  1. what merged;
  2. what was built (its summary line);
  3. rulings that are new or waiting on him;
  4. slices waiting for his Approve;
  5. the 3 oldest untouched ideas (LP4);
  6. what the loop is doing next, or why it is idle.

  If nothing changed since the last pass, post one line.
- **The wait:** call ScheduleWakeup with the same `/board-loop` prompt.
  - **60 s** after a pass that changed anything on the board: a lane move, a merge, a build
    outcome (DONE, BLOCKED or FAILED), a reply, or new cards or ruling options. More may be ready.
  - **Otherwise the pass is idle**, even if Claude's turn still lists items a cap or §5's pause
    is holding. Set `noop: true` and wait `idleWait` from `next-slice.mjs`: 300 s if he touched
    the board in the last 30 minutes, 1200 s if in the last 2 hours, else 3600 s.
  - **The board couldn't be read:** 600 s.
- **When builds or merges can't run** (no worktree can be created, `origin` can't be reached),
  skip them, do everything else, and say why in the update. His own uncommitted edits in his
  checkout are never a reason to stop: the loop doesn't work there.
- **Stop the loop** (ScheduleWakeup `stop: true`) only when he asks, or when
  `unreachable.txt` reaches 3 (three passes in a row that couldn't read the board). Say why in
  the update.

## 8. Never

- Push to `dev` except in §4 after his Merge it. Never push `main`, tag, release, force-push,
  `reset --hard`, `clean`, `stash`, or `branch -D`.
- Edit `tiled/`, a golden file, `package.json`, `CLAUDE.md`, `.claude/settings*.json`, or deploy
  config. The guard refuses all of them.
- Answer a ruling or approve a slice for him, except as the standing delegation allows (§11).
  Press Merge it for him.
- Write idea, ruling or card content into a committed file.
- Delete a card. Move it to `someday` with a note instead.
- Work in Caelan's checkout. Builds run in the builder's worktree, merges in a scratch worktree.
- Touch his Obsidian vault.

## 9. If a pass stalls

- **A write waits for approval:** the session is not in auto mode, or auto mode paused after
  repeated classifier blocks. It resumes asking after 3 blocks in a row or 20 in total.
- **The PC slept or the app closed:** a self-paced loop doesn't survive that. Start it again
  with `/loop /board-loop`. It also expires after 7 days.
- **A card is stuck in `doing`:** step 2 of the next pass recovers it.

## 10. The scouts

Two agents feed the board work Caelan didn't have to think of (`plans/board-scout.md`). Both are
read-only: they never edit, commit or push, and the loop writes their cards.

| | **Defect scout** (`.claude/agents/scout-defects.md`) | **Thread scout** (`.claude/agents/scout-threads.md`) |
|---|---|---|
| Looks for | things that behave against their own intent: bugs, regressions, UI that collides or overflows, tests that can't fail | systems that stop short: never reachable, never connected, no way for a player to know they're there |
| Per run | reviews what merged, harvests the build reports, plays headless, sweeps one **code area** | traces one **system's** whole thread: notice, read, operate, works, feeds, ends |
| Rotation | the first list below | the second list below |
| Due | after every merge, otherwise at most once an hour | at most once every 2 hours |
| Card | `scoutKey` starts `defect:`, `scoutKind: "defect"`, note starts "From the defect scout:" | `scoutKey` starts `thread:`, `scoutKind` `tweak` or `idea`, note starts "From the thread scout:" and carries its `THREAD` line |

**The defect scout's code areas**, in order (each takes its share of `main.js` too):
1. fights: `combat.js`, `fight-area.js`, `fight-entrance.js`, `fight-panels.js`, `threat-phase.js`,
   `cascade.js`, `enemies.js`, `ai.js`, `defeat-scenarios.js`;
2. the wheel and its verbs: `wheel-model.js`, `give-action.js`, `theft.js`, `tricks.js`,
   `spells.js`, `skills.js`, `affordances.js`, `elements.js`;
3. items, gear and the bag: `items.js`, `weapons.js`, `slots.js`, `inventory.js`, `item-uses.js`,
   `drops.js`, `loot-burst.js`, `rings.js`, `buffs.js`;
4. townsfolk, trade and talk: `npc.js`, `trade.js`, `offer.js`, `disposition-curves.js`,
   `dialogue.js`, `perception.js`;
5. maps, movement and zones: `map.js`, `pathing.js`, `world-map.js`, the `*-map.json` files,
   `sewer-setpiece.js`, `ants.js`;
6. quests, saves and the title: `quests.js`, `save.js`, `hints.js`, `settings.js`, `examine.js`;
7. the screen: `renderer.js`, `layout.js`, `viewport.js`, `ui-sprites.js`, `xmb.js`,
   `inspector.js`, `combat-log.js`.

**The thread scout's systems**, in order: the Remoticon's gear tab and equipping → rings → trade
and barter → giving and bribes → stealing → spells and MP → poitions → secret item uses → buffs →
quests and the objective → the world map and travel → the day clock → a fight's entrance, fog and
defeat → weaknesses and elements → townsfolk talk and disposition → examine → saves, the title
and Continue → the options menu.

- **State:** each scout keeps `meta/<agent name>` in the board database: `lastSha`, `lastAt`,
  `area` (the last code area or system it took; the next run takes the next one in its list),
  `leads` and `runningSince`. A scout is running while its `runningSince` is under 2 hours old;
  never run two of the same scout at once. Set `runningSince: <now>` at spawn.
  - **First run:** with no `meta/scout-defects`, the defect scout takes `lastSha` from the retired
    `meta/scout` and starts at area 1. The thread scout starts at the top of its list. Leave
    `meta/scout` as it is; nothing reads it any more.
- **When:** spawn every scout that is due, in the background, in the same message as the builders,
  or on its own when there's nothing to build. The two scouts can run at the same time.
- **Hold back** a scout while 10 or more of its own cards sit untriaged in Ideas: he's not keeping
  up, so don't bury him. The other scout still runs.
- **Its prompt:** its `meta` (`lastSha`, or "none"), the current dev sha, the pass's card folder,
  this run's area or system, its `leads`, Caelan's checkout path, and a scratchpad folder for its
  logs.
- **Its report:** each proposal becomes an Ideas card through `newScoutIdea({key, kind, title,
  note}, now, cards)` from `board-model.js`, which returns null for a key the board already has,
  in any lane. The defect scout's `kind` is always `defect`; the note holds the rest of the
  proposal under its "From the … scout:" opening. Write the cards in one batch, then set its
  `meta` to `{lastSha: <origin/dev>, lastAt: <now>, area}` (dropping `runningSince` and `leads`).
  - **Hand-offs close the gap between them:** the defect scout's `FOR THE THREAD SCOUT` lines go
    into `meta/scout-threads.leads`, and the thread scout's `FOR THE DEFECT SCOUT` lines into
    `meta/scout-defects.leads`. The thread scout's `LEADS KEPT` lines go back into its own
    `leads`. Each scout checks its leads before anything else.
  - **`TOOLING` lines are never cards.** The guard forbids slices from touching
    `tools/roadmap-board/`, so a tooling card could only wait for him. Name them in the update
    instead.
- **The update** names what each scout filed, one line for both: how many cards, and the best
  one's title.
- **Learning from them:** a card's `scoutKey` prefix and note opening say which scout found it,
  so each scout's hit rate (tweaked versus Someday) is one board query. When he parks a scout's
  card with a reason, or a pattern shows (a class of finding he always parks, or always tweaks),
  say so in the update and propose the change to that scout's file. Those files are committed,
  so the change goes on a branch like any other; he says yes.

Scout cards are ideas in his Ideas lane, marked "idea · scout". Scout **ideas** (`scoutKind:
"idea"`) wait on his Tweak it or Someday like any idea. Scout **defects and tweaks** may be
tweaked by the loop without waiting (§1 step 3.7, §11); what that tweak makes follows §11's
approval rule.

## 11. The standing delegation

Caelan, 2026-10-25: "I would like to mass-approve anything you're confident about moving
forward with." So the loop no longer waits on him for what it is confident about. Recorded on
the board as LP6.

**The loop may, on its own:**
- **Approve a slice it tweaked** when the slice adds no new name, line of copy, lore point,
  tuning number or art pick (obvious placeholders are fine) and touches no Locked spine row.
- **Take its own recommended option on a ruling** about process, code structure, tests,
  tooling, or a golden whose drift is exactly what the slice set out to change.
- **Tweak the scouts' defects and tweaks** without waiting for his Tweak it. The scouts' ideas
  still wait on him.

**Still his:** names, copy, lore, tuning numbers, art picks, the spine's Locked rows, Merge it,
and any ruling where the loop's lean is a taste call. A pick the loop makes says so in
`pick.note` ("picked by the loop under the standing delegation") and carries `pick.by: "loop"`,
so he can see and overrule it; an approval it gives carries `approved.by: "loop"`.

