// examine.js — the Examine skill (an active verb, not flavor text).
//
// Examining a nearby examinable logs its description and emits an `examine`
// event so quests can react. First taught on the broken-down car (Phase D
// content): the player learns Examine is a real action, and examining the car
// reveals the converter is gone. Examinables are loaded per-map into
// game.examinables as [{ id, x, y, text }].

import { manhattan } from './utils.js';

const FACE = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } };

// The examinable the player is facing, then any adjacent (incl. current) one.
export function findExaminable(game) {
    const ex = game.examinables;
    if (!ex || ex.length === 0) return null;
    const { playerX: x, playerY: y } = game;
    const fd = FACE[game.facing] || { dx: 0, dy: 0 };
    const faced = ex.find(e => e.x === x + fd.dx && e.y === y + fd.dy);
    if (faced) return faced;
    return ex.find(e => manhattan(e.x, e.y, x, y) <= 1) || null;
}

// Examine action. A free look (no turn cost): log the target's text and emit
// the event. Returns true if something was examined.
export function doExamine(game) {
    const target = findExaminable(game);
    if (!target) {
        game._log('[Nothing here worth examining.]');
        return false;
    }
    game.emitGameEvent('examine', { targetId: target.id });
    // Some examinables yield a one-time item (e.g. the Red Cape in a grate);
    // main.js owns the inventory + collected-set bookkeeping and its logging.
    if (target.grants && game._grantFromExaminable) {
        return game._grantFromExaminable(target);
    }
    const body = target.text || `[You examine the ${target.id}.]`;
    game._log(body);
    // (§12.3) Also surface it as a layered inspect panel. Examinables carry no
    // value tier, so the title is the de-underscored id on a gold heading; the
    // log line above keeps the history entry and any examine quest event fired.
    if (game._openInspect) game._openInspect({ title: String(target.id).replace(/_/g, ' '), body });
    return true;
}
