// hit-splat.js — what a hit-splat WEARS: its heavy-hit threshold and its
// impact mark. Pure data + one pure function, extracted out of main.js so the
// mapping can be unit-tested directly (main.js exports nothing, so every test
// that wanted at it had to read the file as text and pattern-match the source).
//
// The rest of the splat — the typed colour, the per-type motion, the gold crit
// border — lives in renderer.js. This file only answers "which bare symbol, if
// any, pops beside the number", which is the one part of the splat that is a
// decision rather than a drawing. See plans/hit-splat-art.md.

// (manga-impact-marks) Damage at/above which a hit-splat is "heavy" — shared by
// combatAttack's screenshake trigger AND the mark pick below (star vs stars,
// drop vs drops), so the three can't drift into disagreeing thresholds.
export const HEAVY_HIT_DAMAGE = 15;

// Which bare-symbol MARK_SPRITES key (if any) pops beside a hit-splat's badge.
//
// A kill outranks the type-based pick — the same "milestone beat" precedence
// _triggerScreenShake already gives kills above — so a poisoned killing blow
// still reads as a KO, not a drip.
//
// The heavy/light split is the same rule twice: a blow worth flinching at gets
// the plural mark, a tap gets the singular one. It matters most for the liquid
// types, where the common case is a damage-over-time tick (buffs.js applyDot:
// 3-5 a turn) and the loud case is a Sludge Sack bursting on someone.
//
// Deliberately UNMARKED, each for its own reason (plans/hit-splat-art.md):
//   cold   — reachable (spells.js coneOfCold) but nothing in the mark sheet
//            reads as ice. It carries its cyan fill instead until art exists.
//   heal   — already the loudest-read splat in the game without a glyph (green
//            fill + the radial holy glow + a gentle float), and the mark sheet
//            has no heart. A star or a drop over a heal would read as damage.
//   crit   — an intensity, not a type. It already escalates on three axes (a
//            1.2x badge, the gold border, a bigger pop) and it shares the mark
//            slot with the type, so a crit mark would have to EVICT the type's.
//   fear   — spells.js boo is damage 0, and combatAttack returns before the
//            splat on a 0, so no 'fear' splat can exist to mark.
export function pickHitMark(type, amount, killed) {
    if (killed) return 'swirl';
    const heavy = amount >= HEAVY_HIT_DAMAGE;
    switch (type) {
        case 'physical': return heavy ? 'stars' : 'star';
        case 'poison':
        case 'sludge':   return heavy ? 'drops' : 'drop';
        case 'fire':     return 'anger';
        case 'energy':   return 'exclamation';
        default:         return null;
    }
}
