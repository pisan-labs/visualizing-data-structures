// StepWise's service worker, written by hand. scripts/prerender.mjs fills in the two lines below
// and writes the result to dist/sw.js (src/pwa/precache.ts). The page registers it in
// production builds only (src/pwa/offline.svelte.ts).
//
// - Pages (navigations and other HTML): network first, so a reader who is online always gets the
//   latest deploy; the precached copy when the network fails.
// - Hashed files in /assets/: cache first (their names change whenever their contents do).
// - Other files on this site (thumbnails, icons, the manifest): network first, cached as they
//   arrive, the cache when the network fails.
// - Anything on another origin (such as the accounts backend) is never intercepted or cached,
//   nor is any request other than GET.
//
// Kill switch: scripts/sw-kill.js (see README).

const VERSION = 'dev';
const PRECACHE = [];

const PREFIX = 'stepwise-';
const STATIC = `${PREFIX}static-${VERSION}`;
const RUNTIME = `${PREFIX}runtime-${VERSION}`;
const PRECACHED = new Set(PRECACHE);
// A copy serves any request for its address. Servers add Vary (Origin, Accept-Encoding), and the
// page's request for a module script carries an Origin header the precache request did not, so
// honoring Vary would miss every script.
const ANY = { ignoreSearch: true, ignoreVary: true };

self.addEventListener('install', (event) => {
  // Pages are fetched past the HTTP cache so the copies match this build; hashed assets may come
  // from it (the page just loaded some of them).
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) =>
        cache.addAll(
          PRECACHE.map(
            (url) => new Request(url, { cache: url.startsWith('/assets/') ? 'default' : 'reload' }),
          ),
        ),
      ),
  );
  // No skipWaiting here: a new worker waits until the reader chooses to reload (or every tab
  // of the old version has closed), so an open page keeps the files it was built with.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [STATIC, RUNTIME];
      for (const key of await caches.keys())
        if (key.startsWith(PREFIX) && !keep.includes(key)) await caches.delete(key);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'version' && event.ports[0]) event.ports[0].postMessage(VERSION);
  else if (type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const accept = request.headers.get('accept') || '';
  if (request.mode === 'navigate' || accept.includes('text/html'))
    event.respondWith(page(event, url));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(event));
  else event.respondWith(networkFirst(event, url));
});

/** A page from the network, else this build's copy of it, else the home page's (the app reads
 * the address to decide what to show, so it opens any page). */
async function page(event, url) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch (error) {
    const cache = await caches.open(STATIC);
    const slash = url.pathname.endsWith('/') ? null : `${url.pathname}/`;
    const copy =
      (await cache.match(url.pathname, ANY)) ||
      (slash && (await cache.match(slash, ANY))) ||
      (await cache.match('/', ANY));
    if (copy) return copy;
    throw error;
  }
}

async function cacheFirst(event) {
  const hit = await caches.match(event.request, ANY);
  if (hit) return hit;
  const response = await fetch(event.request);
  keep(event, response);
  return response;
}

async function networkFirst(event, url) {
  try {
    const response = await fetch(event.request);
    // The precached ones stay as this build made them; others are kept as they arrive.
    if (!PRECACHED.has(url.pathname)) keep(event, response);
    return response;
  } catch (error) {
    const hit = await caches.match(event.request, ANY);
    if (hit) return hit;
    throw error;
  }
}

/** Put a copy of a good response in the runtime cache. */
function keep(event, response) {
  if (!response.ok) return;
  const copy = response.clone();
  event.waitUntil(caches.open(RUNTIME).then((cache) => cache.put(event.request, copy)));
}
