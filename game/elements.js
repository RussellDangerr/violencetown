// elements.js — the weakness chart, as data (plans/el1-weakness-chart-data.md).
//
// The chart is Wu Xing, the five phases, read through the five climates of the
// Huangdi Neijing Suwen. Each damage type the game deals belongs to one phase
// (or to none). An attack whose phase OVERCOMES the target's phase meets a
// weakness; the reverse meets a resistance; anything else is neutral.
//
// Every phase, every type row and every edge names the source it rests on. A
// row that bends the source says how, in `departs`. Each line below is quoted in
// the original Chinese with a plain English gloss, by chapter, so it can be
// checked against the text (both works are on the Chinese Text Project,
// ctext.org).
//
// Nothing reads this module in play yet. Today's matchups are still the
// per-enemy weak/resist/immune arrays read by combat.js elementalMult.

export const SOURCES = Object.freeze({
    suwen5: Object.freeze({
        work: 'Huangdi Neijing Suwen',
        chapter: '5, Yin Yang Ying Xiang Da Lun (陰陽應象大論)',
        // The five directions, each with its climate and its phase, and (for the
        // north) its emotion.
        lines: Object.freeze([
            '東方生風，風生木 — the east begets wind, wind begets wood',
            '南方生熱，熱生火 — the south begets heat, heat begets fire',
            '中央生濕，濕生土 — the centre begets damp, damp begets earth',
            '西方生燥，燥生金 — the west begets dryness, dryness begets metal',
            '北方生寒，寒生水 — the north begets cold, cold begets water',
            '在志為恐 — (of the north, water) among the emotions it is fear',
        ]),
    }),
    suwen25: Object.freeze({
        work: 'Huangdi Neijing Suwen',
        chapter: '25, Bao Ming Quan Xing Lun (寶命全形論)',
        // The overcoming cycle, in one sentence.
        lines: Object.freeze([
            '木得金而伐，火得水而滅，土得木而達，金得火而缺，水得土而絕 — wood meets metal and '
                + 'is felled; fire meets water and is put out; earth meets wood and is opened; '
                + 'metal meets fire and is notched; water meets earth and is cut off',
        ]),
    }),
    shuogua: Object.freeze({
        work: 'Yijing (I Ching), Shuo Gua (說卦傳)',
        chapter: 'Shuo Gua',
        lines: Object.freeze([
            '萬物出乎震，震東方也 — all things come forth in Zhen; Zhen is the east',
            '震為雷 — Zhen is thunder',
        ]),
    }),
});

// The five phases and the climate the Suwen gives each.
export const PHASES = Object.freeze({
    wood:  Object.freeze({ climate: 'wind',    source: 'suwen5' }),
    fire:  Object.freeze({ climate: 'heat',    source: 'suwen5' }),
    earth: Object.freeze({ climate: 'damp',    source: 'suwen5' }),
    metal: Object.freeze({ climate: 'dryness', source: 'suwen5' }),
    water: Object.freeze({ climate: 'cold',    source: 'suwen5' }),
});

// The overcoming (ke) cycle: `from` overcomes `to`. An attack of phase `from`
// on a target of phase `to` is a weakness; `to` on `from` is a resistance.
export const EDGES = Object.freeze([
    Object.freeze({ from: 'metal', to: 'wood',  source: 'suwen25', says: 'wood meets metal and is felled' }),
    Object.freeze({ from: 'water', to: 'fire',  source: 'suwen25', says: 'fire meets water and is put out' }),
    Object.freeze({ from: 'wood',  to: 'earth', source: 'suwen25', says: 'earth meets wood and is opened' }),
    Object.freeze({ from: 'fire',  to: 'metal', source: 'suwen25', says: 'metal meets fire and is notched' }),
    Object.freeze({ from: 'earth', to: 'water', source: 'suwen25', says: 'water meets earth and is cut off' }),
]);

const row = (phase, sources, departs = null) =>
    Object.freeze({ phase, sources: Object.freeze(sources), departs });

// One row per damage type the game deals. `phase` null = outside the chart,
// neutral to everything. `departs` is null only where the type sits on the
// source exactly.
export const DAMAGE_TYPES = Object.freeze({
    fire:     row('fire',  ['suwen5']),
    cold:     row('water', ['suwen5']),
    sludge:   row('earth', ['suwen5']),
    energy:   row('wood',  ['shuogua', 'suwen5'],
        'Thunder is not one of the five climates; wood\'s climate is wind. Energy reaches wood '
        + 'through the trigram Zhen, which the Shuo Gua makes thunder and the east, and the '
        + 'Suwen makes the east wood.'),
    physical: row('metal', ['suwen25'],
        'Metal\'s climate is dryness. The game reads every physical hit as a blade, after '
        + '"wood meets metal and is felled"; fists, staffs and books are not metal.'),
    slash:    row('metal', ['suwen25'],
        'A kind of physical hit, so it follows physical onto metal.'),
    stab:     row('metal', ['suwen25'],
        'A kind of physical hit, so it follows physical onto metal.'),
    crush:    row('metal', ['suwen25'],
        'A kind of physical hit, so it follows physical onto metal; a crushing blow is the '
        + 'least like a blade of the three.'),
    clean:    row('wood',  ['suwen25'],
        'Soap is not in the source. It is placed on wood so that "earth meets wood and is '
        + 'opened" carries it over sludge.'),
    fear:     row('water', ['suwen5'],
        'Fear is an emotion, not a climate; the same chapter gives it to water.'),
    poison:   row(null,    [],
        'The source has no place for poison, so it stays outside the chart, neutral to '
        + 'everything, until it is placed.'),
});

// The phase a damage type belongs to, or null.
export function phaseOf(type) {
    return DAMAGE_TYPES[type]?.phase ?? null;
}

// What an attack of `attackType` meets on a target whose own type is
// `targetType`: 'weak', 'resist', or null for neutral (or unknown types).
export function matchup(attackType, targetType) {
    const a = phaseOf(attackType), t = phaseOf(targetType);
    if (!a || !t || a === t) return null;
    if (EDGES.some(e => e.from === a && e.to === t)) return 'weak';
    if (EDGES.some(e => e.from === t && e.to === a)) return 'resist';
    return null;
}

// The damage types a target of `targetType` would be weak to, and resist.
export function weaknessesOf(targetType) {
    return Object.keys(DAMAGE_TYPES).filter(a => matchup(a, targetType) === 'weak');
}
export function resistancesOf(targetType) {
    return Object.keys(DAMAGE_TYPES).filter(a => matchup(a, targetType) === 'resist');
}
