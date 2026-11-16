// save-key.js — PK2: a generated four-word key, shown once.
//
// The key is four words drawn at random from the bundled list (wordlist.js): 4 x 12 = 48 bits.
// From the phrase we derive an id with PBKDF2-SHA256 (fixed salt, fixed rounds), so the same
// phrase always gives the same id. Only the id is kept on the device; the phrase is returned to
// the caller to show once and is never stored here. No network, no server (PKR1 a).
import { WORDS, WORD_BITS } from './wordlist.js';

export const KEY_WORDS = 4;
export const KEY_BITS = KEY_WORDS * WORD_BITS;
export const KEY_STORAGE = 'violencetown.keyid';
const SALT = 'violencetown-key-v1';
const ROUNDS = 100000;

// Four words, uniform over the list. The list is exactly 2^12 long, so masking 16 random
// bits to 12 is unbiased. `cryptoImpl` is injectable for tests.
export function generatePhrase(cryptoImpl = globalThis.crypto) {
    if (WORDS.length !== (1 << WORD_BITS)) throw new Error('word list must hold 2^' + WORD_BITS + ' words');
    const r = cryptoImpl.getRandomValues(new Uint16Array(KEY_WORDS));
    return Array.from(r, (n) => WORDS[n & ((1 << WORD_BITS) - 1)]).join(' ');
}

// Lower-case, split on spaces/hyphens/commas, rejoin with single spaces.
export function normalizePhrase(text) {
    return String(text ?? '').toLowerCase().split(/[\s,\-_]+/).filter(Boolean).join(' ');
}

export function isValidPhrase(text) {
    const parts = normalizePhrase(text).split(' ');
    return parts.length === KEY_WORDS && parts.every((w) => WORDS.includes(w));
}

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

// The id: 32 hex chars (128 bits) derived from the normalized phrase.
export async function keyIdFor(text, subtle = globalThis.crypto.subtle) {
    const enc = new TextEncoder();
    const base = await subtle.importKey('raw', enc.encode(normalizePhrase(text)), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ROUNDS }, base, 128);
    return hex(bits);
}

export function loadKeyId(storage = globalThis.localStorage) {
    try { return storage.getItem(KEY_STORAGE) || null; } catch { return null; }
}

// Make a key: returns { phrase, id } and keeps ONLY the id on the device. The caller shows
// the phrase once and then drops it.
export async function createKey(storage = globalThis.localStorage, cryptoImpl = globalThis.crypto) {
    const phrase = generatePhrase(cryptoImpl);
    const id = await keyIdFor(phrase, cryptoImpl.subtle);
    try { storage.setItem(KEY_STORAGE, id); } catch { /* storage blocked: the id just isn't kept */ }
    return { phrase, id };
}
