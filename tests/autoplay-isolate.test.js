// autoplay-isolate.test.js — what keeps a run away from a real player's game.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, fencedFetch } from '../game/autoplay/isolate.js';

describe('memory storage', () => {
    test('a missing key reads null, like localStorage', () => {
        assert.equal(memoryStorage().getItem('violencetown.save'), null);
    });
    test('values round-trip as strings', () => {
        const s = memoryStorage();
        s.setItem('k', 42);
        assert.equal(s.getItem('k'), '42');
    });
    test('remove, clear, key and length behave', () => {
        const s = memoryStorage();
        s.setItem('a', '1'); s.setItem('b', '2');
        assert.equal(s.length, 2);
        assert.equal(s.key(0), 'a');
        s.removeItem('a');
        assert.equal(s.getItem('a'), null);
        s.clear();
        assert.equal(s.length, 0);
        assert.equal(s.key(0), null);
    });
    test('two stores never share', () => {
        const a = memoryStorage(), b = memoryStorage();
        a.setItem('k', 'v');
        assert.equal(b.getItem('k'), null);
    });
});

describe('the counted fetch', () => {
    test('a request counts until its whole body has arrived', async () => {
        let release;
        const slow = async () => new Response(new ReadableStream({
            start(c) { release = () => { c.enqueue(new TextEncoder().encode('{"a":1}')); c.close(); }; },
        }));
        const f = fencedFetch(slow);
        const pending = f.fetch('town-map.json');
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(f.inflight(), 1, 'the headers are in but the body is not');
        release();
        const res = await pending;
        assert.equal(f.inflight(), 0);
        assert.deepEqual(await res.json(), { a: 1 });
    });
    test('a failed request stops counting', async () => {
        const f = fencedFetch(() => Promise.reject(new Error('offline')));
        await assert.rejects(f.fetch('x'), /offline/);
        assert.equal(f.inflight(), 0);
    });
    test('status and ok survive the copy', async () => {
        const f = fencedFetch(async () => new Response('nope', { status: 404, statusText: 'Not Found' }));
        const res = await f.fetch('x');
        assert.equal(res.status, 404);
        assert.equal(res.ok, false);
        assert.equal(res.statusText, 'Not Found');
    });
});
