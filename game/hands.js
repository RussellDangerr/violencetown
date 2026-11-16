// hands.js — power wield (plans/hb1-power-wield-mask.md). One mask lets each
// hand hold its own two-hander; every other head slot refuses the second.
// No imports: items.js reads it.

// Placeholder copy; the real line is his.
export const POWER_WIELD_REFUSAL = '[TEXT: one two-hander is all these hands can hold]';

// True while the head slot holds a mask carrying the power-wield flag.
export function powerWielding(eq) {
    return !!(eq && eq.top && eq.top.powerWield);
}
