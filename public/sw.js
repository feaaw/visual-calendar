// Network-first or No-cache during development to prevent stale UI
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
