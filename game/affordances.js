// affordances.js — the affordance matrix (plans/am1-affordance-matrix.md).
//
// Every verb the player has, against every tag in tags.js, with every cell
// written out. A cell is 'none' or an id from EFFECTS; a blank cell is a
// decision nobody made (plans/systems-audit-2026-08.md §9). This is the
// design check only: nothing in the game reads it, and a cell here makes
// nothing happen. tests/affordance-matrix.test.js finds the verbs in the wheel
// and holds the table to them.

export const NONE = 'none';

// What a cell may name. `status` is 'live' (code does it today) or 'planned'
// (a plan asks for it, nothing does it yet). `see` is [file, text]: a game
// file and the function that does it, or a plan and the words that ask for it.
// The test checks the file holds the text.
export const EFFECTS = Object.freeze({
    // An enemy's sewerDweller flag reads as the `sewer` tag (tags.js tagsOf).
    mends_sewer_dweller: Object.freeze({
        status: 'live',
        does: 'thrown sewer fare mends a sewer dweller instead of hurting it',
        see: Object.freeze(['game/items.js', 'export function resolveThrow']),
    }),
    gift_to_sewer_dweller: Object.freeze({
        status: 'live',
        does: 'sewer fare handed to a sewer dweller is a kindness, not an insult',
        see: Object.freeze(['game/give-action.js', 'function applySewerFareGive']),
    }),
    sets_alight: Object.freeze({
        status: 'planned',
        does: 'fire sets a flammable thing alight',
        see: Object.freeze(['plans/systems-audit-2026-08.md',
            'opens to the fireball, the Fire Ring, the Ember Rat, a thrown lantern']),
    }),
});

const N = NONE;
const MENDS = 'mends_sewer_dweller';
const GIFT = 'gift_to_sewer_dweller';
const ALIGHT = 'sets_alight';

// One row per verb: the wheel's leaves (wheel-model.js ROOT), then the verbs
// the target list adds (targetVerbs). Columns in tags.js TAGS order.
export const MATRIX = Object.freeze(Object.fromEntries(Object.entries({
    // Fight > Melee
    hit:        { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    cleave:     { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    spin:       { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    // Fight
    ranged:     { flammable: ALIGHT, metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: MENDS, fire: N },
    // Fight > Magic
    fireball:   { flammable: ALIGHT, metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    coneofcold: { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    boo:        { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    // Fight
    defend:     { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    // Trick
    throw:      { flammable: ALIGHT, metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: MENDS, fire: N },
    trade:      { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: GIFT,  fire: N },
    // Trick > Thieve
    coin:       { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    kit:        { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    gear:       { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    // Trick (granted by gear and rings)
    rayblast:   { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    hirelion:   { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    ratform:    { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    emberrat:   { flammable: ALIGHT, metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    // Trick > Flight
    run:        { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    wait:       { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    // Treat
    eat:        { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    cleanse:    { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    // The target list (hit, trade and throw are rows above)
    examine:    { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    talk:       { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    shove:      { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    take:       { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
    open:       { flammable: N,      metal: N, porous: N, wet: N, rigid: N, vermin: N, undead: N, conducts: N, sewer: N,     fire: N },
}).map(([verb, row]) => [verb, Object.freeze(row)])));

// The verbs and tags with no edges today. This list may only shrink: the test
// pins its size, and an entry that gains an edge must come off.
export const EMPTY = Object.freeze({
    verbs: Object.freeze([
        'hit', 'cleave', 'spin', 'coneofcold', 'boo', 'defend',
        'coin', 'kit', 'gear', 'rayblast', 'hirelion', 'ratform',
        'run', 'wait', 'eat', 'cleanse',
        'examine', 'talk', 'shove', 'take', 'open',
    ]),
    tags: Object.freeze(['metal', 'porous', 'wet', 'rigid', 'vermin', 'undead', 'conducts', 'fire']),
});

const isBlank = (c) => c === undefined || c === null || c === '';

// The tags a verb's row reaches (cells that are not 'none').
export function edgesOfVerb(verb, matrix = MATRIX) {
    const row = matrix[verb] || {};
    return Object.keys(row).filter(t => !isBlank(row[t]) && row[t] !== NONE);
}

// The verbs that reach a tag.
export function edgesOfTag(tag, matrix = MATRIX) {
    return Object.keys(matrix).filter(v => {
        const c = (matrix[v] || {})[tag];
        return !isBlank(c) && c !== NONE;
    });
}

// Everything wrong with a matrix, as readable lines; [] when it is sound.
// `verbs` and `tags` are the real lists (the wheel's verbs, tags.js TAGS).
export function matrixProblems({ verbs, tags, matrix = MATRIX, effects = EFFECTS, empty = EMPTY }) {
    const P = [];
    const verbSet = new Set(verbs), tagSet = new Set(tags);

    for (const v of verbs) if (!matrix[v]) P.push(`verb '${v}' has no row`);
    for (const v of Object.keys(matrix)) if (!verbSet.has(v)) P.push(`row '${v}' is not a verb`);

    const used = new Set();
    for (const v of verbs) {
        const row = matrix[v];
        if (!row) continue;
        for (const t of Object.keys(row)) if (!tagSet.has(t)) P.push(`${v}: column '${t}' is not a tag`);
        for (const t of tags) {
            const c = row[t];
            if (isBlank(c)) P.push(`${v} x ${t}: blank cell`);
            else if (c !== NONE && !effects[c]) P.push(`${v} x ${t}: unknown effect '${c}'`);
            else if (c !== NONE) used.add(c);
        }
    }

    for (const [id, fx] of Object.entries(effects)) {
        if (!fx || (fx.status !== 'live' && fx.status !== 'planned')) P.push(`effect '${id}': status must be live or planned`);
        if (!fx || typeof fx.does !== 'string' || !fx.does) P.push(`effect '${id}': says nothing about what it does`);
        if (!fx || !Array.isArray(fx.see) || fx.see.length !== 2 || !fx.see[0] || !fx.see[1])
            P.push(`effect '${id}': see must be [file, text]`);
        if (!used.has(id)) P.push(`effect '${id}' is in no cell`);
    }

    const emptyVerbs = new Set(empty.verbs), emptyTags = new Set(empty.tags);
    for (const v of empty.verbs) {
        if (!verbSet.has(v)) P.push(`EMPTY lists '${v}', which is not a verb`);
        else if (edgesOfVerb(v, matrix).length) P.push(`EMPTY lists verb '${v}', which has edges: take it off`);
    }
    for (const t of empty.tags) {
        if (!tagSet.has(t)) P.push(`EMPTY lists '${t}', which is not a tag`);
        else if (edgesOfTag(t, matrix).length) P.push(`EMPTY lists tag '${t}', which has edges: take it off`);
    }
    for (const v of verbs)
        if (matrix[v] && !edgesOfVerb(v, matrix).length && !emptyVerbs.has(v)) P.push(`verb '${v}' has no edges`);
    for (const t of tags)
        if (!edgesOfTag(t, matrix).length && !emptyTags.has(t)) P.push(`tag '${t}' has no edges`);

    return P;
}
