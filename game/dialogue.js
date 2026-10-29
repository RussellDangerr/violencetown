// dialogue.js — Handcrafted, disposition-driven NPC dialogue (Step 4).
//
// Each NPC with a `dialogueId` maps to one entry here. A conversation is a flat
// list of choices the player picks from; each choice carries an optional
// disposition `delta` (shown as a +N / -N badge with a ☺/☹), an optional `cost`
// in GP (a bribe), a `reply` line, and a persistence mode (the hybrid model):
//   - once:       a story beat — offered once, then gone.
//   - repeatable: a standing action (flatter / insult / bribe) — always offered,
//                 powering the money <-> disposition loop.
//
// main.js (_pickDialogueChoice) applies the delta via give-action's
// applyDispositionDelta (which also handles the flip-to-ally threshold); a
// disposition that craters past the hostile threshold turns the speaker on you.

import { transferGold } from './trade.js';

// (IC2) The delivery order's ice cone, and when the diner cook owes another.
const ORDER_CONE = 'tigers_blood_ice_cone';
function coneOwed(g) {
    const qe = g && g.questEngine;
    if (!qe || !qe.isActive('deliver_burger')) return false;
    const stage = qe.currentStageId();
    const needs = stage === 'get_burger' || stage === 'get_cone'
        || (stage === 'handoff' && qe.owedItems().includes(ORDER_CONE));
    const held = (g.inventory || []).some(s => s && s.itemDef && s.itemDef.id === ORDER_CONE);
    return needs && !held && !!qe.state.flags.iceConeMachineFixed;
}

export const DIALOGUES = {
    pike: {
        name: 'Pike',
        greeting: '"...Company. Ain\'t had company since the river dried up. You fall in like the rest of the junk? Heh."',
        choices: [
            { id: 'lore', label: "Ask how long he's been down here", once: true, delta: 4,
              reply: '"Floated my wagon across when this was still a RIVER. She sank. I woke on the mud — still here. The water did somethin\' to me. Don\'t age, don\'t die, don\'t leave. Just prospect."' },
            { id: 'buy', label: 'Ask about the rope (the grappling hook)', once: true,
              reply: '"My climbin\' rope? She\'ll haul you clean out of this pit. Cost you a thousand — give or take how much I like you. Open the till and we\'ll talk. Press E."' },
            { id: 'deal', label: 'Offer to clear the critters for the rope', once: true,
              onPick: (game, npc) => {
                  if (!game.questEngine) return;
                  game.questEngine.state.flags.pikeDeal = true;
                  const alive = (game.enemies || []).some(e => e.tag === 'canyon_critter' && e.entity && e.entity.isAlive());
                  if (!alive) {
                      game.questEngine.state.flags.pikeDealPaid = true;
                      if (game._grantItem) game._grantItem('grappling_hook', '[Pike eyes the still bodies. "...Already done? Then she\'s yours." He presses the rope into your hands.]');
                  }
              },
              reply: '"...Hah. The vermin gnawin\' at my wagon? Put the two of \'em down and the rope\'s yours — free and clear. A deal\'s a deal down here."' },
        ],
    },
    // (Remembrance Rings) Platero — the Downtown silversmith who fashions a boss
    // remembrance material into a wearable ring. The "fashion" choice is
    // repeatable and self-guards through _fashionRing (needs the material in the
    // bag; won't re-make a ring you already wear), so it's safe to always offer.
    platero: {
        name: 'Platero',
        greeting: '"A silversmith remembers every piece he sets. Bring me something a fight left behind, and I\'ll set it into a ring you can wear."',
        choices: [
            { id: 'about', label: 'Ask what he means by "remembrance"', once: true, delta: 3,
              reply: '"The big ones — the ones that nearly finished you — leave a little of themselves behind. Fur, ash, a tooth. Silver holds a memory better than a mind does. Wear it, and you keep the fight."' },
            { id: 'fashion_rat', label: 'Have him fashion the wererat fur into a ring', repeatable: true,
              onPick: (game) => { if (game._fashionRing) game._fashionRing('wererat_fur', 'rat_ring'); },
              reply: '"Let\'s see what you\'re carrying, then."' },
        ],
    },
    bartho: {
        name: 'Bartho',
        greeting: '"...what."',
        choices: [
            { id: 'bridge', label: 'Ask about the north bridge', once: true,
              reply: '"Barricaded. Years now. Whatever\'s past it can stay past it."' },
            { id: 'hat', label: 'Compliment his hat', once: true, delta: 8,
              reply: '"...you noticed the hat. Huh. Maybe you ain\'t all bad."' },
            { id: 'flatter', label: '[Flatter him]', repeatable: true, delta: 3,
              reply: '"Heh. Keep talkin\', pal."' },
            { id: 'insult', label: '[Insult his mother]', repeatable: true, delta: -25,
              reply: '"...the HELL did you just say about my ma."' },
            { id: 'bribe', label: '[Bribe - 5 GP]', repeatable: true, delta: 10, cost: 5,
              reply: '"This changes nothin\'. (pockets it immediately)"' },
        ],
    },

    // (Phase 6d) Macc the raccoon mechanic — Town's special-buyer: the Converter
    // has a buyer (500 GP).
    macc: {
        name: 'Macc',
        greeting: '"*chittering* ...oh. A customer. Mind the grease. What\'s broke?"',
        choices: [
            { id: 'converter', label: 'Ask if he buys weird car parts', once: true, delta: 5,
              reply: '"That Cataclysmic thing? *eyes gleam* ...five hundred. Cash. Don\'t ask what I do with em."' },
            { id: 'flatter', label: '[Praise his workshop]', repeatable: true, delta: 3,
              reply: '"*preens* ...she\'s a mess, but she\'s MY mess."' },
            { id: 'insult', label: '[Call him a trash panda]', repeatable: true, delta: -25,
              reply: '"TRASH? This is ARTISANAL salvage, you philistine."' },
            { id: 'bribe', label: '[Bribe - 5 GP]', repeatable: true, delta: 10, cost: 5,
              reply: '"*snatches it* ...friend of Macc. For now."' },
        ],
    },

    mince: {
        name: 'Mince',
        greeting: '"Pssst. Hey. You buyin\'? You look like a buyin\' guy."',
        choices: [
            { id: 'goldcard', label: 'Ask why everything costs Gold Card', once: true,
              reply: '"Surcharge on the surcharge, friend. That\'s the Card. You don\'t pay it, you ARE it."' },
            { id: 'deal', label: 'Ask what he\'s selling', once: true, delta: 5,
              reply: '"Eh. Half a rock, mostly. But it\'s MY half a rock. Respect that."' },
            { id: 'flatter', label: '[Flatter him]', repeatable: true, delta: 3,
              reply: '"Smart guy. I LIKE a smart guy."' },
            { id: 'insult', label: '[Call him a two-bit hustler]', repeatable: true, delta: -25,
              reply: '"Two-BIT? I am at LEAST a four-bit hustler, you mope."' },
            { id: 'bribe', label: '[Bribe - 5 GP]', repeatable: true, delta: 10, cost: 5,
              reply: '"Now THAT\'S a language I speak. (it vanishes)"' },
        ],
    },

    glunk: {
        name: 'Glunk',
        greeting: '"...you\'re standin\' in my leanin\' spot."',
        choices: [
            { id: 'sewer', label: 'Ask about the smell off the sewer', once: true,
              reply: '"Smells like the sewer. \'Cause it\'s the sewer. Genius work, that."' },
            { id: 'wall', label: 'Admire how well he holds up the wall', once: true, delta: 8,
              reply: '"...heh. Wall\'d fall right over without me. Somebody gets it."' },
            { id: 'flatter', label: '[Flatter him]', repeatable: true, delta: 3,
              reply: '"Keep it comin\'. I got all day. Literally."' },
            { id: 'insult', label: '[Tell him to get a job]', repeatable: true, delta: -25,
              reply: '"This IS the job. Leanin\'. Don\'t you disrespect the leanin\'."' },
            { id: 'bribe', label: '[Bribe - 5 GP]', repeatable: true, delta: 10, cost: 5,
              reply: '"Mm. I\'ll lean a little friendlier, then. (pockets it)"' },
        ],
    },

    praline: {
        name: 'Praline',
        greeting: '"Ugh, do NOT look at the floor. I just got the floor lookin\' decent."',
        choices: [
            { id: 'grime', label: 'Ask if the grime ever comes off', once: true,
              reply: '"Off? Sweetheart, the grime is load-bearin\'. Take it off, the whole town sags."' },
            { id: 'tidy', label: 'Say the plaza looks spotless', once: true, delta: 8,
              reply: '"...SPOTLESS. You hear that, everybody? SOMEBODY noticed."' },
            { id: 'flatter', label: '[Flatter her]', repeatable: true, delta: 3,
              reply: '"Oh, you. Go on, then. Go ON."' },
            { id: 'insult', label: '[Track mud on her floor]', repeatable: true, delta: -25,
              reply: '"You did NOT. You did not just— get OUT, get out get out!"' },
            { id: 'bribe', label: '[Bribe - 5 GP]', repeatable: true, delta: 10, cost: 5,
              reply: '"Mm. Buys a mop. Buys me likin\' you. (snatches it)"' },
        ],
    },

    // Knuckles stands in the plaza near where the game starts, spoiling for a
    // fight but not starting one (low disposition, neutral since 2026-10-11 —
    // a game that opened on a chase read as broken). A fight with him starts
    // only when you start it: hit him, or taunt him past DIALOGUE_HOSTILE_AT.
    // The 'standdown' choice lands a big positive delta that crosses
    // flipThreshold (30), so applyDispositionDelta fires give-action's
    // becomeAlly flip — he becomes a fighting ally, mid-fight or not.
    knuckles: {
        name: 'Knuckles',
        greeting: '"You got a LOT of nerve walkin\' up on me like that."',
        choices: [
            { id: 'standdown', label: '[Hands up — apologize, back off slow]', once: true, delta: 70,
              reply: '"...alright. ALRIGHT. You\'re backin\' off. Fine. I hate this. But fine — I\'m with ya."' },
            { id: 'why', label: 'Ask what his problem even is', once: true,
              reply: '"My PROBLEM? You\'re breathin\' my air in MY plaza, that\'s my problem."' },
            { id: 'taunt', label: '[Square up and taunt him]', repeatable: true, delta: -25,
              reply: '"Oh, you wanna GO? You absolutely wanna GO."' },
        ],
    },

    // ── Chapter Two · Downtown cast (Phase 4) ────────────────────────────────
    // STUBS. Greetings + placeholder choices so every Downtown NPC is talkable
    // and the playground is walkable end-to-end. The burger hand-off (diner_cook)
    // and the delivery choice (mq2_recipient) get their real quest hooks in the
    // MQ2 wiring pass — for now they just talk. Rewrite freely.
    diner_cook: {
        name: 'Short-Order Cook',
        greeting: '"Order up — oh. You. You\'re the delivery type, aren\'t you. I can always tell."',
        choices: [
            // (Phase 4 MQ2) The dialogue delivery idiom: only shown at the get_burger
            // stage; grants the deliverable via _grantItem (emits item_pickup → the
            // quest advances). The trade window is the other idiom.
            { id: 'take_burger', label: 'Take the burger and fries for delivery', once: true,
              available: (g) => g.questEngine && g.questEngine.currentStageId && g.questEngine.currentStageId() === 'get_burger',
              onPick: (g) => { if (g._grantItem) g._grantItem('burger_fries', '[The cook slides a warm paper bag across the counter. Burger and fries — for delivery.]'); },
              reply: '"Bag\'s hot. Somebody past the bank\'s waitin\' on it. Don\'t eat it, delivery type."' },
            // (IC2) The order includes the ice cone. The machine makes only one and a
            // cone is not a quest item, so a lost one would stall the delivery: while
            // the order still needs a cone, the machine is fixed and none is in the
            // bag, the cook hands over another (the Factory manager's `collect` shape).
            { id: 'another_cone', label: '[TEXT]', repeatable: true,
              available: (g) => coneOwed(g),
              onPick: (g) => { if (g._grantItem) g._grantItem(ORDER_CONE, '[TEXT]'); },
              reply: '[TEXT]' },
            { id: 'burger', label: 'Ask about the burger and fries', repeatable: true,
              reply: '"Bag\'s under the lamp. Somebody out there\'s waitin\' on it."' },
            { id: 'flatter', label: '[Compliment the grease]', repeatable: true, delta: 3,
              reply: '"Forty years on this griddle. Damn right it\'s good grease."' },
            { id: 'bribe', label: '[Bribe - 5 GP]', repeatable: true, delta: 10, cost: 5,
              reply: '"...extra pickles for you, then."' },
        ],
    },
    banker: {
        name: 'The Financier',
        greeting: '"Welcome to First Blood. *a smile with too many teeth* ...you look positively FULL of life. How can we serve you?"',
        choices: [
            { id: 'loan', label: 'Ask what the bank actually does', once: true,
              reply: '"We lend. We collect. We are very, very patient about the collecting. (Placeholder — the Financier\'s arc comes later.)"' },
            { id: 'flatter', label: '[Flatter him]', repeatable: true, delta: 3,
              reply: '"Charming. We do so like the charming ones."' },
            { id: 'insult', label: '[Call him a bloodsucker]', repeatable: true, delta: -25,
              reply: '"*the smile does not move* ...how droll."' },
        ],
    },
    casino_op: {
        name: 'Pit Boss',
        greeting: '"Table\'s open, the odds are terrible, and the drinks are free. What\'s your poison?"',
        choices: [
            { id: 'games', label: 'Ask what they\'re running', once: true,
              reply: '"Everything that takes your money. (Placeholder — the casino minigames come later.)"' },
            { id: 'flatter', label: '[Flatter the house]', repeatable: true, delta: 3,
              reply: '"Ha! House always likes a talker."' },
            { id: 'bribe', label: '[Bribe - 5 GP]', repeatable: true, delta: 10, cost: 5,
              reply: '"...comped. Enjoy the floor."' },
        ],
    },
    mq2_recipient: {
        name: 'Stranded Traveler',
        greeting: '"Hey — hey, you. You didn\'t happen to bring food, did you? I haven\'t eaten since the bridge."',
        choices: [
            // (Phase 4 MQ2) Dialogue delivery: only shown at the handoff stage while
            // the player holds everything still owed; handOver removes it all AND
            // emits item_given per item (the event the satchel give fires), so
            // either idiom completes MQ2 (IC2: the order is more than one item).
            { id: 'deliver', label: '[TEXT]', once: true,
              available: (g) => !!g.questEngine && g.questEngine.currentStageId() === 'handoff' && g.questEngine.holdsOwed(),
              onPick: (g, npc) => g.questEngine.handOver(npc.id),
              reply: '"...oh, thank god. Thank you — really. Here, take this for your trouble."' },
            { id: 'ask', label: 'Ask what they\'re doing out here', repeatable: true,
              reply: '"Waitin\'. Starvin\'. Same as always."' },
            { id: 'flatter', label: '[Reassure them]', repeatable: true, delta: 3,
              reply: '"...thanks. That helps. A little."' },
        ],
    },
    downtown_merchant: {
        name: 'Corner Merchant',
        greeting: '"Fresh stock, downtown prices. Press E to see the goods."',
        choices: [
            { id: 'ask', label: 'Ask how business is', repeatable: true,
              reply: '"Slow. Everybody\'s broke or bitten. You buyin\' or browsin\'?"' },
            { id: 'bribe', label: '[Bribe - 5 GP]', repeatable: true, delta: 10, cost: 5,
              reply: '"...I\'ll knock a little off. Maybe."' },
        ],
    },
    downtown_merchant2: {
        name: 'Newsstand Kid',
        greeting: '"Papers, gum, batteries, secrets. What\'s it gonna be?"',
        choices: [
            { id: 'ask', label: 'Ask what\'s in the news', repeatable: true,
              reply: '"Bank bought another block. Nobody saw the buyer. Spooky, right?"' },
            { id: 'flatter', label: '[Flatter the kid]', repeatable: true, delta: 3,
              reply: '"*grins* ...you\'re alright."' },
        ],
    },
};

// ── The Crat's dispute (plans/cs1-crat-talk-both-sides.md) ───────────────────
// A side room north of the Sewer. Two sides claim the same thing; the Crat asks
// you to rule. Hear both, rule for one; either side will pay you to rule its
// way. Every line is a placeholder for Caelan to write.
//
// State lives in the quest flags, which the save keeps (an NPC's spent `once`
// choices do not survive a reload, so none of these use `once`):
//   cratHeardA / cratHeardB  you heard that side out
//   cratBribe                'a' | 'b' — whose money you took (one offer only)
//   cratRuling               'a' | 'b' — who you ruled for
export const CRAT = {
    trueSide: 'a',                         // the side in the right; the clues point here
    sides: ['a', 'b'],
    heardFlag: (s) => (s === 'a' ? 'cratHeardA' : 'cratHeardB'),
};
// Left at the 5 GP every other bribe in the game uses.
export const CRAT_BRIBE_GP = 5;

const cratFlags = (g) => (g && g.questEngine && g.questEngine.state && g.questEngine.state.flags) || null;
const cratFlag = (g, k) => { const f = cratFlags(g); return f ? f[k] : undefined; };
const setCratFlag = (g, k, v) => { const f = cratFlags(g); if (f) f[k] = v; };
const heardBoth = (g) => CRAT.sides.every(s => !!cratFlag(g, CRAT.heardFlag(s)));
const ruled = (g) => !!cratFlag(g, 'cratRuling');

// Six ways to rule: for either side, times whose money you took (none, the side
// you ruled for, the other side). Exactly two are on offer at a time.
function cratRulingChoices() {
    const out = [];
    for (const side of CRAT.sides) {
        const verdict = side === CRAT.trueSide ? 'the side in the right' : 'the side in the wrong';
        for (const bribe of ['none', 'same', 'other']) {
            const paidBy = bribe === 'none' ? null : (bribe === 'same' ? side : CRAT.sides.find(s => s !== side));
            out.push({
                id: `rule_${side}${paidBy ? '_paid_' + paidBy : ''}`,
                label: `[TEXT: rule for side ${side.toUpperCase()}]`,
                repeatable: true,
                available: (g) => heardBoth(g) && !ruled(g) && (cratFlag(g, 'cratBribe') ?? null) === paidBy,
                onPick: (g) => setCratFlag(g, 'cratRuling', side),
                reply: `[TEXT: the reveal, "you are not the mother" — you ruled for ${verdict}`
                    + (bribe === 'none' ? ', unbought' : bribe === 'same' ? ', paid by that side' : ', paid by the other side') + ']',
            });
        }
    }
    return out;
}

function cratSide(side) {
    const flag = CRAT.heardFlag(side);
    const S = side.toUpperCase();
    return {
        name: `[NAME: side ${S}]`,
        greeting: `[TEXT: side ${S} greets you]`,
        choices: [
            { id: 'testify', label: `[TEXT: hear side ${S} out]`, repeatable: true,
              available: (g) => !cratFlag(g, flag),
              onPick: (g) => setCratFlag(g, flag, true),
              reply: `[TEXT: side ${S}'s side of it]` },
            { id: 'again', label: `[TEXT: ask side ${S} again]`, repeatable: true,
              available: (g) => !!cratFlag(g, flag) && !ruled(g),
              reply: `[TEXT: side ${S} repeats itself]` },
            // The bribe runs the other way to every other in the game: they pay you.
            { id: 'offer', label: `[TEXT: take side ${S}'s money - ${CRAT_BRIBE_GP} GP]`, repeatable: true,
              available: (g, npc) => !!cratFlag(g, flag) && !ruled(g) && !cratFlag(g, 'cratBribe')
                  && (npc ? (npc.gold ?? 0) >= CRAT_BRIBE_GP : true),
              onPick: (g, npc) => {
                  if (transferGold(npc, g, CRAT_BRIBE_GP, 'dialogue')) setCratFlag(g, 'cratBribe', side);
              },
              reply: `[TEXT: side ${S} pays you to rule its way]` },
            { id: 'after', label: `[TEXT: ask side ${S} about the ruling]`, repeatable: true,
              available: (g) => ruled(g),
              reply: `[TEXT: side ${S} on the ruling]` },
        ],
    };
}

DIALOGUES.crat = {
    name: 'The Crat',
    greeting: '[TEXT: the Crat greets you]',
    choices: [
        { id: 'dispute', label: '[TEXT: ask what the dispute is]', repeatable: true,
          available: (g) => !ruled(g),
          reply: '[TEXT: the Crat lays out the dispute and asks you to hear both sides]' },
        { id: 'waiting', label: '[TEXT: ask what happens now]', repeatable: true,
          available: (g) => !heardBoth(g) && !ruled(g),
          reply: '[TEXT: the Crat says to hear both sides first]' },
        ...cratRulingChoices(),
        { id: 'after', label: '[TEXT: ask the Crat about the ruling]', repeatable: true,
          available: (g) => ruled(g),
          reply: '[TEXT: the Crat on the ruling]' },
    ],
};
DIALOGUES.crat_side_a = cratSide('a');
DIALOGUES.crat_side_b = cratSide('b');

// ── The Factory's unpaid bill (plans/ic6-factory-bill-ice-cone-machine.md) ──
// The manager holds the diner's ice cone machine part until the bill is paid.
// The dialogue `cost` refuses the choice when you hold less and otherwise moves
// exactly this much to him. Paid is a quest flag, which the save keeps.
//
// Paying hands the part over. A paid bill never loses it: while the machine is
// still broken and the part is not in your bag (a full bag when you paid, or
// lost since), `collect` hands over another. The machine's flag is set by its
// row in item-uses.js.
export const FACTORY_BILL_GP = 100;   // ICR5
export const MACHINE_PART = 'ice_cone_machine_part';
const flagsOf = (g) => (g && g.questEngine && g.questEngine.state && g.questEngine.state.flags) || {};
const billPaid = (g) => !!flagsOf(g).factoryBillPaid;
const holdsPart = (g) => (g.inventory || []).some(s => s && s.itemDef && s.itemDef.id === MACHINE_PART);
const partOwed = (g) => billPaid(g) && !flagsOf(g).iceConeMachineFixed && !holdsPart(g);
const handOverPart = (g) => { if (g._grantItem) g._grantItem(MACHINE_PART, '[TEXT]'); };

DIALOGUES.factory_manager = {
    name: '[Factory Manager]',
    greeting: '[TEXT]',
    choices: [
        { id: 'bill', label: '[TEXT]', repeatable: true,
          available: (g) => !billPaid(g),
          reply: '[TEXT]' },
        { id: 'pay', label: `[TEXT - ${FACTORY_BILL_GP} GP]`, repeatable: true, cost: FACTORY_BILL_GP,
          available: (g) => !billPaid(g),
          onPick: (g) => {
              if (g.questEngine) g.questEngine.state.flags.factoryBillPaid = true;
              handOverPart(g);
          },
          reply: '[TEXT]' },
        { id: 'collect', label: '[TEXT]', repeatable: true,
          available: (g) => partOwed(g),
          onPick: (g) => handOverPart(g),
          reply: '[TEXT]' },
        { id: 'paid', label: '[TEXT]', repeatable: true,
          available: (g) => billPaid(g) && !partOwed(g),
          reply: '[TEXT]' },
    ],
};

export function getDialogue(id) {
    return DIALOGUES[id] || null;
}
