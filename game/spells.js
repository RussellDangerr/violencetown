// spells.js — castable spells for the wheel's FIGHT → Magic verb.
//
// Minimal seed for the Magic system (the full system — MP economy, a spell-
// selection layer, status effects, AoE shapes — is deferred per
// plans/combat-wheel-effects.md). For now this carries a single DEBUG spell.
//
// Spell shape: { id, name, mpCost, damage, damageType, range }
//   damageType feeds the typed hit-splat (see renderer.js — 'fire' is wired).
//   range is the reticle reach (wheel-model aimRange uses a flat magic range
//   until a per-spell selection layer exists).

export const SPELLS = {
    // DEBUG: a 999-damage nuke. Placeholder numbers — retune (or gate behind a
    // debug flag) when the real Magic system lands.
    fireball: { id: 'fireball', name: 'Fireball', mpCost: 50, damage: 999, damageType: 'fire', range: 6 },
};
