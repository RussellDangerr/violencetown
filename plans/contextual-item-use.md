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
