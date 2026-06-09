// action-wheel.js — pure model for the three-ring action wheel.
//
// No DOM, no canvas: main.js drives it (open/input/fire), renderer.js reads it
// (draw), tests exercise it directly. The wheel composes one ACTION, one ITEM,
// and one DIRECTION; each action lights only the rings it uses (the rest dim).

export const WHEEL_ACTIONS = ['Attack', 'Skill', 'Throw', 'Give', 'Defend', 'Run'];

// Which rings each action uses. item = needs an inventory item; aim = needs a
// cardinal direction. Rings not used are dimmed and skipped by the grip.
export const ACTION_RINGS = {
  Attack: { item: false, aim: true  },
  Skill:  { item: false, aim: false }, // placeholder until skills land
  Throw:  { item: true,  aim: true  },
  Give:   { item: true,  aim: true  },
  Defend: { item: false, aim: false }, // self
  Run:    { item: false, aim: true  },
};

export const CARDINALS = ['N', 'E', 'S', 'W'];          // clockwise from top
export const DIR_VEC = {
  N: { dx: 0, dy: -1 }, E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },  W: { dx: -1, dy: 0 },
};

// Grip positions, inner -> outer.
export const RING_ACTION = 0, RING_ITEM = 1, RING_AIM = 2;

export function createWheelState() {
  return {
    actionIndex: 0,    // into WHEEL_ACTIONS
    itemSlot: -1,      // inventory slot for the chosen item (-1 = none)
    aim: 'E',          // one of CARDINALS
    grip: RING_ACTION, // which ring the keyboard is holding
    lastFired: null,   // { action, itemSlot, aim } for express double-tap repeat
  };
}

export function currentAction(w) { return WHEEL_ACTIONS[w.actionIndex]; }
export function ringsFor(action) { return ACTION_RINGS[action] || { item: false, aim: false }; }

// The grip's legal ring order for the current action (skips dimmed rings).
function gripOrder(w) {
  const r = ringsFor(currentAction(w));
  const order = [RING_ACTION];
  if (r.item) order.push(RING_ITEM);
  if (r.aim) order.push(RING_AIM);
  return order;
}

// Move the grip inward/outward (delta -1/+1), clamped to rings the action uses.
export function moveGrip(w, delta) {
  const order = gripOrder(w);
  let i = order.indexOf(w.grip);
  if (i === -1) i = 0;
  i = Math.max(0, Math.min(order.length - 1, i + delta));
  w.grip = order[i];
  return w.grip;
}

// Spin the held ring one slice. validItemSlots = inventory slot indices valid for
// the current action (caller computes from inventory + useType + questItem).
export function spinRing(w, delta, validItemSlots) {
  if (w.grip === RING_ACTION) {
    const n = WHEEL_ACTIONS.length;
    w.actionIndex = (w.actionIndex + delta + n) % n;
    // grip stays on the action ring (valid for every action); the contextual
    // ring-skip lives in moveGrip/gripOrder, so spinning here can't strand it.
  } else if (w.grip === RING_ITEM) {
    const slots = validItemSlots || [];
    if (slots.length === 0) { w.itemSlot = -1; return; }
    let i = slots.indexOf(w.itemSlot);
    if (i === -1) i = (delta > 0 ? -1 : 0); // first spin lands on slot 0 / last
    w.itemSlot = slots[(i + delta + slots.length) % slots.length];
  } else if (w.grip === RING_AIM) {
    const i = CARDINALS.indexOf(w.aim);
    w.aim = CARDINALS[(i + delta + CARDINALS.length) % CARDINALS.length];
  }
}

// The current selection as a fire descriptor.
export function compose(w) {
  return { action: currentAction(w), itemSlot: w.itemSlot, aim: w.aim };
}

// Nearest-target cardinal for auto-aim. targets = [{x,y}, ...] candidate tiles;
// returns a cardinal string or null. Pure given the candidate list + player pos.
export function autoAimDir(playerX, playerY, targets) {
  let best = null, bestD = Infinity;
  for (const t of (targets || [])) {
    const dx = t.x - playerX, dy = t.y - playerY;
    const d = Math.abs(dx) + Math.abs(dy);
    if (d === 0 || d >= bestD) continue;
    best = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
    bestD = d;
  }
  return best;
}
