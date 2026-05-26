# The Gold Card — design memory

> A note jotted from a 2026-05-26 design conversation. Captures the
> intent behind the GP (Gold Points) resource so future feature work
> can pull from the same well. No code committed against this yet
> beyond a numeric balance + HUD pill rendering.

## What it is, in-universe

The **Gold Card** is the single physical artifact every Violencian
carries. It's the citizen's wallet, ID, and credit line collapsed into
one rectangle of stamped gold. Mechanically it's just a number on the
HUD; in-fiction it does a *lot*:

- **Bank account** — your GP balance lives on the card. Spent at
  vendors, deposited from work and loot, drained by penalties.
- **Credit line** — you can run a negative balance up to some limit
  (TBD), with interest or worse consequences. The card opens lines
  of credit; the line closing is its own event.
- **Rewards points holder** — vendors stamp the card with loyalty
  points that ladder into discounts, comps, or buy-in privileges to
  members-only areas. Same balance bucket as the spendable GP, or a
  parallel ledger — open design question.
- **Identification card** — has the holder's portrait stamped in the
  center, dollar-bill-style. Around the edges: a card number, ID
  number, issue date, biometric markers, "Town ID" — the issuing
  authority's seal sits in a corner.
- **Government / Town ID** — the same artifact is used by the local
  authorities to verify citizenship and track activity. Showing the
  card is non-optional in many interactions.

The visual reference: imagine a **dollar bill that's also a credit
card**, with the holder's face in the central oval and a fan of
numbers / serial codes / Town ID stamps arrayed around the
perimeter. Gold-leaf face, dark embossing, scuffed at the corners
from years of use.

## What GP does today (v0.8.x scope)

- It's a resource the player accumulates. Reset to 0 on `_fullReset`.
- It's displayed on the HUD as a Gold Card pill in the HP panel
  (HP / MP / GP stacked, weapon line below).
- Enemies all have GP = 0 — they don't carry, drop, or care.
- Player HP and MP are 100/100; the player gains GP through
  gameplay and (eventually) must spend GP to win fights, buy
  equipment from enemies, bribe NPCs, hire urchins as distractions,
  etc.

## What it's meant to do (future)

- GP is intended to scale roughly **1:1 with HP** as a design
  intuition: it's a resource you're always gaining and always
  spending, with the same pressure as a health bar. "You're never
  *quite* in the black."
- Vendor interactions debit GP. Bribery / coercion debits GP. Loot
  credits GP.
- Eventually NPCs carry GP too — robbery becomes a verb.
- The credit-line and ID aspects unlock as event-driven systems
  (debt collectors, faction allegiance via card scan, lost-card
  consequences).

## Visual TODO when GP gets its own feature pass

- Draw the full Gold Card as an inspectable artifact (open it from
  the menu sheet?). Faithful dollar-bill / credit-card render with
  player portrait, ID strip, balance, credit limit, rewards tier.
- The HUD pill stays as the compact always-visible view.
- Spending/depositing events: brief +N / -N particle floating off
  the pill, same vocabulary as combat damage numbers.

## Open design questions (deferred)

- Are rewards points the same bucket as spendable GP, or a parallel
  ledger?
- What does running negative GP cost? Interest? Faction reputation
  damage? Health drain?
- Can NPCs steal your card? Replacement quest?
- Does the card actually depict the player character's sprite, or a
  static "citizen ID" portrait that's procedurally generated?
