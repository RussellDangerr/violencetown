// modifier-keys.test.js — a browser chord is not a game input.
//
// Nothing in the input layer checked modifiers, so every shortcut the browser
// owns ALSO fired a game action behind it. Driven in the live game before this
// was written, and all three were worse than the backlog's one-line description:
//
//   Ctrl+S   (save page)        walked the player south
//   Ctrl+L   (address bar)      opened the log modal
//   Alt+Tab  (switch window)    opened the Remoticon
//
// The last one is the one that actually bites: you alt-tab away, come back, and
// there is a menu open you never asked for.
//
// Shift is deliberately NOT blocked — the game owns it (Shift+arrows drive the
// hotbar, `?` is Shift+Slash), so a guard that swallowed it would trade one bug
// for two.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

// The guard lives at the top of _bindInput's keydown listener, before any state
// dispatch. Lifting the whole listener would mean stubbing the entire game, so
// this reconstructs the guard's own predicate from the real source and drives
// events through it — the shape is asserted separately below.
function guardFromSource() {
    const at = mainSrc.indexOf('_bindInput() {');
    assert.ok(at > 0, '_bindInput not found');
    const region = mainSrc.slice(at, at + 3000);
    const m = /if \(([^)]*ctrlKey[^)]*)\) return;/.exec(region);
    assert.ok(m, 'no modifier guard found in _bindInput');
    return new Function('e', `return !!(${m[1]});`);   // true = swallowed
}

const swallowed = guardFromSource();
const ev = (over = {}) => ({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over });

describe('the chords the browser owns are left alone', () => {
    test('Ctrl is not a game modifier', () => {
        assert.equal(swallowed(ev({ ctrlKey: true })), true);
    });

    test('Meta/Cmd is not a game modifier', () => {
        assert.equal(swallowed(ev({ metaKey: true })), true);
    });

    test('Alt is not a game modifier — this is the alt-tab case', () => {
        assert.equal(swallowed(ev({ altKey: true })), true);
    });

    test('any combination of them is still swallowed', () => {
        assert.equal(swallowed(ev({ ctrlKey: true, shiftKey: true })), true);
        assert.equal(swallowed(ev({ ctrlKey: true, altKey: true })), true);
        assert.equal(swallowed(ev({ metaKey: true, altKey: true, shiftKey: true })), true);
    });
});

describe('but Shift belongs to the game', () => {
    test('Shift alone passes through', () => {
        assert.equal(swallowed(ev({ shiftKey: true })), false,
            'Shift+arrows drive the hotbar and `?` is Shift+Slash');
    });

    test('an unmodified key passes through', () => {
        assert.equal(swallowed(ev()), false);
    });
});

describe('the guard is placed where it can actually help', () => {
    test('it sits before any state dispatch in _bindInput', () => {
        // A guard added below the movement or menu branches would be decorative.
        const at = mainSrc.indexOf('_bindInput() {');
        const region = mainSrc.slice(at, at + 3000);
        const guardAt = region.search(/if \([^)]*ctrlKey[^)]*\) return;/);
        const firstDispatch = region.search(/this\.state === STATE\.(SPLASH|RESOLVING)/);
        assert.ok(guardAt > 0, 'guard missing');
        assert.ok(guardAt < firstDispatch,
            'the modifier guard must run before the handler starts dispatching');
    });

    test('it does not preventDefault — the browser is supposed to get the chord', () => {
        const at = mainSrc.indexOf('_bindInput() {');
        const region = mainSrc.slice(at, at + 3000);
        const m = /if \([^)]*ctrlKey[^)]*\)([^\n]*)/.exec(region);
        assert.ok(m, 'guard missing');
        assert.ok(!/preventDefault/.test(m[1]),
            'swallowing the chord AND the browser default would break Ctrl+S entirely');
    });
});
