# The board's My Turn view

## Goal

The strip at the top of the board lists everything on Your turn, but much of that can't move yet:
a slice waiting for approval may sit behind a ruling, and a card may be waiting on Claude's reply.
Caelan wants a view that shows only the cards he can move forward right now.

## What it shows

A third view beside Board and Graph, labelled My Turn with a live count. It shows full cards, so
every gesture works in place: option buttons, Approve, Merge it, Changes, Tweak it, Someday and the
one box.

A card is in the view when all of these hold:

1. **It is on Your turn:** an open ruling with options, an untriaged idea, a tweaked Ready slice with
   no approval, a Review branch with no verdict, or a card where Claude's last line asks him something.
2. **Nothing blocks it:** every card in its `blockedBy` is done. A slice behind a ruling or behind an
   unmerged branch stays out, and the ruling or branch is what shows instead.
3. **The next word isn't Claude's:** if his line is the last on the thread, the card is waiting on
   Claude.

The rule is one pure function, `myTurn()` in `board-model.js`, built on `yourTurn()`.

## How it behaves

- Cards group by what they ask for: merge calls, Claude's questions, rulings, approvals, then ideas.
  Inside a group, the ruling that frees the most work comes first, then board order.
- A card leaves the view the moment he acts on it.
- Dragging is off here, since the view has no lanes.
- A chip naming a card outside the view switches to Board and goes to that card.
- The page remembers the last view per browser. The first visit opens on Board.

## Acceptance

- `myTurn()` keeps and drops the right cards, tested for each rule above, including a hostile card.
- In a real browser against a fake store: the button's count matches the model, a ruling answered in
  the view leaves it and writes to the store, a chip jump lands on Board, and the view survives a
  reload.
- Screenshots at 3440x1440 and at phone width, and no console errors.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Out of scope

Changing Your turn or the strip, the loop's rules, or any card's content. Idea, ruling and card
content never goes in this repo.
