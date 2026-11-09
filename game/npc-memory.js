// npc-memory.js — NM1 (plans/nm1-talk-choices-remembered.md).
// Which one-time talk choices have been spent, per zone and per person (spawn id), so that
// a zone re-spawning its people does not hand the choices back. Pure; main.js and save.js use it.

// Write down the spent choices of everyone in `enemies`; a zone with none drops off the record.
export function rememberSpent(records, url, enemies) {
    if (!url) return records;
    const zone = {};
    for (const e of enemies || []) {
        if (e && e.id && e._dialogueDone && e._dialogueDone.size) zone[e.id] = [...e._dialogueDone];
    }
    if (Object.keys(zone).length) records[url] = zone;
    else delete records[url];
    return records;
}

// Give the freshly spawned people of `url` back what they had spent.
export function applySpent(records, url, enemies) {
    const zone = records && records[url];
    if (!zone) return;
    for (const e of enemies || []) {
        const ids = e && zone[e.id];
        if (!ids) continue;
        e._dialogueDone ||= new Set();
        for (const id of ids) e._dialogueDone.add(id);
    }
}

// { url: { spawnId: [choiceId] } }, anything malformed dropped.
export function sanitizeSpent(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [url, zone] of Object.entries(raw)) {
        if (!zone || typeof zone !== 'object' || Array.isArray(zone)) continue;
        const rows = {};
        for (const [id, list] of Object.entries(zone)) {
            const ids = Array.isArray(list) ? list.filter(x => typeof x === 'string') : [];
            if (ids.length) rows[id] = ids;
        }
        if (Object.keys(rows).length) out[url] = rows;
    }
    return out;
}
