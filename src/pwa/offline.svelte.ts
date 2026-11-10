import { readJson, writeJson } from '../engine/storage';
import {
  ASK_STATUS,
  ASK_VERSION,
  BUILD_META,
  DOWNLOAD,
  SKIP_WAITING,
  type DownloadProgress,
  type OfflineStatus,
} from './protocol';

/**
 * The page's side of the offline app: it registers the service worker (src/pwa/sw.js) in
 * production builds once the page has loaded, says when the browser is offline, offers a reload
 * when a newer version is waiting (it never reloads on its own), and runs "Make every page
 * available offline". AppStatus.svelte and OfflineDownload.svelte show it.
 */
export const app = $state({
  /** The browser says there is no network. */
  offline: false,
  /** A worker controls the page, so pages kept so far open without the network. */
  ready: false,
  /** A newer version is installed and waiting; reloading switches to it. */
  update: false,
  /** What is still missing for every page offline; null until the worker says. */
  missing: null as OfflineStatus | null,
  /** The download of every page: under way, or how the last one ended; null before any. */
  saving: null as DownloadProgress | null,
});

/** Browser storage: the reader asked for every page offline, so later builds top up by themselves. */
const EVERYTHING = 'offline-everything';

/** The browser asks to save data (only Chromium says). Then nothing downloads unasked. */
export function saveData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

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
  void keepThisPage();
  navigator.serviceWorker.addEventListener('controllerchange', () => void refreshStatus());
  const watch = (worker: ServiceWorker | null) =>
    worker?.addEventListener('statechange', () => {
      // With no older worker active, a new one takes over by itself (the first visit).
      if (worker.state === 'installed' && reg.active) void consider(worker);
    });
  if (reg.waiting && reg.active) void consider(reg.waiting);
  // The browser looks for a new worker as the page loads, so one may be installing already.
  watch(reg.installing);
  reg.addEventListener('updatefound', () => watch(reg.installing));
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
 * Once a worker controls the page: keep what this page loaded before it did (on a first visit
 * the page arrives before the worker), learn what is still missing, and, for a reader who asked
 * for every page, fetch what this build changed. With Save-Data on, nothing downloads unasked.
 */
async function keepThisPage(): Promise<void> {
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller)
    await new Promise((done) =>
      navigator.serviceWorker.addEventListener('controllerchange', done, { once: true }),
    );
  app.ready = true;
  if (!saveData()) {
    const loaded = performance
      .getEntriesByType('resource')
      .map((e) => new URL(e.name))
      .filter((u) => u.origin === location.origin)
      .map((u) => u.pathname);
    await download([location.pathname, ...loaded], false);
  }
  await refreshStatus();
  if (readJson(EVERYTHING, false) && !saveData() && navigator.onLine && app.missing?.count)
    await download(null, true);
}

/** Send the controlling worker a message and wait for its answer (null after a while). */
function ask(message: object): Promise<unknown> {
  const worker = navigator.serviceWorker.controller;
  return worker ? askWorker(worker, message) : Promise.resolve(null);
}

function askWorker(worker: ServiceWorker, message: object): Promise<unknown> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 3000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data);
    };
    worker.postMessage(message, [channel.port2]);
  });
}

async function refreshStatus(): Promise<void> {
  const status = await ask({ type: ASK_STATUS });
  if (status && typeof status === 'object') app.missing = status as OfflineStatus;
}

/**
 * Ask the worker to fetch and keep `urls` (null: every file it does not hold yet). With `show`,
 * its progress goes to `app.saving`. A worker that falls silent for 30 seconds (the browser
 * stopped it) ends the download; what it kept so far stays kept.
 */
function download(urls: string[] | null, show: boolean): Promise<void> {
  const worker = navigator.serviceWorker.controller;
  if (!worker) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      clearTimeout(timer);
      channel.port1.close();
      resolve();
    };
    const wait = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const s = app.saving;
        if (show && s) app.saving = { ...s, failed: s.failed + s.count - s.done, finished: true };
        end();
      }, 30_000);
    };
    channel.port1.onmessage = (e) => {
      const progress = e.data as DownloadProgress;
      if (show) app.saving = progress;
      if (progress.finished) end();
      else wait();
    };
    wait();
    worker.postMessage({ type: DOWNLOAD, urls }, [channel.port2]);
  }).then(refreshStatus);
}

/** "Make every page available offline": remembered, so later builds top up by themselves. */
export async function saveEverything(): Promise<void> {
  if (app.saving && !app.saving.finished) return;
  writeJson(EVERYTHING, true);
  app.saving = { done: 0, count: 0, bytes: 0, total: 0, failed: 0, finished: false };
  await download(null, true);
}

/**
 * A worker is waiting. When it is this page's own build (the page came from the network after a
 * deploy, and only the offline copy is old), it takes over quietly: nothing on screen changes.
 * A worker that does not say its version (the kill switch, scripts/sw-kill.js) is left alone.
 * Otherwise the page is older than the worker, and the reader is offered the reload.
 */
async function consider(worker: ServiceWorker): Promise<void> {
  const mine = document.querySelector(`meta[name="${BUILD_META}"]`)?.getAttribute('content');
  const answer = await askWorker(worker, { type: ASK_VERSION });
  const theirs = typeof answer === 'string' ? answer : null;
  if (theirs === null) return;
  if (theirs === mine) {
    worker.postMessage({ type: SKIP_WAITING });
    return;
  }
  waiting = worker;
  app.update = true;
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
