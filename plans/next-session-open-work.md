# Open work parked at the close of v0.20.0

**Parked:** 2026-07-25, immediately after `v0.20.0` shipped to `main`.
**Live code is on `dev`/`main` at `0984bf7`.** Nothing here is in-flight — every item below is a
*decision not yet made* or a *gap deliberately left*, not half-finished work. Start anywhere.

Specs that back these: `plans/enemy-kits-and-dots-design.md` (§9 open questions),
`plans/gold-standard-design.md` (Laws, open hooks), `plans/balancing-bible.md`.

---

## A. Rulings Caelan owes, that block lints or content

### A1. The −15 armor band has no Law 4 row — **blocks Pike**
Law 3 lists **−15** as a fragility stop (TTK 3), but Law 4's role table jumps straight from −30
(fodder, 5–20 GP) to −5…0 (standard, 20–60 GP). Two spawns sit in that hole: **Pike** (canyon) and
the **Borgir boss**.

`tools/balance-harness.mjs` ships a `bruiser` row at **15–40 GP**, interpolated, and its comment says
plainly that it is an open question rather than settled law. **Pike was deliberately left with no
kit** — it is also a vendor, so it is excluded from the kit lint twice over.

**Decide:** is 15–40 right, or does −15 fold into fodder or standard? Then author Pike (or rule that
vendors never carry kits, which is the current lint behaviour and may deserve to be law).

### A2. Poison-flip threshold direction
`game/give-action.js` flips an NPC hostile when poisoned food drops them to `<= -flipThreshold` —
a downward mirror of the existing upward ally-flip check. That was the most natural symmetric
reading, but it is a **design choice, not something derived from existing code**. Confirm or replace.

### A3. Does opening the REMOTICON advance a world turn?
Pre-existing question, now sharper. With DoTs live, a bag-open that costs a turn also costs a poison
tick — which partly undoes Law 7's guarantee that *reading your bag is free*. That guarantee is the
whole reason BG3's post-combat panic can't happen here, so this is load-bearing now.

Related, same family: an enemy can currently act while the bag is open.

### A4. Boss band derivation
The Wererat (armor 0, tagged `wererat_boss`) lints as **standard** (20–60 GP) rather than Law 4's
boss band (500–2,500). Almost certainly correct for an act-1 boss — but it should be *stated* rather
than inferred from armor. A `_boss` tag overriding the armor→band derivation is the obvious shape.

---

## B. Content gaps the machinery is now waiting on

### B1. No elite or boss enemies exist
`ROLE_BANDS` defines elite (armor +5…+10, 100–200 GP) and the spec defines boss (500–2,500). **The
roster has neither.** Every fighter is vermin, fodder or standard. The `KIT_DEFAULTS` elite row is
bandages and bombs because nothing better exists to put in it.

Law 5 (bosses break the band by SPENDING, not by pools) is still entirely unimplemented and was
always deferred to "the first boss build". The wallet machinery it needs now exists.

### B2. Enemies never USE their kits
`resolveLoadout` hands back real item defs precisely so an enemy *can* drink what it carries, and
the kit drops on death. But no AI spends a kit item: the only wallet-spend that exists is
`healPurchase` in `npc.js:240`, which burns **gold** at the peg rather than eating the bread it is
holding.

Making an enemy eat its own food is strictly better — diegetic, visible, and it drains the nameplate
pips in front of the player. That is the "watch the dread count down" payoff the pips were built for.

### B3. Cone of Cold is the only balance-lint flag
`1.40 dmg/MP` against a 1.50 floor. It has been the single flag for several releases. Retune it or
widen the band — but decide, rather than letting a permanent flag train everyone to ignore the lint.

---

## C. Known dead or asymmetric code

### C1. Unreachable `Escape` branches
Seven `Escape` cases in `main.js` (around lines 979, 1015, 1026, 1038, 1051, 1067, 1093) are
shadowed by an earlier guard and can never fire. The entire `ITEM_THROW_DIR` mode is likewise
unreachable.

### C2. No modifier-key guard
No handler anywhere checks `ctrlKey` / `metaKey` / `altKey`, so browser chords like `Ctrl+D` also
trigger game actions.

### C3. Two input asymmetries, both real gaps rather than doc bugs
- The REMOTICON's **item, gear and ring actions are pointer-only** — there is no keyboard cursor
  inside it.
- **Aiming the reticle, turning in place, and the 1–9 hotbar are keyboard-only.**

Both are documented as-is in README.md and the in-game help, so nothing is *lying* — but they are
worth closing.

### C4. `mystery_meat` can't heal on the throw path
Sewer fare flips sign cleanly for DoT poitions and on the *give* path. It cannot flip for a
**flat-damage** item thrown at a sewer-dweller, because `resolveThrow`'s damage branch routes through
`combatAttack` → `Math.max(1, raw − armor)`, which clamps a would-be heal back to 1 damage.

So a thrown mystery meat harms everyone; hand-fed, it heals a sewer-dweller. Documented in
`items.js` rather than forced. Fixing it means either giving `mystery_meat` a 1-turn health poition
instead of flat damage, or teaching the combat pipeline to carry healing — the former is far cheaper.

---

## D. Housekeeping

### D1. `feature/diagonal-prototype` is a fossil
Last commit **2026-06-14**. Its diff against `dev` *deletes* rings, xmb, defeat-scenarios, the
balance harness and the wallets tests — it predates nearly everything current. It is not a merge
candidate. Delete it, or keep it explicitly as an archive and say so.

### D2. The naming gate has a false positive
`git grep -iE 'violence[ _-]+town'` returns a hit in
`plans/item-hotbar-xmb-implementation.md` — it is *quoting the naming rule itself*, same exemption
class as CLAUDE.md. As written, the pre-merge gate fails on it. Either add the exclusion to the
documented command or reword that line.

### D3. CLAUDE.md says MP is inert — it isn't
"Player resources: HP / MP (cyan bar, **currently inert**) / GP". Spells have spent MP for a while
(fireball 12, coneOfCold 10, boo 8) and `mana_poition` now restores it. Stale line, worth fixing.

---

## E. Ideas raised and deliberately not built

- **Enemy buys YOUR gear** (Law 6 open hook) — a thief archetype that throws gold at you and takes
  your sword. You're compensated; you're also disarmed. Funny. Deferred.
- **AI reads the player's wallet** — bribe demands and shop prices scaling to visible player wealth.
  Very Violencetown. Deferred.
- **5-Zone Body reconciliation** — survives as the positional layer (Back zone = backstab ×1.5), not
  as split HP pools. Needs a ruling before the bible states it as law.
- **Elemental coverage matrix** — which damage types exist and the weakness table per enemy family.
  `fire` and `poison` joined `sludge`/`cold`/`energy`/`fear` this release without a matrix to sit in.
