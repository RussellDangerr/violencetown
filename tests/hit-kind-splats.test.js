// hit-kind-splats.test.js — a physical hit lands slash, stab or crush, and its
// splat shows which (plans/ws4-hit-kind-splats.md). WR1 pick b: the kinds are
// real subtypes that meet weak/resist, and a weapon uses its best one.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { bestAttackKind, weaponHitKind, elementalMult } from '../game/combat.js';
import { hitKindTag, HIT_KIND_TAG } from '../game/hit-splat.js';
import { ATTACK_KINDS, WEAPON_CLASSES, WEAPONS } from '../game/weapons.js';
import { Renderer } from '../game/renderer.js';
import { DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

describe('bestAttackKind — the best kind against this target', () => {
    test('a tie goes to the class\'s first kind', () => {
        assert.equal(bestAttackKind(['slash', 'stab'], {}), 'slash');
        assert.equal(bestAttackKind(['stab', 'slash'], {}), 'stab');
        assert.equal(bestAttackKind(['slash', 'stab'], null), 'slash');
    });

    test('a weakness to the second kind makes it the pick', () => {
        assert.equal(bestAttackKind(['slash', 'stab'], { weak: ['stab'] }), 'stab');
    });

    test('a resisted or immune first kind loses to a plain second one', () => {
        assert.equal(bestAttackKind(['slash', 'stab'], { resist: ['slash'] }), 'stab');
        assert.equal(bestAttackKind(['slash', 'stab'], { immune: ['slash'] }), 'stab');
    });

    test('one kind is always that kind, even when it is resisted', () => {
        assert.equal(bestAttackKind(['crush'], { resist: ['crush'] }), 'crush');
    });

    test('no kinds, no pick', () => {
        assert.equal(bestAttackKind([], {}), null);
        assert.equal(bestAttackKind(undefined, {}), null);
    });
});

describe('weaponHitKind — the kind a weapon lands', () => {
    test('every class lands one of its own kinds', () => {
        for (const [id, cls] of Object.entries(WEAPON_CLASSES)) {
            const kind = weaponHitKind({ weaponClass: id }, {});
            assert.ok(cls.attackKinds.includes(kind), `${id} landed ${kind}`);
        }
    });

    test('the shipped physical weapons: a sword slashes, the bone clubs crush, the whip slashes', () => {
        assert.equal(weaponHitKind(WEAPONS.wooden_sword, {}), 'slash');
        assert.equal(weaponHitKind(WEAPONS.fearmur, {}), 'crush');
        assert.equal(weaponHitKind(WEAPONS.gator_tail, {}), 'crush');
        assert.equal(weaponHitKind(WEAPONS.lion_whip, {}), 'slash');
    });

    test('a sword stabs what is weak to a stab', () => {
        assert.equal(weaponHitKind(WEAPONS.wooden_sword, { weak: ['stab'] }), 'stab');
    });

    test('a weapon with its own damage type has no kind', () => {
        assert.equal(WEAPONS.ray_gun.damageType, 'energy', 'the fixture is a typed weapon');
        assert.equal(weaponHitKind(WEAPONS.ray_gun, {}), null);
    });

    test('no weapon, or no class, no kind', () => {
        assert.equal(weaponHitKind(null, {}), null);
        assert.equal(weaponHitKind({ damage: 10 }, {}), null);
    });
});

describe('damage does not move today', () => {
    // No shipped enemy names a hit kind in weak/resist/immune, so the best kind
    // multiplies every hit by exactly 1. Giving one a kind is a tuning ruling.
    const mapDir = fileURLToPath(new URL('../game/', import.meta.url));
    const lists = [];
    const walk = (node) => {
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (!node || typeof node !== 'object') return;
        for (const key of ['weak', 'resist', 'immune']) if (Array.isArray(node[key])) lists.push(node[key]);
        Object.values(node).forEach(walk);
    };
    for (const f of readdirSync(mapDir).filter((n) => n.endsWith('-map.json'))) {
        walk(JSON.parse(readFileSync(mapDir + f, 'utf8')));
    }

    test('the maps really carry weak/resist lists to check', () => {
        assert.ok(lists.length > 0);
    });

    test('no shipped list names slash, stab or crush', () => {
        for (const l of lists) for (const k of ATTACK_KINDS) assert.ok(!l.includes(k), `${k} in ${l}`);
    });

    test('so every weapon\'s best kind multiplies by 1 against every listed target', () => {
        let checked = 0;
        for (const l of lists) {
            for (const target of [{ weak: l }, { resist: l }, { immune: l }]) {
                for (const w of Object.values(WEAPONS)) {
                    const kind = weaponHitKind(w, target);
                    if (!kind) continue;
                    assert.equal(elementalMult(kind, target), 1, `${w.id} lands ${kind}`);
                    checked++;
                }
            }
        }
        assert.ok(checked > 0, 'some physical weapon was checked');
    });
});

describe('hitKindTag — what the splat wears for each kind', () => {
    test('every kind has its own tag, and no two are the same', () => {
        const tags = ATTACK_KINDS.map(hitKindTag);
        for (const t of tags) assert.ok(typeof t === 'string' && t.length > 0);
        assert.equal(new Set(tags).size, ATTACK_KINDS.length);
        assert.deepEqual(Object.keys(HIT_KIND_TAG).sort(), [...ATTACK_KINDS].sort());
    });

    test('no kind, or an unknown one, no tag', () => {
        assert.equal(hitKindTag(null), null);
        assert.equal(hitKindTag(undefined), null);
        assert.equal(hitKindTag('fire'), null);
    });
});

describe('the splat draws its kind', () => {
    const VP = computeViewport({ cssW: 1920, cssH: 1080, dpr: 1, dock: DOCK });
    const ctx = new Proxy({ globalAlpha: 1 }, {
        get(t, k) { return k in t ? t[k] : () => ({ addColorStop() {} }); },
        set(t, k, v) { t[k] = v; return true; },
    });
    const draw = (dn) => {
        const drawn = [];
        const r = Object.assign(Object.create(Renderer.prototype), {
            ctx, canvas: { width: VP.backingW, height: VP.backingH }, viewport: VP, sprites: {},
            font: { measure: (t) => t.length * 5, drawText: (c, text) => drawn.push(text) },
            _scrollX: 0, _scrollY: 0,
        });
        r._drawHitSplat({ playerX: 10, playerY: 10 }, { tileX: 11, tileY: 10, text: '-10', type: 'physical',
            bornAt: 0, maxAge: 620, ...dn }, 200);
        return drawn;
    };

    test('a hit of each kind draws its own tag beside the number', () => {
        for (const k of ATTACK_KINDS) {
            const drawn = draw({ kind: k });
            assert.ok(drawn.includes('-10'), `the number still draws: ${drawn}`);
            assert.ok(drawn.includes(hitKindTag(k)), `${k}: ${drawn}`);
        }
    });

    test('a hit with no kind draws only its number, as before', () => {
        assert.deepEqual(draw({}), ['-10']);
    });
});
