// jobs.js — BP6: the Job board in Town (plans/bp6-job-board-shards.md).
//
// The board offers one job at a time: bring back an item that one kind of enemy carries in a
// zone. Handing it in pays one Shard; SHARDS_PER_BOON Shards are traded for one boon poition.
// Pure helpers over the game object, so tests need no Game. The draw is a hash of the game's
// slot picks and the number of jobs done: it never touches game.rng, so slot picks and the
// autoplay are unchanged.

import { ITEMS, BOON_CAP, boonCount, BOON_CAP_LINE } from './items.js';

export const SHARDS_PER_BOON = 4;
export const BOARD_ID = 'job_board';

// Each job names an item in the kit of every one of that enemy's spawns in the zone, so it drops on death. tests/job-board
// checks every row against item-sources.js and the zone's map spawns.
export const JOBS = [
    { item: 'tunnel_mushroom', from: 'Violet Fungus', zone: 'Sewer' },
    { item: 'sludge_sack', from: 'Red Fungus', zone: 'Sewer' },
    { item: 'sludge_brain', from: 'Ghost Fungus', zone: 'Sewer' },
    { item: 'latex_gloves', from: 'Ruffian', zone: 'Downtown' },
];

const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };

// The job after `done` finished ones. Never the same job twice running.
export function jobAt(game, done) {
    const key = JSON.stringify((game && game.slots) || {});
    const at = (n) => fnv(`${key}|jobs|${n}`) % JOBS.length;
    let i = at(done);
    if (done > 0 && i === at(done - 1)) i = (i + 1) % JOBS.length;
    return JOBS[i];
}

export function jobState(game) {
    const j = game.jobs || (game.jobs = { done: 0, shards: 0 });
    return j;
}

const take = (game, id) => {
    const i = (game.inventory || []).findIndex(s => s && s.itemDef && s.itemDef.id === id);
    if (i < 0) return false;
    game._removeFromSlot(i);
    return true;
};

export const jobLine = (job) => `Job: bring back 1 ${ITEMS[job.item].name}. A ${job.from} in the ${job.zone} carries it.`;
export const shardLine = (n) => `Shards: ${n} / ${SHARDS_PER_BOON}.`;

// Use the board: hand in the job's item if it is in the bag, else say what the job is.
export function useJobBoard(game) {
    const st = jobState(game);
    const log = (m) => game._log(m);
    if (boonCount(game) >= BOON_CAP) { log(`Job board: no more jobs. ${BOON_CAP_LINE}`); return false; }
    const job = jobAt(game, st.done);
    if (!take(game, job.item)) {
        log(`Job board. ${jobLine(job)} ${shardLine(st.shards)}`);
        return false;
    }
    st.done += 1;
    st.shards += 1;
    log(`Job done. You hand in 1 ${ITEMS[job.item].name} and get 1 Shard. ${shardLine(st.shards)}`);
    if (st.shards >= SHARDS_PER_BOON) {
        st.shards -= SHARDS_PER_BOON;
        game._grantItem('boon_poition', `${SHARDS_PER_BOON} Shards make 1 boon poition. You get it.`);
    }
    log(`Next ${jobLine(jobAt(game, st.done)).replace('Job:', 'job:')}`);
    return true;
}

