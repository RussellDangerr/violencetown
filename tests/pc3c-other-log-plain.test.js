// PC3c: the log, hint, splat and payoff lines outside main.js are plain and bracket-free
// (plans/pc3c-other-log-plain.md, ruling PCR3).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFEAT_SCENARIOS, EMPTY_TAKE_LOG } from '../game/defeat-scenarios.js';
import { HIT_KIND_TAG, DODGE_WORD } from '../game/hit-splat.js';
import { HINTS } from '../game/hints.js';
import { LIFT_WORDS } from '../game/theft.js';
import { SALE_LOCK_REFUSAL } from '../game/trade.js';
import { INTERACTIONS } from '../game/interactions.js';
import { LINES } from '../game/compactor.js';
import { LINES as HYPNO } from '../game/hypno-vision.js';
import { applyGive } from '../game/give-action.js';

const plain = (s) => typeof s === 'string' && s.length > 0 && !s.startsWith('[') && !s.endsWith(']') && !s.includes('[TEXT');

describe('PC3c plain lines', () => {
    test('the defeat lines say who took what and where you wake', () => {
        const by = Object.fromEntries(DEFEAT_SCENARIOS.map(s => [s.id, s.consequence.log]));
        assert.equal(EMPTY_TAKE_LOG, 'You lost the fight and woke up.');
        assert.equal(by.processed_by_fungus, 'You lost to the Fungus and woke in a walled pocket of the sewer. It took your food and mushrooms.');
        assert.equal(by.robbed_by_wererats, 'You lost to the sewer rats and woke at the sewer entrance. They took your unprotected items and left them in a stash.');
        assert.equal(by.swept_into_sludge, 'You fell in the sludge and woke downstream. Your consumables were destroyed.');
        assert.equal(by.patched_by_carrion, "You lost and woke in Carrion's corridor. She healed you fully, took 10% of your gold and gave you a bandage.");
        assert.equal(by.beaten_and_dumped, EMPTY_TAKE_LOG);
        for (const l of Object.values(by)) assert.ok(plain(l), l);
    });

    test('the splat words, hints, lift words and refusal are plain', () => {
        assert.deepEqual({ ...HIT_KIND_TAG }, { slash: 'Slash', stab: 'Stab', crush: 'Crush' });
        assert.equal(DODGE_WORD, 'Dodged');
        assert.deepEqual(LIFT_WORDS, { clean: 'Not noticed', noticed: 'Noticed' });
        assert.equal(SALE_LOCK_REFUSAL, 'This item cannot be sold until its quest is done.');
        for (const h of HINTS) assert.ok(plain(h.text), h.id);
    });

    test('the Mola Cola notes and the compactor and Hypno Vision lines are plain', () => {
        assert.equal(INTERACTIONS[0].note, 'Carrying Mola Cola in the Frozen zone calls a pack of polar bears.');
        assert.equal(INTERACTIONS[1].note, 'Carrying Mola Cola in the Wilderness calls a bear.');
        for (const k of ['shut', 'shove', 'crush', 'broken']) assert.ok(plain(LINES[k]), k);
        assert.equal(LINES.step(1), 'The walls closed in. 1 column is left.');
        assert.equal(LINES.step(3), 'The walls closed in. 3 columns are left.');
        assert.equal(HYPNO.turn('Worker'), 'The Hypno Vision turned the Worker against you.');
        assert.equal(HYPNO.off, 'The Hypno Vision is off. Those it turned are neutral again.');
    });

    test('give reactions are plain', () => {
        const r = { type: 'Rat', bribeable: false };
        assert.equal(applyGive({ id: 'x', name: 'Soap' }, r).log, 'The Rat did not accept the Soap.');
    });

    test('no player line in the touched files starts with a bracket', () => {
        for (const f of ['npc', 'give-action', 'defeat-scenarios', 'sewer-setpiece', 'hit-splat', 'buffs', 'item-uses', 'hints', 'theft', 'trade', 'interactions', 'quests']) {
            const src = readFileSync(new URL(`../game/${f}.js`, import.meta.url), 'utf8');
            const bad = src.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l) && /(_log\??\.?\(|text: |log: |note: |label: )[`'"]\[/.test(l) && !/console\./.test(l));
            assert.deepEqual(bad, [], f);
        }
    });
});
