import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { serviceWorkerSource } from './precache';
import type { DownloadProgress, OfflineStatus } from './protocol';

/**
 * The service worker's rules, run in a pretend worker: fake caches and a fake network, so each
 * strategy can be checked without a browser (tests/e2e/offline.spec.ts runs the real one).
 */
const ORIGIN = 'https://stepwise.test';
const SHELL = ['/', '/assets/index-a1.js', '/manifest.webmanifest'];
const FILES: [string, number][] = [
  ['/', 900],
  ['/assets/bst-b1.js', 7000],
  ['/assets/index-a1.js', 80_000],
  ['/assets/stack-s1.js', 5000],
  ['/bst/', 1300],
  ['/manifest.webmanifest', 300],
  ['/previews.json', 70_000],
  ['/stack-array/', 1200],
];
const source = serviceWorkerSource(
  fs.readFileSync(new URL('./sw.js', import.meta.url), 'utf8'),
  'feed',
  SHELL,
  FILES,
);
const CACHE = 'stepwise-feed';

type Listener = (event: unknown) => void;

function worker({
  online = true,
  saveData = false,
  oldCaches = {} as Record<string, string[]>,
} = {}) {
  const store = new Map<string, Map<string, Response>>();
  const key = (r: Request | string) => new URL(typeof r === 'string' ? r : r.url, ORIGIN).href;
  const strip = (url: string) => url.split('?')[0]!;
  // What each cached copy was requested with, for Vary (as the Cache API does).
  const sentWith = new Map<string, Headers>();
  type MatchOptions = { ignoreSearch?: boolean; ignoreVary?: boolean };
  const open = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name)!;
    const save = (r: Request | string, res: Response) => {
      entries.set(key(r), res);
      sentWith.set(`${name} ${key(r)}`, typeof r === 'string' ? new Headers() : r.headers);
    };
    return {
      async addAll(requests: Request[]) {
        for (const r of requests) save(r, await network(r));
      },
      async put(r: Request | string, res: Response) {
        save(r, res);
      },
      async keys() {
        return [...entries.keys()].map((url) => new Request(url));
      },
      async match(r: Request | string, opts: MatchOptions = {}) {
        const want = opts.ignoreSearch ? strip(key(r)) : key(r);
        const headers = typeof r === 'string' ? new Headers() : r.headers;
        for (const [url, res] of entries) {
          if ((opts.ignoreSearch ? strip(url) : url) !== want) continue;
          const sent = sentWith.get(`${name} ${url}`) ?? new Headers();
          const vary = (res.headers.get('vary') ?? '').split(',').map((h) => h.trim());
          if (!opts.ignoreVary && vary.some((h) => h && sent.get(h) !== headers.get(h))) continue;
          return res.clone();
        }
        return undefined;
      },
    };
  };
  for (const [name, urls] of Object.entries(oldCaches))
    for (const url of urls) void open(name).put(url, new Response(`old ${url}`));
  const caches = {
    open: async (name: string) => open(name),
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    async match(r: Request | string, opts?: MatchOptions) {
      for (const name of store.keys()) {
        const hit = await open(name).match(r, opts);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  // Node's Request needs absolute addresses; a worker resolves them against its own.
  class WorkerRequest extends Request {
    constructor(input: string | Request, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, ORIGIN) : input, init);
    }
  }
  const fetched: { path: string; cache: string }[] = [];
  async function network(input: Request | string, init?: RequestInit): Promise<Response> {
    const r = typeof input === 'string' ? new WorkerRequest(input, init) : input;
    const path = new URL(r.url).pathname;
    fetched.push({ path, cache: r.cache });
    if (!online) throw new TypeError('Failed to fetch');
    if (path.includes('missing')) return new Response('Not here', { status: 404 });
    // Like vite preview and many hosts, the server varies its answers by Origin.
    return new Response(`network ${path}`, { headers: { Vary: 'Origin' } });
  }
  const listeners: Record<string, Listener> = {};
  const calls = { skipWaiting: 0, claim: 0, preload: 0 };
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    navigator: { connection: { saveData } },
    addEventListener: (type: string, f: Listener) => (listeners[type] = f),
    skipWaiting: async () => void calls.skipWaiting++,
    clients: { claim: async () => void calls.claim++ },
    registration: { navigationPreload: { enable: async () => void calls.preload++ } },
  };
  vm.runInNewContext(source, {
    self,
    caches,
    fetch: network,
    Request: WorkerRequest,
    Response,
    URL,
    Map,
    Set,
    Promise,
    Boolean,
    Array,
  });

  async function extendable(type: string, extra: object = {}) {
    const waits: Promise<unknown>[] = [];
    listeners[type]!({ ...extra, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  /** Dispatch a fetch: the response the worker gave, or null when it let the request through. */
  async function request(url: string, { mode, ...init }: RequestInit = {}) {
    let answer: Promise<Response> | null = null;
    const waits: Promise<unknown>[] = [];
    // A page cannot make a navigation request itself, so the mode is set on the object.
    const req = new Request(new URL(url, ORIGIN), init);
    listeners.fetch!({
      request: mode ? Object.defineProperty(req, 'mode', { value: mode }) : req,
      preloadResponse: Promise.resolve(undefined),
      respondWith: (p: Promise<Response>) => (answer = p),
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    if (!answer) return null;
    const res = await (answer as Promise<Response>);
    await Promise.all(waits);
    return res.text();
  }

  /** Post a message; every reply on its port, once the worker is done with it. */
  async function message(data: unknown): Promise<unknown[]> {
    const replies: unknown[] = [];
    await extendable('message', {
      data,
      ports: [{ postMessage: (m: unknown) => replies.push(m) }],
    });
    return replies;
  }

  const kept = () => [...(store.get(CACHE)?.keys() ?? [])].map((u) => new URL(u).pathname).sort();
  return {
    store,
    fetched,
    calls,
    kept,
    request,
    message,
    install: () => extendable('install'),
    activate: () => extendable('activate'),
    goOffline: () => (online = false),
  };
}

const page = (w: ReturnType<typeof worker>, url: string) => w.request(url, { mode: 'navigate' });
const sizeOf = (urls: string[]) =>
  FILES.filter(([u]) => urls.includes(u)).reduce((n, [, b]) => n + b, 0);

describe('service worker', () => {
  it('keeps only the app shell on install, pages past the HTTP cache', async () => {
    const w = worker();
    await w.install();
    expect(w.kept()).toEqual([...SHELL].sort());
    expect(w.fetched.find((f) => f.path === '/')?.cache).toBe('reload');
    expect(w.fetched.find((f) => f.path.startsWith('/assets/'))?.cache).toBe('default');
    expect(w.calls.skipWaiting).toBe(0);
  });

  it('carries over the hashed files an earlier version kept that this build still has', async () => {
    const w = worker({
      oldCaches: {
        'stepwise-0ld': [
          '/assets/stack-s1.js',
          '/assets/index-a1.js',
          '/assets/gone-g1.js',
          '/bst/',
        ],
        'other-app': ['/assets/stack-s1.js'],
      },
    });
    await w.install();
    // The old page is not carried over: this build's pages differ. The shell's script was
    // carried over, so it is not fetched again.
    expect(w.kept()).toEqual([...SHELL, '/assets/stack-s1.js'].sort());
    expect(w.fetched.map((f) => f.path)).not.toContain('/assets/index-a1.js');
    expect(await w.request('/assets/stack-s1.js')).toBe('old /assets/stack-s1.js');
    await w.activate();
    expect([...w.store.keys()].sort()).toEqual(['other-app', CACHE]);
    expect(w.calls).toMatchObject({ claim: 1, preload: 1 });
  });

  it('with Save-Data on, fetches nothing on install', async () => {
    const w = worker({ saveData: true, oldCaches: { 'stepwise-0ld': ['/assets/stack-s1.js'] } });
    await w.install();
    expect(w.fetched).toEqual([]);
    expect(w.kept()).toEqual(['/assets/stack-s1.js']);
  });

  it('never handles another origin, or anything but GET', async () => {
    const w = worker();
    await w.install();
    expect(await w.request('https://example.supabase.co/rest/v1/examples')).toBeNull();
    expect(await w.request('https://example.supabase.co/auth', { method: 'POST' })).toBeNull();
    expect(await w.request('/stack-array/', { method: 'POST' })).toBeNull();
  });

  it('serves pages from the network while online and keeps them', async () => {
    const w = worker();
    await w.install();
    expect(await page(w, '/stack-array/')).toBe('network /stack-array/');
    expect(w.kept()).toContain('/stack-array/');
    // Not-found answers are not kept.
    await page(w, '/missing-page/');
    expect(w.kept()).not.toContain('/missing-page/');
  });

  it("offline, serves a page's kept copy, else the home page, else a plain message", async () => {
    const w = worker();
    await w.install();
    await page(w, '/stack-array/');
    w.goOffline();
    expect(await page(w, '/stack-array/')).toBe('network /stack-array/');
    expect(await page(w, '/stack-array/?utm=x')).toBe('network /stack-array/');
    expect(await page(w, '/stack-array')).toBe('network /stack-array/');
    // The app reads the address and says the page has not been saved.
    expect(await page(w, '/bst/')).toBe('network /');

    const bare = worker({ saveData: true, online: false });
    await bare.install();
    expect(await page(bare, '/bst/')).toContain('This page has not been saved for offline use yet');
  });

  it('serves hashed assets from the cache first, and keeps ones it had to fetch', async () => {
    const w = worker();
    await w.install();
    const before = w.fetched.length;
    // A module script's request carries an Origin header that the shell's request did not.
    const script = { headers: { Origin: ORIGIN } };
    expect(await w.request('/assets/index-a1.js', script)).toBe('network /assets/index-a1.js');
    expect(w.fetched.length).toBe(before);
    expect(await w.request('/assets/bst-b1.js', script)).toBe('network /assets/bst-b1.js');
    expect(w.fetched.length).toBe(before + 1);
    w.goOffline();
    expect(await w.request('/assets/bst-b1.js', script)).toBe('network /assets/bst-b1.js');
  });

  it('serves other files from the network first and the kept copy when offline', async () => {
    const w = worker();
    await w.install();
    await w.request('/previews/bst.json');
    expect(w.kept()).toContain('/previews/bst.json');
    w.goOffline();
    expect(await w.request('/previews/bst.json')).toBe('network /previews/bst.json');
    await expect(w.request('/previews/avl.json')).rejects.toThrow('Failed to fetch');
  });

  it('says what is missing, and downloads it with progress when asked', async () => {
    const w = worker();
    await w.install();
    const rest = FILES.map(([u]) => u).filter((u) => !SHELL.includes(u));
    const [status] = (await w.message({ type: 'status' })) as OfflineStatus[];
    expect(status).toEqual({ count: rest.length, bytes: sizeOf(rest), total: FILES.length });

    const reports = (await w.message({ type: 'download' })) as DownloadProgress[];
    expect(reports[0]).toMatchObject({ done: 0, count: rest.length, total: sizeOf(rest) });
    expect(reports.at(-1)).toEqual({
      done: rest.length,
      count: rest.length,
      bytes: sizeOf(rest),
      total: sizeOf(rest),
      failed: 0,
      finished: true,
    });
    expect(reports.filter((r) => !r.finished)).toHaveLength(rest.length + 1);
    expect(w.kept()).toEqual(FILES.map(([u]) => u).sort());
    expect(await w.message({ type: 'status' })).toEqual([
      { count: 0, bytes: 0, total: FILES.length },
    ]);
    // Pages are fetched past the HTTP cache, hashed assets from it.
    expect(w.fetched.find((f) => f.path === '/bst/')?.cache).toBe('no-cache');
    expect(w.fetched.find((f) => f.path === '/assets/bst-b1.js')?.cache).toBe('default');
  });

  it('downloads only listed files of this build that it does not hold, and counts failures', async () => {
    const w = worker();
    await w.install();
    const before = w.fetched.length;
    const urls = ['/stack-array/', '/assets/stack-s1.js', '/', '/elsewhere.js', '/stack-array/'];
    const reports = (await w.message({ type: 'download', urls })) as DownloadProgress[];
    expect(reports.at(-1)).toMatchObject({ done: 2, count: 2, failed: 0, finished: true });
    expect(w.fetched.slice(before).map((f) => f.path)).toEqual([
      '/stack-array/',
      '/assets/stack-s1.js',
    ]);
    w.goOffline();
    const offline = (await w.message({ type: 'download' })) as DownloadProgress[];
    expect(offline.at(-1)).toMatchObject({ done: 3, count: 3, failed: 3, finished: true });
  });

  it('tells its version, and takes over only when asked', async () => {
    const w = worker();
    expect(await w.message({ type: 'version' })).toEqual(['feed']);
    expect(w.calls.skipWaiting).toBe(0);
    await w.message({ type: 'skip-waiting' });
    expect(w.calls.skipWaiting).toBe(1);
    expect(await w.message({ type: 'something else' })).toEqual([]);
  });
});
