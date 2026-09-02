# The fence — stolen goods, and the one person who will take them

**Built:** 2026-09-02, on `feature/npcs-go-home`, immediately after Thieve shipped.
**Asked for by Caelan** when picking what to expand: *"#2"* — the fence.

## The gap

Thieve shipped creating contraband in a world with no concept of it. `_robbed` was written by the
theft resolver and read by exactly two things: respawn, and the save. `sellPrice` had never heard of
provenance. So you could rob someone blind and sell it **straight back to them at market rate**, and
nobody in the world had an opinion about any of it.

A verb that generates loot needs an economy that reacts to it, or the loot is just shopping with
extra steps.

## Two opinions, deliberately different in kind

| refusal | who | when |
|---|---|---|
| `THEY RECOGNISE IT` | the **victim** | always — even a clean theft they never noticed |
| `IT'S TOO HOT FOR THEM` | the **street** | only when a take was **noticed** |

The split is the point.

**Ownership is personal.** A clean theft leaves the victim perfectly willing to trade with you, so
walking back to sell someone their own sack is a thing you can genuinely try. They know their own
property. Ownership outranks heat when both apply, because it is the more specific refusal and the
better joke.

**Heat is social.** It exists only when somebody *noticed*, which makes the clean/noticed split pay
a **second** time: get away with it cleanly and your loot is worth full price anywhere in town. Get
seen, and the whole street closes to you.

## Hooch was already the fence

`fence: true` on the Bootlegger in town. This is not a new character — his authored barks have said
*"No refunds, no questions"* since he was written. The flag makes his own line true.

Macc, standing in the same square, is deliberately **not** a fence. Without somewhere that refuses,
the fence is not a choice.

## The cost of theft is logistics, not a haircut

A fence pays **normal market price**. No discount, no premium.

The genre convention is a percentage cut, and it was rejected: theft here is already expensive —
you must be unseen, you spend a weight budget, and being caught is a permanent enemy at the
disposition floor plus a district that gets warier. Taxing the payout on top would make theft
strictly worse than buying. So the cost of a noticed theft is that you have to **carry it to the
right person**, and finding Hooch is the price.

## Heat is per ITEM ID, not per object

The bag holds **stacks, not instances**. There is no per-object provenance and adding one would be a
large change to the inventory for a small gain.

So one hot soap taints your whole soap supply until a fence takes one off your hands. That reads as
a consequence rather than a bug — nobody, the vendor included, can tell your stolen soap from your
own — and it creates real pressure to offload. Stated here so nobody later "fixes" it.

## Where it lives

`offer.js` stays **pure** and still has no idea what a theft is. `commitBlocker` is handed two
answers through `ctx` — `stolenFrom(id)` and `isHot(id)` — and a caller that supplies neither
behaves exactly as it did before. Every pre-existing call site passes neither.

`_hot` (itemId → count) sits beside `_robbed`, is written **only** in the noticed branch of the
theft resolver, is decremented in the offer commit, and is persisted and validated alongside it.
The commit is the one place heat clears, and only a fence can reach it with a hot item, because
`commitBlocker` refuses everyone else first.

## Verified live

- Four takes off a Wererat: the first three stayed clean, the take that tripped the notice put
  exactly that one item on the ledger — `hot: { soap: 1 }`.
- Hot soap → **Macc**: `IT'S TOO HOT FOR THEM`. → **Hooch**: allowed, **paid 7 GP**, soap gone,
  `hot: { soap: 0 }`.
- Clean bandage from the same robbery → Macc: fine.
- Clean theft off a Violet Fungus, who stays neutral and trading — selling the sack **back to them**
  reads `THEY RECOGNISE IT`; selling the same sack to a different fungus is fine.

1100 tests / 198 suites / 0 fail. `balance:check` clean.

## Open, and deliberately not built

- **A fence has no stock of his own hot goods.** Fencing puts items into Hooch's hands and nothing
  ever resells them. A shelf of other people's belongings would be the natural next beat.
- **Heat never decays.** Paranoia cools off on its own; heat does not. It may want the same
  treatment, or it may be better as a permanent mark — a playtest question.
- **No fence outside town.** One fence is enough to prove the loop; a second (the sewer would suit
  it) is content, not machinery.
