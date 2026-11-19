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
import { switchOff as switchOffHypno } from './hypno-vision.js';   // (HV1) the nerd's off switch

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

// (DQ1) A story beat the cook has moved past: the burger is out of the diner. True once
// the delivery has left its pickup stage, or is done.
const burgerPickedUp = (g) => {
    const qe = g && g.questEngine;
    if (!qe) return false;
    if (qe.isComplete('deliver_burger')) return true;
    return qe.isActive('deliver_burger') && qe.currentStageId() !== 'get_burger';
};
// True once the car is fixed, which is what opens the north bridge.
const bridgeOpen = (g) => !!(g && g.questEngine && g.questEngine.getFlag('carFixed'));

export const DIALOGUES = {
    pike: {
        name: 'Pike',
        greeting: 'Pike lives in the canyon. He has the grappling hook.',
        choices: [
            { id: 'lore', label: 'Ask how long he has been in the canyon', once: true, delta: 4,
              reply: 'Pike has been in the canyon for a long time. His disposition goes up.' },
            { id: 'buy', label: 'Ask about the grappling hook', once: true,
              reply: 'Pike has the grappling hook. Offer to clear the canyon critters and he gives it to you.' },
            { id: 'deal', label: 'Offer to clear the critters for the hook', once: true,
              onPick: (game, npc) => {
                  if (!game.questEngine) return;
                  game.questEngine.state.flags.pikeDeal = true;
                  const alive = (game.enemies || []).some(e => e.tag === 'canyon_critter' && e.entity && e.entity.isAlive());
                  if (!alive) {
                      game.questEngine.state.flags.pikeDealPaid = true;
                      if (game._grantItem) game._grantItem('grappling_hook', 'Pike gives you the grappling hook.');
                  }
              },
              reply: 'Kill the canyon critters and Pike gives you the grappling hook. If they are already dead, he gives it to you now.' },
        ],
    },
    // (Remembrance Rings) Platero — the Downtown silversmith who fashions a boss
    // remembrance material into a wearable ring. The "fashion" choice is
    // repeatable and self-guards through _fashionRing (needs the material in the
    // bag; won't re-make a ring you already wear), so it's safe to always offer.
    platero: {
        name: 'Platero',
        greeting: 'Platero is a silversmith in Downtown. He makes rings from boss drops.',
        choices: [
            { id: 'about', label: 'Ask how the rings are made', once: true, delta: 3,
              reply: 'Bring Platero a material a boss dropped, such as wererat fur or Fire Blood. He sets it into a ring you can wear. His disposition goes up.' },
            { id: 'fashion_rat', label: 'Have him fashion the wererat fur into a ring', repeatable: true,
              onPick: (game) => { if (game._fashionRing) game._fashionRing('wererat_fur', 'rat_ring'); },
              reply: 'Platero makes a rat ring from the wererat fur. The fur must be in your bag. He does not make a ring you already wear.' },
            { id: 'fashion_fire', label: 'Have him set the Fire Blood into a ring', repeatable: true,
              requiresItem: 'fire_blood',
              onPick: (game) => { if (game._fashionRing) game._fashionRing('fire_blood', 'fire_ring', 3); },
              reply: 'Platero makes a fire ring from 3 Fire Blood. They must be in your bag. He does not make a ring you already wear.' },
        ],
    },
    bartho: {
        name: 'Bartho',
        greeting: 'Bartho is a townsperson.',
        greetings: [{ when: bridgeOpen, text: 'The north bridge is open now that the car is fixed.' }],
        choices: [
            { id: 'bridge', label: 'Ask about the north bridge', once: true,
              reply: 'The north bridge is closed. It opens when the car is fixed.' },
            { id: 'hat', label: 'Compliment his hat', once: true, delta: 8,
              reply: 'Bartho likes the compliment. His disposition goes up.' },
            { id: 'flatter', label: 'Compliment him', repeatable: true, delta: 3,
              reply: 'His disposition goes up.' },
            { id: 'insult', label: 'Insult his mother', repeatable: true, delta: -25,
              reply: 'His disposition goes down.' },
            { id: 'bribe', label: 'Pay him 5 GP', repeatable: true, delta: 10, cost: 5,
              reply: 'Bartho takes 5 GP. His disposition goes up.' },
        ],
    },

    // (TX2) The taxi driver at the bridge: whoever stands there is the driver, and
    // he is the one who tells you (plans/taxi-driver.md). Every line is a
    // placeholder until Caelan writes it.
    taxi_driver: {
        name: 'Taxi driver',
        greeting: 'I am the taxi driver. My taxi crosses the bridge north out of Town, and it needs the cataclysmic converter to run.',
        choices: [
            { id: 'ask', label: 'Ask about the taxi', repeatable: true,
              reply: 'The Were-Rat in the Sewer drops the cataclysmic converter. Bring it back to Town and put it in the car. Then step onto the bridge to cross.' },
        ],
    },

    // (TX3) The same driver, in the Canyon after the taxi went down with him
    // (plans/tx3-taxi-crash-driver.md). Placeholder lines until Caelan writes them.
    taxi_driver_canyon: {
        name: 'Taxi driver',
        greeting: 'I am the taxi driver. The taxi crashed into the Canyon with me in it.',
        choices: [
            { id: 'ask', label: 'Ask how to get out of the Canyon', repeatable: true,
              reply: 'Climbing out needs the grappling hook. Pike has it.' },
        ],
    },

    // (Phase 6d) Macc the raccoon mechanic — Town's special-buyer: the Converter
    // has a buyer (500 GP).
    macc: {
        name: 'Macc',
        greeting: 'Macc is a mechanic in Town. He buys the cataclysmic converter for 500 GP.',
        choices: [
            { id: 'converter', label: 'Ask if he buys car parts', once: true, delta: 5,
              reply: 'Macc buys the cataclysmic converter for 500 GP. His disposition goes up.' },
            { id: 'flatter', label: 'Compliment his workshop', repeatable: true, delta: 3,
              reply: 'His disposition goes up.' },
            { id: 'insult', label: 'Insult him', repeatable: true, delta: -25,
              reply: 'His disposition goes down.' },
            { id: 'bribe', label: 'Pay him 5 GP', repeatable: true, delta: 10, cost: 5,
              reply: 'Macc takes 5 GP. His disposition goes up.' },
        ],
    },

    mince: {
        name: 'Mince',
        greeting: 'Mince is a townsperson.',
        choices: [
            { id: 'goldcard', label: 'Ask why everything costs Gold Card', once: true,
              reply: 'Mince gives no answer.' },
            { id: 'deal', label: 'Ask what he is selling', once: true, delta: 5,
              reply: 'Mince has nothing for sale. His disposition goes up.' },
            { id: 'flatter', label: 'Compliment him', repeatable: true, delta: 3,
              reply: 'His disposition goes up.' },
            { id: 'insult', label: 'Insult him', repeatable: true, delta: -25,
              reply: 'His disposition goes down.' },
            { id: 'bribe', label: 'Pay him 5 GP', repeatable: true, delta: 10, cost: 5,
              reply: 'Mince takes 5 GP. His disposition goes up.' },
        ],
    },

    glunk: {
        name: 'Glunk',
        greeting: 'Glunk, a townsperson. He stands by the wall.',
        choices: [
            { id: 'sewer', label: 'Ask about the smell from the sewer', once: true,
              reply: 'Glunk says it smells like the sewer.' },
            { id: 'wall', label: 'Compliment him for holding up the wall', once: true, delta: 8,
              reply: 'His disposition goes up.' },
            { id: 'flatter', label: 'Compliment him', repeatable: true, delta: 3,
              reply: 'His disposition goes up.' },
            { id: 'insult', label: 'Tell him to get a job', repeatable: true, delta: -25,
              reply: 'His disposition goes down.' },
            { id: 'bribe', label: 'Pay him 5 GP', repeatable: true, delta: 10, cost: 5,
              reply: 'Glunk takes 5 GP. His disposition goes up.' },
        ],
    },

    praline: {
        name: 'Praline',
        greeting: 'Praline, a townsperson. She cleans the plaza.',
        choices: [
            { id: 'grime', label: 'Ask if the grime comes off', once: true,
              reply: 'Praline says it does not.' },
            { id: 'tidy', label: 'Say the plaza is clean', once: true, delta: 8,
              reply: 'Her disposition goes up.' },
            { id: 'flatter', label: 'Compliment her', repeatable: true, delta: 3,
              reply: 'Her disposition goes up.' },
            { id: 'insult', label: 'Track mud on her floor', repeatable: true, delta: -25,
              reply: 'Her disposition goes down.' },
            { id: 'bribe', label: 'Pay her 5 GP', repeatable: true, delta: 10, cost: 5,
              reply: 'Praline takes 5 GP. Her disposition goes up.' },
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
        greeting: 'Knuckles is a townsperson who wants a fight. He fights only if you hit him or taunt him.',
        choices: [
            { id: 'standdown', label: 'Apologize and back off', once: true, delta: 70,
              reply: 'Knuckles stops. He fights on your side now.' },
            { id: 'why', label: 'Ask what his problem is', once: true,
              reply: 'Knuckles says you are in his plaza.' },
            { id: 'taunt', label: 'Taunt him', repeatable: true, delta: -25,
              reply: 'His disposition goes down.' },
        ],
    },

    // ── Chapter Two · Downtown cast (Phase 4) ────────────────────────────────
    // STUBS. Greetings + placeholder choices so every Downtown NPC is talkable
    // and the playground is walkable end-to-end. The burger hand-off (diner_cook)
    // and the delivery choice (mq2_recipient) get their real quest hooks in the
    // MQ2 wiring pass — for now they just talk. Rewrite freely.
    diner_cook: {
        name: 'Short-Order Cook',
        greetings: [{ when: burgerPickedUp, text: 'The burger and fries have already been picked up.' }],
        greeting: 'The short-order cook works the diner. He gives you the burger and fries for delivery.',
        choices: [
            // (Phase 4 MQ2) The dialogue delivery idiom: only shown at the get_burger
            // stage; grants the deliverable via _grantItem (emits item_pickup → the
            // quest advances). The trade window is the other idiom.
            { id: 'take_burger', label: 'Take the burger and fries for delivery', once: true,
              available: (g) => g.questEngine && g.questEngine.currentStageId && g.questEngine.currentStageId() === 'get_burger',   // (FD3) fallback only: your boss now hands the bag over
              onPick: (g) => { if (g._grantItem) g._grantItem('burger_fries', 'The cook gives you the burger and fries for delivery.'); },
              reply: 'The cook gives you the burger and fries. Deliver them.' },
            // (IC2) The order includes the ice cone. The machine makes only one and a
            // cone is not a quest item, so a lost one would stall the delivery: while
            // the order still needs a cone, the machine is fixed and none is in the
            // bag, the cook hands over another (the Factory manager's `collect` shape).
            { id: 'another_cone', label: 'Ask for another ice cone', repeatable: true,
              available: (g) => coneOwed(g),
              onPick: (g) => { if (g._grantItem) g._grantItem(ORDER_CONE, 'The cook hands you another ice cone.'); },
              reply: 'The cook hands you another ice cone for the delivery order.' },
            { id: 'burger', label: 'Ask about the burger and fries', repeatable: true,
              reply: 'The burger and fries are for delivery.' },
            { id: 'flatter', label: 'Compliment his cooking', repeatable: true, delta: 3,
              reply: 'His disposition goes up.' },
            { id: 'bribe', label: 'Pay him 5 GP', repeatable: true, delta: 10, cost: 5,
              reply: 'The cook takes 5 GP. His disposition goes up.' },
        ],
    },
    banker: {
        name: 'The Financier',
        greeting: 'The Financier runs First Blood Bank.',
        choices: [
            // (Phase 4 MQ2, AE1 / SP8) Dialogue delivery: the order is for the Financier. Only
            // shown at the handoff stage while the player holds everything still owed;
            // handOver removes it all AND emits item_given per item (the event the satchel
            // give fires), so either idiom completes the quest (IC2: the order is more than
            // one item).
            { id: 'deliver', label: 'Hand over the delivery order', once: true,
              available: (g) => !!g.questEngine && g.questEngine.currentStageId() === 'handoff' && g.questEngine.holdsOwed(),
              onPick: (g, npc) => g.questEngine.handOver(npc.id),
              reply: 'The Financier takes the delivery order.' },
            // (YC1 / YCR1 a) After the delivery he brings up the Yellow Card, once. The quest
            // flag also gates it (the NPC's spent `once` choices are saved with the NPC).
            // No item, no mechanic; label and reply are placeholders.
            { id: 'yellowCard', label: 'Ask about the Yellow Card', once: true,
              available: (g) => !!g.questEngine && g.questEngine.isComplete('deliver_burger')
                  && !g.questEngine.getFlag('yellowCardRaised'),
              onPick: (g) => { g.questEngine.state.flags.yellowCardRaised = true; },
              reply: 'The Financier mentions the Yellow Card. It does nothing yet.' },
            { id: 'loan', label: 'Ask what the bank does', once: true,
              reply: 'The bank lends money and collects debts.' },
            { id: 'flatter', label: 'Compliment him', repeatable: true, delta: 3,
              reply: 'His disposition goes up.' },
            { id: 'insult', label: 'Insult him', repeatable: true, delta: -25,
              reply: 'His disposition goes down.' },
        ],
    },
    // (FIN2) The Financier in his vault. Talking to him is how the fight starts
    // (main.js _beginFinalFight): one choice that starts the fight.
    financier_vault: {
        name: 'The Financier',
        greeting: 'I am the Financier. This is my vault. Talk to me and the fight starts.',
        choices: [
            { id: 'begin', label: 'Start the fight with the Financier', repeatable: true,
              onPick: (g, npc) => { if (g._beginFinalFight) g._beginFinalFight(npc); },
              reply: 'The Financier turns on you and Sun Man joins you for a few turns.' },
        ],
    },
    // Sun Man, so the fight's panel and log can name him. His lines are later slices.
    sun_man: {
        name: 'Sun Man',
        greeting: 'I am Sun Man. I fight beside you against the Financier for a few turns.',
        choices: [],
    },
    casino_op: {
        name: 'Pit Boss',
        greeting: 'The Pit Boss runs the casino.',
        choices: [
            { id: 'games', label: 'Ask what games they run', once: true,
              reply: 'The casino games are not available yet.' },
            { id: 'flatter', label: 'Compliment the casino', repeatable: true, delta: 3,
              reply: 'The Pit Boss\'s disposition goes up.' },
            { id: 'bribe', label: 'Pay the Pit Boss 5 GP', repeatable: true, delta: 10, cost: 5,
              reply: 'The Pit Boss takes 5 GP. Their disposition goes up.' },
        ],
    },
    mq2_recipient: {
        name: 'Stranded Traveler',
        greeting: 'The Stranded Traveler is stuck in Downtown and wants food.',
        choices: [
            { id: 'ask', label: 'Ask what they are doing here', repeatable: true,
              reply: 'The Stranded Traveler is waiting for food.' },
            { id: 'flatter', label: 'Reassure them', repeatable: true, delta: 3,
              reply: 'Their disposition goes up.' },
        ],
    },
    downtown_merchant: {
        name: 'Corner Merchant',
        greeting: 'The Corner Merchant sells goods. Press E to see them.',
        choices: [
            { id: 'ask', label: 'Ask how business is', repeatable: true,
              reply: 'Business is slow.' },
            { id: 'bribe', label: 'Pay the Corner Merchant 5 GP', repeatable: true, delta: 10, cost: 5,
              reply: 'The Corner Merchant takes 5 GP. Their disposition goes up.' },
        ],
    },
    downtown_merchant2: {
        name: 'Newsstand Kid',
        greeting: 'The Newsstand Kid runs the newsstand.',
        choices: [
            { id: 'ask', label: 'Ask what is in the news', repeatable: true,
              reply: 'The bank bought another block. No one saw the buyer.' },
            { id: 'flatter', label: 'Compliment the kid', repeatable: true, delta: 3,
              reply: 'Their disposition goes up.' },
        ],
    },
};

// ── The Crat's dispute (plans/cs1-crat-talk-both-sides.md) ───────────────────
// A side room north of the Sewer. Two sides claim the same thing; the Crat asks
// you to rule. Hear both, rule for one; either side will pay you to rule its
// way. Every line is a placeholder for Caelan to write.
//
// State lives in the quest flags, which the save keeps. The story beats (hear a side,
// take its money, rule) are `once`, which the NPC's save keeps too; the questions
// you can put again stay `repeatable`:
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

// The reward for settling it (plans/cs2-crat-reward.md): Carrion's blocked road
// opens. One saved flag, set once, only by a ruling; whatever opens the road
// reads it. Where the road leads is not decided yet.
export const CRAT_REWARD_FLAG = 'carrionRoadOpen';
function grantCratReward(g) {
    if (!ruled(g) || cratFlag(g, CRAT_REWARD_FLAG)) return false;
    setCratFlag(g, CRAT_REWARD_FLAG, true);
    return true;
}
export const carrionRoadOpen = (g) => !!cratFlag(g, CRAT_REWARD_FLAG);

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
                label: `Rule for side ${side.toUpperCase()}`,
                once: true,
                available: (g) => heardBoth(g) && !ruled(g) && (cratFlag(g, 'cratBribe') ?? null) === paidBy,
                onPick: (g) => { setCratFlag(g, 'cratRuling', side); grantCratReward(g); },
                reply: `You ruled for side ${side.toUpperCase()}, ${verdict}`
                    + (bribe === 'none' ? ', and took no money' : bribe === 'same' ? ', and took that side\'s money' : ', and took the other side\'s money')
                    + '. The road to Carrion opens the next time the Sewer loads.',
            });
        }
    }
    return out;
}

function cratSide(side) {
    const flag = CRAT.heardFlag(side);
    const S = side.toUpperCase();
    return {
        name: `Side ${S}`,
        greeting: `Side ${S} is in a dispute with the other side. Hear it out, then rule.`,
        choices: [
            { id: 'testify', label: `Hear side ${S} out`, once: true,
              available: (g) => !cratFlag(g, flag),
              onPick: (g) => setCratFlag(g, flag, true),
              reply: `Side ${S} says it is in the right. The clues in this room show which side is.` },
            { id: 'again', label: `Ask side ${S} again`, repeatable: true,
              available: (g) => !!cratFlag(g, flag) && !ruled(g),
              reply: `Side ${S} says again that it is in the right.` },
            // The bribe runs the other way to every other in the game: they pay you.
            { id: 'offer', label: `Take side ${S}'s money - ${CRAT_BRIBE_GP} GP`, once: true,
              available: (g, npc) => !!cratFlag(g, flag) && !ruled(g) && !cratFlag(g, 'cratBribe')
                  && (npc ? (npc.gold ?? 0) >= CRAT_BRIBE_GP : true),
              onPick: (g, npc) => {
                  if (transferGold(npc, g, CRAT_BRIBE_GP, 'dialogue')) setCratFlag(g, 'cratBribe', side);
              },
              reply: `Side ${S} pays you ${CRAT_BRIBE_GP} GP to rule its way.` },
            { id: 'after', label: `Ask side ${S} about the ruling`, repeatable: true,
              available: (g) => ruled(g),
              reply: `The ruling is made. Side ${S} has nothing more to say.` },
        ],
    };
}

DIALOGUES.crat = {
    name: 'The Crat',
    greeting: 'I am the Crat. Two sides in this room dispute the same thing. Hear both sides, then rule for one.',
    choices: [
        { id: 'dispute', label: 'Ask what the dispute is', repeatable: true,
          available: (g) => !ruled(g),
          reply: 'Two sides claim the same thing. Hear both of them, then rule for one.' },
        { id: 'waiting', label: 'Ask what happens now', repeatable: true,
          available: (g) => !heardBoth(g) && !ruled(g),
          reply: 'Hear both sides first. Then you can rule.' },
        ...cratRulingChoices(),
        { id: 'after', label: 'Ask the Crat about the ruling', repeatable: true,
          available: (g) => ruled(g),
          reply: 'You have ruled. The road to Carrion opens the next time the Sewer loads.' },
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
const handOverPart = (g) => { if (g._grantItem) g._grantItem(MACHINE_PART, 'The manager hands you the ice cone machine part.'); };

DIALOGUES.factory_manager = {
    name: 'Factory Manager',
    greeting: 'I am the Factory manager. I hold the ice cone machine part until the factory bill is paid.',
    choices: [
        { id: 'bill', label: 'Ask about the bill', repeatable: true,
          available: (g) => !billPaid(g),
          reply: `The bill is ${FACTORY_BILL_GP} GP. Pay it and I hand over the ice cone machine part.` },
        { id: 'pay', label: `Pay the bill - ${FACTORY_BILL_GP} GP`, repeatable: true, cost: FACTORY_BILL_GP,
          available: (g) => !billPaid(g),
          onPick: (g) => {
              if (g.questEngine) g.questEngine.state.flags.factoryBillPaid = true;
              handOverPart(g);
          },
          reply: 'The bill is paid. The manager hands over the ice cone machine part.' },
        { id: 'collect', label: 'Ask for the ice cone machine part', repeatable: true,
          available: (g) => partOwed(g),
          onPick: (g) => handOverPart(g),
          reply: 'The manager hands over the ice cone machine part.' },
        { id: 'paid', label: 'Ask about the part', repeatable: true,
          available: (g) => billPaid(g) && !partOwed(g),
          reply: 'The bill is paid. The ice cone machine part goes in the ice cone machine.' },
    ],
};

// (HV1, plans/hv1-hypno-vision-factory.md) The nerd who runs the Hypno Vision. Asking him to switch
// it off does it (the quest flag hypnoVisionOff, which the save keeps) and calms whoever it turned.
// Plain placeholder lines.
const hypnoOff = (g) => !!flagsOf(g).hypnoVisionOff;
DIALOGUES.hypno_nerd = {
    name: 'Nerd',
    greeting: 'The nerd runs the Hypno Vision. It is on.',
    greetings: [{ when: hypnoOff, text: 'The nerd runs the Hypno Vision. It is off.' }],
    choices: [
        { id: 'switch_off', label: 'Ask him to switch off the Hypno Vision', once: true,
          available: (g) => !hypnoOff(g),
          onPick: (g) => switchOffHypno(g),
          reply: 'He switches the Hypno Vision off.' },
        { id: 'status', label: 'Ask about the Hypno Vision', repeatable: true,
          available: (g) => hypnoOff(g),
          reply: 'It is off.' },
    ],
};

// (AS1, plans/as1-unicycle-clown.md) The Carnival's assistant manager: he talks and does
// nothing else.
DIALOGUES.assistant_manager = {
    name: 'Assistant Manager',
    greeting: 'I am the Assistant manager of the Carnival. I only talk.',
    choices: [
        { id: 'chat', label: 'Talk to the Assistant manager', repeatable: true,
          reply: 'The Assistant manager has nothing to give you.' },
    ],
};

// SG1: the Carnival's strongman. He stands at -40, so only one line is offered: any other pick
// would read as a taunt past DIALOGUE_HOSTILE_AT. The recruit choice crosses his flip threshold.
DIALOGUES.strongman = {
    name: 'Strongman',
    greeting: 'I am the Strongman of the Carnival.',
    choices: [
        { id: 'recruit', label: 'Ask him to fight on your side', once: true, delta: 70,
          reply: 'The Strongman agrees. He fights on your side now.' },
    ],
};

// (DQ1) What the speaker opens with. A dialogue may list `greetings`, each with a `when(game)`
// condition; the first one that holds wins, and otherwise the fixed `greeting` is used.
export function greetingFor(d, g) {
    if (!d) return '';
    for (const e of d.greetings || []) {
        if (e && typeof e.when === 'function' && e.when(g)) return e.text;
    }
    return d.greeting || '';
}

// With a game, the returned dialogue carries the greeting that holds right now.
export function getDialogue(id, g) {
    const d = DIALOGUES[id] || null;
    if (!d || !g || !d.greetings) return d;
    return { ...d, greeting: greetingFor(d, g) };
}
