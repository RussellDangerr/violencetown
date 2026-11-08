// credits.js — the credits roll, then the town stays open (plans/fin4-credits-town-open.md).
//
// Winning phase 2 against Monstrous Sun Man (FIN3) saves the quest flag `finalePhase2 === 'won'`.
// While that flag is won and the ending has not been seen, the credits are *due*. They take the
// screen, step through their cards, and hand the world back exactly as it was; the quest flag
// `endingSeen` is then saved, so a reload never rolls them again.
//
// Like finale-setpiece.js these are plain functions: main.js calls them from thin methods, and
// nothing here keeps state of its own beyond the roll object a game holds while it plays.
//
// Every line a player reads is [TEXT]; every number below is a stand-in.

import { FINALE_PHASE2 } from './finale-setpiece.js';

export const CREDITS = {
    seenFlag: 'endingSeen',          // the saved quest flag: the ending has been seen
    beatMs: 1500,                    // stand-in: the pause between the last blow and the credits
    cardMs: 4000,                    // stand-in: how long a card holds before it steps on its own
    // Stand-in cards: three lines each, all placeholders.
    cards: [
        ['[TEXT]', '[TEXT]', '[TEXT]'],
        ['[TEXT]', '[TEXT]', '[TEXT]'],
        ['[TEXT]', '[TEXT]', '[TEXT]'],
        ['[TEXT]', '[TEXT]', '[TEXT]'],
    ],
    hint: '[TEXT]',                  // the dismiss hint under a card
};

// The credits are due: the Final Arc was won and the ending has not been seen. Derived from the
// saved flags alone, so a save made between the win and the credits still rolls them once.
export function endingDue(game) {
    const flags = game?.questEngine?.state?.flags;
    if (!flags) return false;
    return flags[FINALE_PHASE2.flag] === FINALE_PHASE2.won && flags[CREDITS.seenFlag] !== true;
}

// Whether the ending has been seen (the saved flag).
export function endingSeen(game) {
    return game?.questEngine?.state?.flags?.[CREDITS.seenFlag] === true;
}

// Record that the ending was seen. Returns true the first time.
export function markEndingSeen(game) {
    const flags = game?.questEngine?.state?.flags;
    if (!flags || flags[CREDITS.seenFlag] === true) return false;
    flags[CREDITS.seenFlag] = true;
    return true;
}

// A fresh roll, on its first card.
export function newRoll() {
    return { index: 0 };
}

export function currentCard(roll) {
    return CREDITS.cards[roll.index] ?? null;
}

// Step to the next card. Returns true while there is a card to show, false once the last one
// has been stepped past (the roll is over).
export function stepRoll(roll) {
    roll.index++;
    return roll.index < CREDITS.cards.length;
}
