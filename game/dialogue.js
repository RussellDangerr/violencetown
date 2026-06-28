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

export const DIALOGUES = {
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
};

export function getDialogue(id) {
    return DIALOGUES[id] || null;
}
