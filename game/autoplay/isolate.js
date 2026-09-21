// isolate.js — what keeps an autoplay run away from a real player's game
// (plans/quest1-autoplay.md §5.4). Pure factories; boot.js installs them.

// An in-memory stand-in for localStorage. The save, the settings and the
// seen-hints list all live in localStorage, so a run on the real one could
// overwrite a player's save — and would read their settings, which would make
// two runs of one seed differ by whose browser ran them.
export function memoryStorage() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
        setItem: (k, v) => { m.set(String(k), String(v)); },
        removeItem: (k) => { m.delete(String(k)); },
        clear: () => { m.clear(); },
        key: (i) => [...m.keys()][i] ?? null,
        get length() { return m.size; },
    };
}

// fetch, counted: inflight() is how many requests are still loading, and a
// response is handed back only once its whole body has arrived. The autoplay
// freezes game time while anything is in flight, so a map load takes the same
// virtual time on a fast machine and a slow one.
const NULL_BODY = new Set([101, 204, 205, 304]);

export function fencedFetch(fetchImpl) {
    let n = 0;
    return {
        inflight: () => n,
        fetch: async (...args) => {
            n++;
            try {
                const res = await fetchImpl(...args);
                const body = NULL_BODY.has(res.status) ? null : await res.arrayBuffer();
                return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
            } finally {
                n--;
            }
        },
    };
}
