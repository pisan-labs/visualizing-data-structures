// The service worker's kill switch. If the real worker (src/pwa/sw.js) ever misbehaves, deploy
// this file as /sw.js: copy it to public/sw.js and commit (scripts/prerender.mjs then keeps it
// instead of writing its own; see "Offline app" in README.md). A browser that has the old worker
// fetches /sw.js when it next opens a page and installs this one, which takes over at once,
// deletes StepWise's caches and unregisters itself; from then on pages load from the network.
// It does not answer the page's version question, so no page offers a reload for it. To bring
// the offline app back, delete public/sw.js and deploy again.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith('stepwise-')) await caches.delete(key);
      await self.registration.unregister();
    })(),
  );
});
