// sw.js — Violencetown's offline shell.
//
// Strategy: NETWORK-FIRST. Every GET tries the network first and only falls
// back to the cache when offline. This is deliberate: it means the dev server's
// cache-busting (and any fresh edit) ALWAYS wins while you're online, so the
// service worker can never serve stale code during development — it only kicks
// in when there's genuinely no network. Successful responses are cached as they
// load, so once you've played online the whole game works offline.

const CACHE = 'violencetown-v6';

// Minimal cold-start shell. Everything else (the JS modules, sprite sheets,
// maps) is cached at runtime on first load by the fetch handler below.
const CORE = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png',
    './favicon.svg',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(CORE).catch(() => { /* a missing file shouldn't block install */ }))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    event.respondWith(
        fetch(req)
            .then((res) => {
                // Cache same-origin successes for offline use; never block on it.
                if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
                    const copy = res.clone();
                    caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
                }
                return res;
            })
            .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
});
