// pc2-dialogue-plain-copy.test.js — PC2: characters say plainly who they are and what they do.
// Placeholder copy is plain, never [TEXT] (plans/pc2-dialogue-plain-copy.md).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIALOGUES, CRAT_BRIBE_GP } from '../game/dialogue.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const canyon = JSON.parse(read('../game/canyon-map.json'));

// Every string a dialogue can show: name, greetings, labels, replies.
function allLines(d) {
    const out = [d.name, d.greeting, ...(d.greetings || []).map(e => e.text)];
    for (const c of d.choices) out.push(c.label, c.reply);
    return out;
}

describe('no [TEXT] reaches a player from dialogue.js or the canyon driver', () => {
    test('the dialogue source carries none', () => {
        const src = read('../game/dialogue.js');
        assert.ok(src.length > 5000, 'read the file');
        assert.ok(!src.includes('[TEXT'), 'a [TEXT in dialogue.js');
        assert.ok(!src.includes('[NAME:'), 'a [NAME: in dialogue.js');
    });

    test('every line of every dialogue is a non-empty string with no [TEXT]', () => {
        const ids = Object.keys(DIALOGUES);
        assert.ok(ids.length > 20, 'the dialogues loaded');
        for (const id of ids) {
            const lines = allLines(DIALOGUES[id]);
            assert.ok(lines.length >= 2, id);
            for (const l of lines) {
                assert.equal(typeof l, 'string', `${id}: ${l}`);
                assert.ok(l.length > 0 && !l.includes('[TEXT'), `${id}: ${l}`);
            }
        }
    });

    test('the Canyon driver goes by his role, like the one in Town', () => {
        const d = canyon.enemies.find(e => e.id === 'townie-driver');
        assert.equal(d.name, 'Taxi driver');
        assert.equal(DIALOGUES[d.dialogueId].name, 'Taxi driver');
        assert.equal(DIALOGUES.taxi_driver.name, 'Taxi driver');
    });
});

describe('the plain lines say what the code does', () => {
    test('ids are unchanged', () => {
        const ids = (k) => DIALOGUES[k].choices.map(c => c.id);
        assert.deepEqual(ids('taxi_driver'), ['ask']);
        assert.deepEqual(ids('taxi_driver_canyon'), ['ask']);
        assert.deepEqual(ids('financier_vault'), ['begin']);
        assert.deepEqual(ids('strongman'), ['recruit']);
        assert.deepEqual(ids('assistant_manager'), ['chat']);
        assert.deepEqual(ids('factory_manager'), ['bill', 'pay', 'collect', 'paid']);
        assert.deepEqual(ids('crat_side_a'), ['testify', 'again', 'offer', 'after']);
        assert.ok(ids('banker').includes('deliver') && ids('banker').includes('yellowCard'));
        assert.ok(ids('diner_cook').includes('another_cone'));
    });

    test('the Crat names its choices and the sides go by letter', () => {
        assert.equal(DIALOGUES.crat_side_a.name, 'Side A');
        assert.equal(DIALOGUES.crat_side_b.name, 'Side B');
        const rules = DIALOGUES.crat.choices.filter(c => c.id.startsWith('rule_'));
        assert.equal(rules.length, 6);
        assert.deepEqual(rules.map(c => c.label).sort(), ['Rule for side A', 'Rule for side A', 'Rule for side A', 'Rule for side B', 'Rule for side B', 'Rule for side B']);
        const clean = rules.find(c => c.id === 'rule_a');
        assert.equal(clean.reply, 'You ruled for side A, the side in the right, and took no money. The road to Carrion is open now.');
        const bought = rules.find(c => c.id === 'rule_b_paid_a');
        assert.equal(bought.reply, 'You ruled for side B, the side in the wrong, and took the other side\'s money. The road to Carrion is open now.');
        const offer = DIALOGUES.crat_side_a.choices.find(c => c.id === 'offer');
        assert.equal(offer.label, `Take side A's money - ${CRAT_BRIBE_GP} GP`);
        assert.equal(offer.reply, `Side A pays you ${CRAT_BRIBE_GP} GP to rule its way.`);
    });

    test('Pike\'s rope, the Fire Blood ring and the cone are plain', () => {
        assert.equal(DIALOGUES.pike.choices.find(c => c.id === 'buy').reply,
            'Pike has the grappling hook. Offer to clear the canyon critters and he gives it to you.');
        assert.equal(DIALOGUES.platero.choices.find(c => c.id === 'fashion_fire').label, 'Have him set the Fire Blood into a ring');
        assert.equal(DIALOGUES.diner_cook.choices.find(c => c.id === 'another_cone').label, 'Ask for another ice cone');
    });
});
