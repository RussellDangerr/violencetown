// hand-data.js — weapon pairs (CONTENT). Two held weapons can combine into a
// named effect, the way two rings fuse (plans/hb2-weapon-pair-effects.md).
//
// Each weapon class carries a tag here; a pair is matched on tags by the ring
// fusion matcher (rings.js findFusion), in either hand order. Names are
// placeholders until named. `grants` is an existing wheel skill, a stand-in
// effect so no new tuning number is needed.

import { findFusion } from './rings.js';
import { weaponClassOf } from './weapons.js';

// class id → tags. The wok is a shield-class item.
export const HAND_TAGS = Object.freeze({
    shield: ['shield'],
    frying_pan: ['pan'],
    wand: ['wand'],
    book: ['book'],
});

export const HAND_PAIRS = Object.freeze([
    { pair: ['shield', 'pan'], id: 'wok_pan', name: '[PAIR: WOK + PAN]', grants: 'ember_rat' },
    { pair: ['wand', 'book'], id: 'wand_book', name: '[PAIR: WAND + BOOK]', grants: 'boo' },
]);

// The tags a held weapon carries, from its class. Nothing held, or a class
// with no tag, is none.
export function handTagsOf(def) {
    const c = weaponClassOf(def);
    return (c && HAND_TAGS[c.id]) || [];
}

// The pair the two hands make, or null. `left` and `right` are item defs.
export function handPairOf(left, right, table = HAND_PAIRS) {
    if (!left || !right) return null;
    return findFusion({ tags: handTagsOf(left) }, { tags: handTagsOf(right) }, table);
}
