// StepWise's service worker, written by hand. scripts/prerender.mjs fills in the three lines
// below and writes the result to dist/sw.js (src/pwa/precache.ts). The page registers it in
// production builds only (src/pwa/offline.svelte.ts).
//
// - On install it keeps only the app shell (the home page, its script and stylesheet, the
//   manifest and the icons), plus the hashed files an earlier version kept that this build still
//   uses. With Save-Data on, it fetches nothing.
// - Pages (navigations and other HTML): network first, so a reader who is online always gets the
//   latest deploy, and kept as they arrive. Offline: the kept copy, else the home page (the app
//   reads the address and says when a page has not been saved), else a plain message.
// - Hashed files in /assets/: cache first (their names change whenever their contents do), kept
//   as they arrive.
// - Other files on this site (thumbnails, icons, the manifest): network first, kept as they
//   arrive, the kept copy when the network fails.
// - "Make every page available offline" asks it to fetch the rest of FILES (a DOWNLOAD message).
// - Anything on another origin (such as the accounts backend) is never intercepted or cached,
//   nor is any request other than GET.
//
// Kill switch: scripts/sw-kill.js (see README).

const VERSION = 'dev';
const SHELL = [];
const FILES = [];

const PREFIX = 'stepwise-';
const CACHE = `${PREFIX}${VERSION}`;
/** Every file this build can keep for offline use, with about how many bytes it costs. */
const SIZES = new Map(FILES);
// A copy serves any request for its address. Servers add Vary (Origin, Accept-Encoding), and the
// page's request for a module script carries an Origin header that ours did not, so honoring
// Vary would miss every script.
const ANY = { ignoreSearch: true, ignoreVary: true };

/** The reader's browser asks to save data (only Chromium says; elsewhere it is never on). */
const saveData = () => Boolean(self.navigator.connection && self.navigator.connection.saveData);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // A hashed file is the same file in every build that lists it, so what an earlier version
      // kept is kept again, without the network.
      for (const key of await caches.keys()) {
        if (!key.startsWith(PREFIX) || key === CACHE) continue;
        const old = await caches.open(key);
        for (const request of await old.keys()) {
          const path = new URL(request.url).pathname;
          if (!path.startsWith('/assets/') || !SIZES.has(path)) continue;
          const copy = await old.match(request);
          if (copy) await cache.put(request, copy);
        }
      }
      if (saveData()) return;
      // Pages are fetched past the HTTP cache so the copies match this build; hashed assets may
      // come from it (the page just loaded them).
      const have = await kept(cache);
      await cache.addAll(
        SHELL.filter((url) => !have.has(url)).map(
          (url) => new Request(url, { cache: url.startsWith('/assets/') ? 'default' : 'reload' }),
        ),
      );
    })(),
  );
  // No skipWaiting here: a new worker waits until the reader chooses to reload (or every tab
  // of the old version has closed), so an open page keeps the files it was built with.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const port = event.ports[0];
  if (data.type === 'version' && port) port.postMessage(VERSION);
  else if (data.type === 'skip-waiting') self.skipWaiting();
  else if (data.type === 'status' && port)
    event.waitUntil(status().then((s) => port.postMessage(s)));
  else if (data.type === 'download' && port) {
    const urls = Array.isArray(data.urls) ? data.urls : [...SIZES.keys()];
    event.waitUntil(download(urls, (progress) => port.postMessage(progress)));
  }
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
  else event.respondWith(networkFirst(event));
});

/** A page from the network (kept), else the kept copy, else the home page, else a message. */
async function page(event, url) {
  try {
    const response = (await event.preloadResponse) || (await fetch(event.request));
    keep(event, response);
    return response;
  } catch {
    const cache = await caches.open(CACHE);
    const slash = url.pathname.endsWith('/') ? null : `${url.pathname}/`;
    return (
      (await cache.match(url.pathname, ANY)) ||
      (slash && (await cache.match(slash, ANY))) ||
      (await cache.match('/', ANY)) ||
      notSaved()
    );
  }
}

async function cacheFirst(event) {
  const hit = await caches.match(event.request, ANY);
  if (hit) return hit;
  const response = await fetch(event.request);
  keep(event, response);
  return response;
}

async function networkFirst(event) {
  try {
    const response = await fetch(event.request);
    keep(event, response);
    return response;
  } catch (error) {
    const hit = await caches.match(event.request, ANY);
    if (hit) return hit;
    throw error;
  }
}

/** Keep a copy of a good response. */
function keep(event, response) {
  if (!response.ok) return;
  const copy = response.clone();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
}

/** The addresses a cache holds. */
async function kept(cache) {
  return new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
}

/** What is still missing for every page offline. */
async function status() {
  const have = await kept(await caches.open(CACHE));
  let count = 0;
  let bytes = 0;
  for (const [url, size] of SIZES)
    if (!have.has(url)) {
      count++;
      bytes += size;
    }
  return { count, bytes, total: SIZES.size };
}

/** Fetch and keep the listed files this build has and does not hold yet, four at a time. */
async function download(urls, report) {
  const cache = await caches.open(CACHE);
  const have = await kept(cache);
  const todo = [...new Set(urls)].filter((url) => SIZES.has(url) && !have.has(url));
  const progress = { done: 0, count: todo.length, bytes: 0, total: 0, failed: 0, finished: false };
  for (const url of todo) progress.total += SIZES.get(url);
  report({ ...progress });
  const next = todo.values();
  const fetchSome = async () => {
    for (const url of next) {
      try {
        const options = { cache: url.startsWith('/assets/') ? 'default' : 'no-cache' };
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        await cache.put(url, response);
      } catch {
        progress.failed++;
      }
      progress.done++;
      progress.bytes += SIZES.get(url);
      report({ ...progress });
    }
  };
  await Promise.all([fetchSome(), fetchSome(), fetchSome(), fetchSome()]);
  report({ ...progress, finished: true });
}

/** Offline, for a page that was never opened when even the home page is not kept. */
function notSaved() {
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="light dark"><title>Not saved for offline use</title>' +
    '<style>body{max-width:700px;margin:0 auto;padding:32px 16px;font:16px/1.5 system-ui,' +
    'sans-serif}</style></head><body><main><h1>This page has not been saved for offline use ' +
    'yet</h1><p>Open it again when you are back online.</p>' +
    '<p><a href="/">Back to all visualizations</a></p></main></body></html>';
  return new Response(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
