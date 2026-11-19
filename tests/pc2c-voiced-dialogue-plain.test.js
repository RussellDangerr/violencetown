// pc2c-voiced-dialogue-plain.test.js — PC2c: the voiced cast says plainly who they are and what each choice does.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIALOGUES } from '../game/dialogue.js';

const CAST = ['pike', 'platero', 'bartho', 'macc', 'mince', 'glunk', 'praline', 'knuckles',
    'diner_cook', 'banker', 'casino_op', 'mq2_recipient', 'downtown_merchant', 'downtown_merchant2'];
const lines = (d) => [d.name, d.greeting, ...(d.greetings || []).map(e => e.text), ...d.choices.flatMap(c => [c.label, c.reply])];

describe('the voiced cast is plain', () => {
    test('no square bracket in any line of dialogue.js', () => {
        for (const [id, d] of Object.entries(DIALOGUES)) {
            for (const l of lines(d)) assert.ok(!/[\[\]]/.test(l), `${id}: ${l}`);
        }
        const src = readFileSync(new URL('../game/dialogue.js', import.meta.url), 'utf8');
        assert.ok(!/'\[[A-Za-z]/.test(src), 'a bracketed string literal is left in the source');
    });

    test('Glunk, as the card gives him', () => {
        const d = DIALOGUES.glunk;
        assert.equal(d.greeting, 'Glunk, a townsperson. He stands by the wall.');
        assert.deepEqual(d.choices.filter(c => ['flatter', 'insult', 'bribe'].includes(c.id)).map(c => c.label),
            ['Compliment him', 'Tell him to get a job', 'Pay him 5 GP']);
    });

    test('every choice of the cast has a plain label and reply, and a bribe names its cost', () => {
        for (const id of CAST) {
            const d = DIALOGUES[id];
            assert.ok(/^[A-Z]/.test(d.greeting), id);
            for (const c of d.choices) {
                assert.ok(c.label && c.reply, `${id}.${c.id}`);
                assert.ok(!/[*"]|\.\.\./.test(c.reply), `${id}.${c.id}: voice left in the reply: ${c.reply}`);
                if (c.cost) assert.ok(c.label.includes(`${c.cost} GP`), `${id}.${c.id}: ${c.label}`);
            }
        }
    });

    test('ids and speaker names are kept', () => {
        const ids = (id) => DIALOGUES[id].choices.map(c => c.id);
        assert.deepEqual(ids('glunk'), ['sewer', 'wall', 'flatter', 'insult', 'bribe']);
        assert.deepEqual(ids('knuckles'), ['standdown', 'why', 'taunt']);
        assert.deepEqual(ids('pike'), ['lore', 'buy', 'deal']);
        assert.equal(DIALOGUES.factory_manager.name, 'Factory Manager');
        assert.equal(DIALOGUES.hypno_nerd.name, 'Nerd');
    });
});

describe('the two untrue lines are fixed', () => {
    test('the Factory manager no longer says the bag can refuse', () => {
        const pay = DIALOGUES.factory_manager.choices.find(c => c.id === 'pay');
        assert.equal(pay.reply, 'The bill is paid. The manager hands over the ice cone machine part.');
    });

    test('the road to Carrion opens on the next Sewer load, not at once', () => {
        const rules = DIALOGUES.crat.choices.filter(c => c.id.startsWith('rule_'));
        for (const c of rules) assert.ok(c.reply.endsWith('The road to Carrion opens the next time the Sewer loads.'), c.reply);
        assert.ok(DIALOGUES.crat.choices.find(c => c.id === 'after').reply.includes('opens the next time the Sewer loads'));
    });

    test('Pike says the hook comes at once when the critters are already dead', () => {
        assert.ok(DIALOGUES.pike.choices.find(c => c.id === 'deal').reply.includes('already dead'));
    });
});
