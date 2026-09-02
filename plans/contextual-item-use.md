# Contextual item use — "try this here"

**Status:** spec · branch `feature/contextual-item-use` · opened 2026-09-02
**Ruled by Caelan** in session, 2026-09-02, after playing the merged offer screen.

## The report that started it

Three things he tried and could not do:

1. Stand at the Sludge Bloom, use soap on it.
2. Stand at the car, pour the bottle of alcohol into the tank.
3. Walk into a trader to talk to them.

All three reproduce. They share one cause: **the game has no "use item on thing" verb.**
The complete set `targetVerbs()` can produce is Examine · Talk · Trade · Bribe · Hit · Throw ·
Take · Open. Every item-on-world interaction that does exist is a hardcoded bump special-case —
the car (tile 19), the barricade (tile 23), a container. Nothing else can ever be tried.

## The ruling

> "I would think that using an item, even simply from your inventory, would trigger any
> environmental item use cases … standing in front of a wall and using soap … a door and using a
> lockpick … a thirsty bandit and using a beer."

And the design behind it, which is the part that matters:

> "I'm imagining old-school RPGs where some items are secret use items, but you must do them in a
> certain spot … Flipping that mechanic would be the instinct to use items in random places and be
> like, 'Oh, I didn't know I could use this spear on this bandit.' You would know that because you
> tried something in an unfamiliar place, knowing that it might have unintended consequences, and
> it's up to me to build those consequences."

So: **the affordance is universal, the consequences are authored.** The player should always be
able to try an item on what is in front of them. Whether anything happens is content. That inverts
the usual adventure-game secret — instead of hiding the *gesture*, we publish the gesture and hide
the *result*.

Second ruling, on the trader:

> "We need to go back to the RuneScape interact menu, where we have our options. Bumping into them
> would activate a sort of interact layer or interact harness that would house the fight, which
> would open up the list sort of view."

**Bumping an NPC opens the Target List.** It stops shoving them.

## What is already right

`_openItemOverlay` (`main.js`) is *already* contextual — `Smash` only appears when something
hostile is adjacent. This is an extension of that list, not a parallel system. Good: one menu, one
place the player learns to look.

`targetVerbs` / `orderedTargetVerbs` (`wheel-model.js`) already build a RuneScape-style list with a
ranked default. Bump-to-list is a new *caller*, not a new menu.

## Design

### 1. A registry of authored uses — `game/item-uses.js`

```js
{ item: 'soap', on: t => t.npc?.puzzleWall && t.npc.sludgy, label: 'Scrub it down', apply(game, t) {...} }
```

One table. Each row is `(item id) × (target predicate) → label + effect`. This is the file Caelan
writes secrets into; nothing else needs to change to add one.

`contextualUses(item, game)` gathers the candidate targets and returns the matching rows:

- **the faced tile** — its examinable, its wall/feature, whatever entity stands on it
- **every adjacent NPC** (so "Give beer to the bandit" appears without facing them precisely)
- **adjacent containers**

Order is faced-tile first, then adjacent, so the thing you are looking at wins the top row.

### 2. The overlay grows the options

`_openItemOverlay` appends the contextual rows after `Use` and before `Smash`. An item with
`useType: 'none'` (alcohol) currently produces a bare `Use` that does nothing — with a contextual
row present, that row becomes the *only* sensible option and sorts first.

### 3. Bump → Target List

`_doMove` currently shoves. It will instead call `_openTargetList(nx, ny)`.

**Shove is not lost** — it becomes a verb in the list, so barging past someone stays possible but
becomes deliberate. `heavy` NPCs keep refusing it.

> **Open question for playtest:** wandering NPCs can step into your path, so a walk into a crowd
> may now pop a menu you did not ask for. If that grates, the fix is to only open the list when the
> move was a deliberate single press (not mid-auto-repeat walk). Not built yet — see if it bites.

### 4. The two authored uses that close the report

| Item | Target | Effect |
|---|---|---|
| `soap` | the Sludge Bloom | dissolves it — the clever key |
| `alcohol` | the car, once `carFixed` | pours the tank — replaces the bump-only path |

**Soap does not displace fire.** The bloom is a 100 HP / 15 armor wall that takes 2× from fire
(`weak` is a damage multiplier in `combat.js:39`, not a lock). Fire stays the loud answer; soap
becomes the quiet one. Two keys, different costs — which is exactly the shape "I didn't know I
could do that" wants.

### The bug this also fixes

The alcohol pour is currently **unreachable on touch**. Verified from an identical state:

| gesture | fuel after | bottle |
|---|---|---|
| bump the car | `alcohol` | consumed |
| tap the car | `raw` | kept |

The on-screen d-pad was removed (`index.html:61`, "tap the world to move"), so touch has no bump
gesture at all. The converter branch one line above already got a tap path with the comment *"it's
the ONLY way on touch, where there's no d-pad to bump with"* (`main.js:2839`) — the same reasoning
simply never reached the alcohol branch. A contextual use is reachable from the hotbar on both
input models, so it closes the hole rather than patching another special case.

## Not in this slice

- **Copy.** Caelan is replacing it wholesale: *"don't worry too much about the flavor text."* Labels
  here are functional, not final.
- **Bribe's duplicate path.** `_bribeTarget` survived the offer-screen merge, so bribery now has two
  routes. Real, unrelated, tracked separately.
- The lockpick and the beer are the *shape* of the system, not content that exists yet.

## Gates — met

**973 tests / 168 suites / 0 fail** (was 949 before this slice; +24). `balance:check` clean.

Driven in the live game, not inferred. `liveMethod` lifts a method body and hands it free variables
by hand, so it **structurally cannot see a missing import** — and this slice adds one
(`contextualUses` into `main.js`). The browser run is the only thing that proves the wiring, which is
why each row below was performed rather than reasoned about:

| gesture | result |
|---|---|
| walk into Macc | opens the list — `Talk · Trade · Bribe · Shove · Examine · Cancel`, and he does **not** move |
| Trade, fired from that list | the offer screen opens on Macc |
| Shove, fired from that list | Macc moves (24,10) → (23,10) — the push survived, it just moved house |
| soap at the real sewer Bloom | overlay reads `Use` / `Scrub Sludge Bloom`; picking it takes the Bloom to 0 HP, spends one of two bars, and **(3,3) becomes walkable** |
| alcohol at the car, `carFixed` | overlay reads **only** `Pour it in the tank`; picking it sets `carFuel: 'alcohol'` and spends the bottle |
| alcohol anywhere else | overlay reads `Use` — the item is never unselectable |

Network on a clean load: 61 resources, **zero failures**. (Console 404s seen during the session were
my own speculative `import('/verbs.js')`-style probes while hunting for `orderedTargetVerbs`; they
predate the reload and the tab's console buffer outlives the page.)

---

# Slice 2 — the telegraph (ruled 2026-09-02, same session)

The three questions above came back with answers, and they resolved a tension I had not spotted.

## The question he actually asked

> "I'm trying to think of how games usually solve the whole having a default option on one NPC and
> a different one on one NPC … On a computer RPG like Baldur's Gate, I wouldn't think that you'd be
> hunting for a different menu option each time."

The industry answer is that **almost nobody standardises the verb — they telegraph it.** RuneScape
fires a per-entity default on left-click and hides the rest behind right-click. BG3 keeps the verb
contextual and changes the *cursor* before you commit. Ultima makes you pick the verb first and is
slow. Zelda-likes show an on-screen prompt naming the button's job.

So the fix for "what will this do?" is showing the answer, not flattening it — which matters because
his objection to class-dependent defaults was **unpredictability**, and this game already has facing
and adjacency barks. The surface to telegraph on already existed.

## The rulings

**1. Telegraph the default.** Facing an adjacent character draws their name and the verb over their
head — `MACC · TRADE`, `VIOLENCIAN · SHOVE`, `WERERAT · HIT` — in the verb's own colour, so the
intent reads before the word does. Bump and `[E]` both fire exactly that. Turning on the spot walks
the label around your neighbours, so you can survey a crowd before touching any of them.

**2. Shove everyone, and they get up again.**

> "Traders will mostly be in stationary positions. Even if you do shove a trader out of the way,
> they should have simple scripting to get back to their original spot … walking and shoving people
> out of the way is going to be a source of comedy. Trying to push someone and not being able to,
> I think, is good physical comedy."

### What that resolves

I had these two filed as opposites and they are not. **A plain character's telegraphed default IS
Shove.** So a wandering Violencian who steps into your path gets barged past — one press, they move,
you take the tile — and no menu appears. A shopkeeper, who stands still and is therefore someone you
walked into *on purpose*, reads Trade. Same rule for everyone, no class-specific branch, and the
"menu pops when I didn't ask" problem disappears on its own rather than needing a guard.

That also means `defaultVerb` is now load-bearing in three places at once — the label, the bump and
`[E]` — so the telegraph and the action cannot disagree by construction.

**3. Hit is offered on everyone, and made expensive to reach.** *"I do want the game to feel like it
allows you to hit whoever you want. I do want it to be more difficult to get to."* On a hostile it
is the default and sits on top. On anyone else it sinks below every other verb, so no bump, `[E]` or
bare tap can land on it — you must open the full list, go looking, and then confirm. The
confirmation re-dresses the list itself rather than adding a modal, and **Cancel starts selected**,
so a held Enter cannot carry through into a punch.

**4. Bribe folded into the offer screen.** *"I don't know that bribe needs to be explicitly broken
out … I would want it to be obvious that it's a bribe without having it as a whole other option."*
It had grown **three** doors onto one fiction: a target-list verb, a wheel node, and the gold tray.
Now one. When the offer is gold with nothing taken, the commit button reads **OFFER THE BRIBE**
instead of MAKE THE OFFER — you never pick "bribe", you discover you are making one.

## Slice 2 gates — met

**977 tests / 168 suites / 0 fail.** `balance:check` clean.

| driven in the live game | result |
|---|---|
| face Macc | `MACC · TRADE` over his head, in gold |
| turn right to a plain Violencian | label follows the look — `VIOLENCIAN · SHOVE`, in brown |
| bump Macc | offer screen opens; **he does not move** |
| `[E]` facing Macc | identical — offer screen, same NPC |
| bump a plain Violencian | shoved (16,11)→(15,11), player takes (16,11), **no menu**, one press |
| Hit on peaceful Bartho | 4th in the list; first pick asks with Cancel preselected, HP untouched |
| …then confirm | 100 → 10 HP |
| Bribe | gone from the list and from the wheel |

One environment note for whoever verifies next: **the Browser pane throttles
`requestAnimationFrame` to zero while hidden** (`document.hidden === true`, 0 frames in 600 ms), so
`_animating` sticks true and no move ever lands. Barge-through looks broken and is not. Shim
`requestAnimationFrame` onto `setTimeout` before testing movement.

## Still open

- **NPCs do not walk home yet.** *"They should have simple scripting to get back to their original
  spot, if possible."* Not built — it is what makes shove-everyone acceptable, and it is the next
  thing. Needs a home position stamped at spawn and a return step when displaced and idle.
- **Pushable scenery.** *"That quality would apply to certain things like trains. Most walls would
  not be pushable, but a boulder might be."* Noted, not built. `heavy` already models the
  unpushable half.
- Whether a failed shove should have its own comic beat — he flagged "trying to push someone and
  not being able to" as the funny part, and right now it is a thud and a recoil with no line.

## Open, for Caelan

1. **Should `Hit` appear on a peaceful NPC?** Right now it does not — `targetVerbs` gates it on
   `hostile`, unchanged by this slice. So bumping a townsperson gives you Talk/Trade/Shove but no way
   to start a fight from the list. You said the harness should "house the fight", and for a hostile
   it does (Hit is already the default there). Opening it up for everyone makes a mis-tap able to
   punch a shopkeeper, so I left it alone rather than guess. Reversible either way.
2. **Wandering NPCs stepping into your path** can now pop a menu you did not ask for. Unproven —
   see whether it bites in play before adding the "only on a deliberate press" guard.
3. **Bribe still has two routes.** `_bribeTarget` survived the offer-screen merge, so bribery is both
   a verb here and gold in the give tray. Pre-existing, unrelated to this slice, still worth settling.
