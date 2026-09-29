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

**2026-09-28, answering TM-0 — a hybrid, and the goal is comedy:**

> "I like the way that Pixel Dungeon executes everything the moment it happens, but I am also
> trying to create chaotic situations in which multiple things happen at once. Your plans that you
> are trying to carefully lay might get ruined by enemies moving out of the way or barrels getting
> smashed. … I think the funniest version of it is some sort of Three Stooges. Everyone is messing
> each other up all the time. I think a lot of the comedy will be lost if everything happens at the
> exact same time … It's almost like I want the rounds to execute sequentially yet basically
> simultaneously."

That is reading **C** below; A and B stay as the parts it can borrow from.

**2026-09-28, later — the order is the design:**

> "I'm thinking about high-level RuneScape PVP and the fact that they have to think about whose
> player identification number is currently giving which player an advantage. … even though
> things are all happening at once, on the tick, things do still have to get resolved
> sequentially. I guess the only thing my difference would be would be to expand out the
> animations to have it show which happens in a row. I like the idea of the speed stat
> determining this: what order you are in the round-robin as a callback to old JRPGs."

So C is settled in outline: resolve in sequence (as the engine already does), **play it back in
that sequence**, and let **speed set the order**. Today the order is the `enemies` array — the
order the map JSON lists them — which nobody chose (TM-7).

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

### C — The cascade: you act at once, the room answers in sequence (his hybrid)

**Correcting a premise first.** Pixel Dungeon does not resolve everything at the same time: its
actors act one after another (as its source is written — not re-read this session), and it only
*looks* simultaneous because the moves animate together. Violencetown is already the same:
`resolveEnemyTurns` (`enemies.js:475`) is a plain loop in list order, each enemy deciding and
acting in one instant, and every slide starts on the same frame for the same 150 ms. So
"sequential yet basically simultaneous" is the engine today. What it lacks is the joke.

**Where slapstick comes from in a turn-based fight** — three ingredients, and today has none:

1. **A gap between intent and result.** Moe swings where Curly *was*. Today an enemy decides and
   lands in the same instant, so it can never whiff, never hit the wrong man. The fix is a
   committed, tile-aimed action: an enemy winds up at a *tile* (shown), and it lands a beat later
   on whoever is standing there by then. Your dodge is what makes it hit his friend. (Into the
   Breach's telegraphs are the reference, played fast instead of planned.)
2. **Blows that land on everyone.** Swings, shoves, cleaves, bombs and barrels act on the tile,
   not on a chosen target — goon hits goon, a shove pushes a man into another, a smashed barrel
   takes the room with it. Today enemies cannot hurt each other at all; the only friendly fire is
   the player's own (a bribed ally snaps back; Cleave's Plus-Ultra confirm). No barrels exist.
3. **You can see the order.** Resolve in sequence, play it back as a fast cascade — each actor's
   beat offset ~60-100 ms — so the dominoes fall one by one and the cause reads before the
   effect. Today every enemy's beat plays in the same 150 ms, which is exactly the flattening he
   is worried about.

**The shape:** you act the moment you press (Pixel Dungeon's snap, no queue, no confirm); the room
answers with a quick cascade of committed actions that land on whoever is there. Your careful plan
— the barrel you were saving, the goon you lined up — is at the mercy of that cascade.

Borrowed from A: a round can still carry a move allowance. Borrowed from B: speed can set the
cascade's order (who goes first), instead of extra actions.

### Pixel Dungeon, from its source (2026-09-28)

Research agent over watabou/pixel-dungeon and 00-Evan/shattered-pixel-dungeon (both **GPLv3** —
studied for mechanism, no code copied or to be copied into this public repo). The load-bearing
claims were re-checked against the raw Shattered source (`actors/Actor.java`, `actors/Char.java`,
`actors/mobs/Mob.java`, master, fetched 2026-09-28):

- **One queue, by time.** Every actor has a `time`; `process()` runs whoever is earliest. A tie goes
  to the higher `actPriority` — `VFX 100 > HERO 0 > BLOB -10 > MOB -20 > BUFF -30`
  (`Actor.java:49-53, :267`). Among mobs a tie is arbitrary (set order). *Verified.*
- **Moves play together, blows play one at a time.** A move starts its tween and returns `true`,
  so the next actor goes at once (`Char.moveSprite`, `:312-320`). A **visible** attack starts the
  swing and returns `false`, which parks the queue (`Mob.doAttack`, `:761-763`); the damage lands
  when the swing ends (`Mob.onAttackComplete`, `:774-778`), and only then does the next actor
  decide. *Verified.* Three goons hitting you = three swings in a row, each seeing the world the
  last one left. That is the cascade — Pixel Dungeon already has it, for blows only.
- **Speed is frequency, not order.** A speed-2 mob steps twice per hero turn; attacks keep their own
  delay. Nothing sorts by speed within a moment. (Agent-reported; not re-checked.)
- **Input waits for the blows.** The hero takes input only when `ready`, i.e. after every blocking
  swing ahead has played. No buffering, no skip-animations setting. (Agent-reported.)
- **Hidden actors resolve instantly** — the playback costs only what you can see.
- **Bombs hit everyone** in the radius, hero and allies included, and chain through heaps.
  (Agent-reported.)

**What this changes for C:**

1. Take Pixel Dungeon's split as the default: **moves together, blows in sequence.** Walking stays
   snappy; the joke — who hit whom, in what order — gets its own beat.
2. **His JRPG initiative is a different mechanic from Pixel Dungeon's speed.** Pixel Dungeon's fast
   monster acts *more often*; a JRPG's fast character acts *earlier*. He asked for earlier (TM-7).
   Neither game sorts by a speed stat, so the sort key (speed, then the per-fight shuffle) is ours.
3. **The snap vs the sequence.** Pixel Dungeon makes you wait for the blows. `combat-ui-layers.md:183`
   already rules the answer for Violencetown: a key pressed during an animation finishes it
   instantly and the input is processed. So a press during the cascade fast-forwards it — you
   never wait, and a player who watches sees the whole Stooges routine.

### Neither reading needs a queue or a confirm

In both, a press does its thing now. The one confirm left in the game is the reticle's Space on
Cleave, Fireball and Throw, which places a target; it is a separate question (TM-5).

## What either one touches

- `_advanceWorld` and its 29 callers: each would say what it costs (B) or whether it ends the round (A).
- `resolveEnemyTurns` (`enemies.js:475`): enemies get a round (A), an energy meter (B), or a
  committed tile-aimed action that lands a beat later (C).
- C only: `stepEntity` and the hit splats would take a per-actor start offset, so a turn plays as
  a cascade instead of a single 150 ms beat.
- `worldBeatPlan`: haste and slow become "extra moves / an extra action" (A) or speed (B).
- The balance harness counts `ttk`/`ttd` in turns, so its unit changes and the golden is rewritten.
- The autoplay golden will drift, on purpose; `npm run autoplay:write` records it once the change is ruled.
- DoT durations, `SLUDGE_DURATION`, summons, rat form, disposition decay in fights
  (`DISPOSITION_DECAY_TURNS`), respawns (species-adventures §4) — all count turns.
- Law 7 (a DoT never lands the killing tick on the player) is unaffected by either reading.

## Recommendation

**Updated 2026-09-28 for C.** Build C in two playable steps, each behind a flag, each for him to
play before the next:

1. **The cascade, logic untouched** (`?turns=cascade`): moves still play together; each enemy's
   **blow** (swing, splat, knockback) plays one after another, in the order they already resolve, and
   any key press fast-forwards the rest. The logic already runs in sequence — each enemy sees what
   the one before it did — so this is playback only: the suite and both goldens stay put. It answers
   "does seeing the order read as comedy, or just as slower" — cheaply. Speed ordering (TM-7/9)
   comes after, once there is something to order.
2. **One slapstick blow:** a single enemy type swings at a tile it winds up on (telegraphed), landing
   next beat on whoever stands there, goon or player. In one room (the sewer fungus fight).
   Barrels come after, if the blow is funny.

**Step 1 — BUILT 2026-09-29** (`game/cascade.js`; hooks in `main.js`, `enemies.js`, `renderer.js`).
Play it at `?turns=cascade`; `&beat=<ms>` sets the gap (default 130). What it does:

- Each enemy's effects during the enemy phase — hit splat, flash, stagger, shake, event word, heal
  splat, its own DoT tick — are held and played on that enemy's beat, in the order the enemies went.
  Moves are not held. An enemy that shows nothing takes no beat.
- The attacker **lunges** 0.3 tile at you on its beat (`LUNGE_TILES`, `LUNGE_MS` in `cascade.js`), so
  you can see who landed it. Cascade only.
- The HP bar drops blow by blow: damage dealt but not yet shown is added back until it plays.
- Any key or tap plays everything still held, before the input is handled. A death plays it all at once.
- **The cascade changes when, never what.** Every seeded-RNG roll (the stagger direction, an event
  word's scatter) still happens at the hit, so a run spends the RNG identically with the flag on or off
  — `tests/cascade.test.js` pins it against the real `applyDamageToPlayer`, and four mutations
  (late rolls, one beat for all) each fail it.

Measured in headless Chrome, three goons adjacent, one turn: flag off, all three splats at 1 ms;
cascade, at 7 / 136 / 263 ms, lunges on the same beats, HP bar 88 → 84 → 80 → 76; a key at ~50 ms
played the last two at 50 ms. No console errors. Flag off: suite 1781 / 0, balance and autoplay
goldens no drift.

**Hit splats, 2026-09-29.** The cascade exposed two splat faults. (1) Splats on one tile fanned out
only if born within 130 ms of each other — exactly the beat — so cascaded blows stacked, or not,
by frame timing (measured slots 0/1/1). Now every splat still on screen counts (0/1/2 measured); this
applies with the flag off too, where it only matters for splats less than 620 ms apart. (2) In a
cascade your hit number now flies away from whoever landed it (the attacker was already known;
the "isn't tracked" comment was stale). Off: still an omni burst. Seen in frames: it works but
reads as a nudge, and the fight's entrance card can hide the first beat of a fight's first cascade.

Open for his eyes: is 130 ms the beat; is a 0.3-tile lunge readable at his 3440×1440; does the order
read as comedy or as slower (the question step 1 exists to answer).

The A and B first cuts below are kept for reference.

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
| **TM-0** | ~~Which reading?~~ **Answered 2026-09-28: a hybrid, for comedy — reading C.** | — |
| **TM-1** | A round's budget: how many tiles (M), and one action? Is an item a separate "bonus" action, as BG3 has? | M = 2, one action; items spend the action until it is played |
| **TM-2** | Do enemies get the same round — move and act? | Yes, eventually; the first cut leaves them as they are, to measure |
| **TM-3** | Per round or per step: DoTs, buffs, MP regen, summons, disposition decay | All per round; ambient and the day per step |
| **TM-4** | "Slim down the game" — what goes? | His to say; nothing here assumes an answer |
| **TM-5** | The reticle's Space on Cleave/Fireball/Throw — keep, or commit on the nudge the way Hit commits on a direction? | Keep for now: it places a target, it does not confirm a choice |
| **TM-6** | The one-deep step buffer vs "no input buffering" | Keep it: it smooths a held walk; it is not the planning-ahead queue he rejected |
| **TM-7** | ~~Who decides the order?~~ **Answered 2026-09-28: speed, a JRPG round-robin.** Ties? | Ties by a stable per-fight shuffle — his RuneScape PID, where the advantage is real but not permanent |
| **TM-8** | Where does the player sit in the order? A press resolves at once (the snap), so a faster enemy cannot go "before" it — unless a fast enemy may interrupt | Player always first, on the press; the room follows by speed. Interrupts later, as a rare enemy trait |
| **TM-9** | Where speed comes from. No character has a speed stat today; the only speed is the Speed Poition's haste/slow charges (`items.js:422`, `worldBeatPlan`) | A `speed` on every character (default 0), set per enemy type; the poition raises yours for N turns |
