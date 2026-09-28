# What is a turn

**Status:** Gate 1 (research) on `feature/turn-model`, 2026-09-28. No code. Rulings TM-0..TM-6 at
the end are Caelan's; the build waits on them.

## Why

Caelan, answering ruling A3 on 2026-09-24:

> "…as we work to sort of slim down the game maybe this gives us an opportunity to think about
> what a turn is. I was thinking that each person would get one turn, but now I'm thinking that
> it might be fun to have multiple world turns occur on a single combat turn but I don't want the
> player to have to queue up a bunch of stuff either. I like the snappiness of Pixel Dungeon, and
> I think the execution of the turn, the moment that you choose what you want to do without a
> confirm button or anything, keeps the game pace to where I want it."

In the same answer he named Baldur's Gate 3's model — items costing points or actions — as
"close to what we're looking at". Opening the bag stays free either way (A3, ruled).

## What a turn is today

Read from `dev` at `97ea7e1`, not from the older docs.

**One committed action = one world beat.** `_advanceWorld` (`main.js:3706`) runs
`_advanceWorldOnce`: every enemy on the map acts once (`resolveEnemyTurns`), summons and rat form
count down, buffs and DoTs tick, MP regenerates, a pending zone transition fires. 28 calls in
`main.js` plus one in `item-uses.js`. A step, a hit, a throw, a cast, a drink, a barricade bash and
T (wait) each cost exactly one.

**Two clocks.** Out of a fight a 500 ms timer (`WORLD_TICK_MS`) also winds `_worldBeat`: ambient
townsfolk step, the day eases, moods decay — while you stand still. In a fight (`_inCombat`) that
timer lets go and the beat is wound once per committed action instead. So the town already runs
on a different clock from the fight.

**Free:** opening the bag, flipping its tabs, menus, trade and loot windows, turning in place.

**Speed already bends the one-for-one rule.** A haste charge skips a world beat — you act, the
world holds still. A slow charge runs the beat twice (`worldBeatPlan`, `buffs.js:215`). Whole
beats only; no fractions.

**Input.** A step slides for 150 ms (`_MOVE_MS`) and the world beat runs when it settles. A
direction pressed mid-slide is kept, one deep (`_queuedMoveDir`); anything else pressed mid-slide
is dropped. Enemy slides never block you.

**Presses per action.**

| Action | Presses | Confirm? |
| --- | --- | --- |
| Step | 1 | no |
| Hit an adjacent hostile by walking into it | 1 | no |
| Hit from the wheel | Space, three drills (Fight › Melee › Hit), a direction | no — the direction commits |
| Cleave, Fireball, Throw | Space, drills, nudge the reticle | **yes** — Space fires |
| Repeat the last wheel action | Space twice within 250 ms | no |
| Wait | T | no |

(Counted from the wheel tree and `_reticleKey`, not timed in play.)

**Fights are short.** `tools/balance-golden.txt`: `ttk_informed` is 1-3 turns for every enemy
that fights back (the Sludge Bloom, which does not, takes 4). The August audit's target was 5-8; `ttk_lazy` sits at
5-8. Any model that gives the player more per combat turn shortens fights further unless the
enemy's turn grows with it.

## What the docs already settled

- **Pixel Dungeon hybrid is the time model** — `abc-decision-matrix.md` 1B, recorded chosen in
  `adventure-transition-plan.md`. VT is not pure 1B: the ambient heartbeat is the difference.
- **Guardrail G-1** (`cross-game-study.md:138`): keep the dual clock; do not adopt Pixel Dungeon's
  float-time scheduler, which would freeze the town between inputs. Per-enemy speed, if ever
  wanted, is an integer energy accumulator inside `resolveEnemyTurns`.
- **Snappiness** (`combat-ui-layers.md:171-185`, his directive): input on keydown, never wait on
  an animation, no confirm dialogs.
- **Contradiction, unresolved:** that same section says "no input buffering during animations";
  `movement-feel.md` then shipped the one-deep step buffer.

## Two readings of the idea

The sentence fits two different machines. They are not exclusive, but they answer different
problems, and the first ruling is which one he meant.

### A — Rounds: several moves inside one combat turn (the BG3 reading)

A fight is played in **rounds**. In your round you may **move up to M tiles and take one action**
(hit, cast, throw, drink); each press resolves the instant you make it — no plan, no queue, no
confirm. The fighters answer when your round ends: when you take the action, spend the moves,
or press T. Every step is still a world turn for the town (ambient, day), so several world turns
happen inside one combat turn — the sentence, read literally.

- *Gives:* approach-and-strike, strike-and-retreat, step out of a cone and still drink. Positioning
  matters without costing your attack.
- *Costs:* a player who walks up and hits in one round kills faster — fights, already 1-4 turns,
  get shorter. So enemies almost certainly get the same round (move + act), which is TM-2.
- *What "a turn" means for DoTs, buffs and MP regen* ("sludge: 3 turns") has to be chosen: per
  round is the natural reading.

### B — Costs: actions take different amounts of time (the Pixel Dungeon reading)

Every input is still one action that resolves at once, but actions **cost different numbers of
world beats**. A step costs 1; a heavy swing costs 2 (the world runs twice); a quick jab or a drink
costs less. A fast enemy acts twice per beat. This is how Pixel Dungeon itself works, and the
slow/haste charges are its first, integer-only form.

- *Gives:* weapon and verb identity without new menus; speed as a real stat; one input, one
  outcome, never a queue.
- *Costs:* fractional costs need G-1's energy accumulator, for the player too, not only enemies.
  Nothing gets cheaper to reach; the wheel's press count is unchanged.

### Neither reading needs a queue or a confirm

In both, a press does its thing now. The one confirm left in the game is the reticle's Space on
Cleave, Fireball and Throw, which places a target; it is a separate question (TM-5).

## What either one touches

- `_advanceWorld` and its 29 callers: each would say what it costs (B) or whether it ends the round (A).
- `resolveEnemyTurns` (`npc.js`): enemies get a round (A) or an energy meter (B).
- `worldBeatPlan`: haste and slow become "extra moves / an extra action" (A) or speed (B).
- The balance harness counts `ttk`/`ttd` in turns, so its unit changes and the golden is rewritten.
- The autoplay golden will drift, on purpose; `npm run autoplay:write` records it once the change is ruled.
- DoT durations, `SLUDGE_DURATION`, summons, rat form, disposition decay in fights
  (`DISPOSITION_DECAY_TURNS`), respawns (species-adventures §4) — all count turns.
- Law 7 (a DoT never lands the killing tick on the player) is unaffected by either reading.

## Recommendation

**Don't rule this in the abstract — play it.** Reading A has a small first cut: in a fight, a step
inside the round's allowance winds the town beat but not the fighters, and an action (or T, or the
last allowed step) ends the round. Behind a URL flag (`?turns=rounds`) it changes nothing for
anyone else, and the autoplay golden stays put. Enemies would keep one action per round in the
first cut, so the feel of "I can walk up and hit" is visible at once, and so is how much shorter
fights get — which is the evidence TM-2 needs.

Reading B's first cut is a single weapon that costs 2 beats, which the slow charge can already
express, so it could ride along for comparison.

## Rulings owed

| Code | Question | Recommended |
| --- | --- | --- |
| **TM-0** | Which did you mean: several moves in one combat turn (A), or actions costing different amounts of time (B), or both? | A first — it is the sentence and the BG3 reference |
| **TM-1** | A round's budget: how many tiles (M), and one action? Is an item a separate "bonus" action, as BG3 has? | M = 2, one action; items spend the action until it is played |
| **TM-2** | Do enemies get the same round — move and act? | Yes, eventually; the first cut leaves them as they are, to measure |
| **TM-3** | Per round or per step: DoTs, buffs, MP regen, summons, disposition decay | All per round; ambient and the day per step |
| **TM-4** | "Slim down the game" — what goes? | His to say; nothing here assumes an answer |
| **TM-5** | The reticle's Space on Cleave/Fireball/Throw — keep, or commit on the nudge the way Hit commits on a direction? | Keep for now: it places a target, it does not confirm a choice |
| **TM-6** | The one-deep step buffer vs "no input buffering" | Keep it: it smooths a held walk; it is not the planning-ahead queue he rejected |
