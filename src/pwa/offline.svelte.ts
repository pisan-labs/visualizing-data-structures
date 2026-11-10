import { ASK_VERSION, BUILD_META, SKIP_WAITING } from './protocol';

/**
 * The page's side of the offline app: it registers the service worker (src/pwa/sw.js) in
 * production builds once the page has loaded, says when the browser is offline, and offers a
 * reload when a newer version is waiting. It never reloads on its own. AppStatus.svelte shows it.
 */
export const app = $state({
  /** The browser says there is no network. */
  offline: false,
  /** A worker is active, so every page opens without the network. */
  ready: false,
  /** A newer version is installed and waiting; reloading switches to it. */
  update: false,
});

const HOUR = 60 * 60 * 1000;
let started = false;
let registration: ServiceWorkerRegistration | null = null;
let waiting: ServiceWorker | null = null;

export function startOfflineApp(): void {
  if (started) return;
  started = true;
  app.offline = !navigator.onLine;
  addEventListener('offline', () => (app.offline = true));
  addEventListener('online', () => {
    app.offline = false;
    checkForUpdate();
  });
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (document.readyState === 'complete') void register();
  else addEventListener('load', () => void register(), { once: true });
}

async function register(): Promise<void> {
  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = await navigator.serviceWorker.register('/sw.js');
  } catch {
    return;
  }
  // Playwright's serviceWorkers: 'block' (every e2e spec but offline.spec.ts) returns nothing.
  if (!reg) return;
  registration = reg;
  void navigator.serviceWorker.ready.then(() => (app.ready = true));
  if (reg.waiting && reg.active) void consider(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      // With no older worker active, a new one takes over by itself (the first visit).
      if (worker.state === 'installed' && reg.active) void consider(worker);
    });
  });
  // A page left open for hours (a lecture, a lab) looks for a new version now and then.
  setInterval(checkForUpdate, HOUR);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}

function checkForUpdate(): void {
  registration?.update().catch(() => {});
}

/**
 * A worker is waiting. When it is this page's own build (the page came from the network after a
 * deploy, and only the offline copy is old), it takes over quietly: nothing on screen changes.
 * A worker that does not say its version (the kill switch, scripts/sw-kill.js) is left alone.
 * Otherwise the page is older than the worker, and the reader is offered the reload.
 */
async function consider(worker: ServiceWorker): Promise<void> {
  const mine = document.querySelector(`meta[name="${BUILD_META}"]`)?.getAttribute('content');
  const theirs = await askVersion(worker);
  if (theirs === null) return;
  if (theirs === mine) {
    worker.postMessage({ type: SKIP_WAITING });
    return;
  }
  waiting = worker;
  app.update = true;
}

function askVersion(worker: ServiceWorker): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 3000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(typeof e.data === 'string' ? e.data : null);
    };
    worker.postMessage({ type: ASK_VERSION }, [channel.port2]);
  });
}

/** The reader chose Reload: let the waiting worker take over, then reload into it. */
export function applyUpdate(): void {
  const worker = waiting;
  if (!worker || worker.state !== 'installed') {
    location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
    once: true,
  });
  worker.postMessage({ type: SKIP_WAITING });
  // Should the worker never take over (another tab moved things on), reload all the same.
  setTimeout(() => location.reload(), 4000);
}

export function dismissUpdate(): void {
  app.update = false;
}
