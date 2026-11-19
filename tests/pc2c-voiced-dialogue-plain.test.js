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

describe('talk choices state only their effect', () => {
    const reply = (id, cid) => DIALOGUES[id].choices.find(c => c.id === cid).reply;
    const label = (id, cid) => DIALOGUES[id].choices.find(c => c.id === cid).label;

    test('no reply of the cast carries an opinion or a story', () => {
        for (const id of CAST) for (const c of DIALOGUES[id].choices) {
            assert.ok(!/\b(says|likes|slow|answer|waiting|long time)\b/i.test(c.reply), `${id}.${c.id}: ${c.reply}`);
        }
    });

    test('choices with no effect say Nothing happens', () => {
        for (const [id, cid] of [['glunk', 'sewer'], ['praline', 'grime'], ['knuckles', 'why'], ['downtown_merchant', 'ask'],
            ['banker', 'loan'], ['downtown_merchant2', 'ask'], ['mince', 'goldcard'], ['mq2_recipient', 'ask']]) {
            assert.equal(reply(id, cid), 'Nothing happens.', `${id}.${cid}`);
        }
    });

    test('choices that only move disposition say so', () => {
        for (const [id, cid] of [['pike', 'lore'], ['bartho', 'hat'], ['mince', 'deal'], ['glunk', 'wall']]) {
            assert.equal(reply(id, cid), 'His disposition goes up.', `${id}.${cid}`);
        }
    });

    test('two compliments to one character carry different labels', () => {
        assert.equal(label('glunk', 'wall'), 'Compliment him for standing by the wall');
        assert.equal(label('glunk', 'flatter'), 'Compliment him');
    });

    test('Knuckles taunt says it starts a fight: he starts at -30 and the taunt is -25, past -40', () => {
        assert.equal(label('knuckles', 'taunt'), 'Taunt him (he attacks)');
        const town = JSON.parse(readFileSync(new URL('../game/town-map.json', import.meta.url), 'utf8'));
        const k = town.enemies.find(e => e.dialogueId === 'knuckles');
        assert.ok(k.disposition - 25 <= -40);
        const others = town.enemies.filter(e => e.dialogueId && e.dialogueId !== 'knuckles' && DIALOGUES[e.dialogueId]?.choices.some(c => c.delta === -25));
        assert.ok(others.length >= 3, 'the insulted townspeople were found');
        for (const e of others) assert.ok((e.disposition ?? 0) - 25 > -40, `${e.dialogueId}: one insult would start a fight`);
    });

    test('Platero names what he takes; the Financier and the Merchant say what they do', () => {
        assert.equal(DIALOGUES.platero.greeting, 'Platero is a silversmith in Downtown. He makes rings from wererat fur or Fire Blood.');
        assert.equal(reply('platero', 'about'), 'Platero makes a rat ring from wererat fur, or a fire ring from 3 Fire Blood. His disposition goes up.');
        assert.equal(DIALOGUES.banker.greeting, 'The Financier runs First Blood Bank. He takes the delivery order.');
        assert.equal(DIALOGUES.downtown_merchant.greeting, 'The Corner Merchant sells goods. Stand next to him and use Trade to see what he sells.');
    });
});
