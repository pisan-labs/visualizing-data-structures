import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { serviceWorkerSource } from './precache';

/**
 * The service worker's rules, run in a pretend worker: fake caches and a fake network, so each
 * strategy can be checked without a browser (tests/e2e/offline.spec.ts runs the real one).
 */
const ORIGIN = 'https://stepwise.test';
const PRECACHE = ['/', '/stack-array/', '/assets/index-a1.js', '/previews.json'];
const source = serviceWorkerSource(
  fs.readFileSync(new URL('./sw.js', import.meta.url), 'utf8'),
  'feed',
  PRECACHE,
);

type Listener = (event: unknown) => void;

function worker({ online = true, oldCaches = [] as string[] } = {}) {
  const store = new Map<string, Map<string, Response>>();
  for (const name of oldCaches) store.set(name, new Map());
  const key = (r: Request | string) => new URL(typeof r === 'string' ? r : r.url, ORIGIN).href;
  const strip = (url: string) => url.split('?')[0]!;
  // What each cached copy was requested with, for Vary (as the Cache API does).
  const sentWith = new Map<string, Headers>();
  type MatchOptions = { ignoreSearch?: boolean; ignoreVary?: boolean };
  const open = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name)!;
    const save = (r: Request, res: Response) => {
      entries.set(key(r), res);
      sentWith.set(`${name} ${key(r)}`, r.headers);
    };
    return {
      async addAll(requests: Request[]) {
        for (const r of requests) save(r, await network(r));
      },
      async put(r: Request, res: Response) {
        save(r, res);
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
  const fetched: { url: string; cache: string }[] = [];
  async function network(r: Request): Promise<Response> {
    fetched.push({ url: r.url, cache: r.cache });
    if (!online) throw new TypeError('Failed to fetch');
    // Like vite preview and many hosts, the server varies its answers by Origin.
    return new Response(`network ${new URL(r.url).pathname}`, { headers: { Vary: 'Origin' } });
  }
  // Node's Request needs absolute addresses; a worker resolves them against its own.
  class WorkerRequest extends Request {
    constructor(input: string, init?: RequestInit) {
      super(new URL(input, ORIGIN), init);
    }
  }
  const listeners: Record<string, Listener> = {};
  const calls = { skipWaiting: 0, claim: 0, preload: 0 };
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
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
    Set,
    Promise,
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

  return {
    store,
    fetched,
    calls,
    request,
    install: () => extendable('install'),
    activate: () => extendable('activate'),
    goOffline: () => (online = false),
    message: (data: unknown) => {
      const replies: unknown[] = [];
      listeners.message!({ data, ports: [{ postMessage: (m: unknown) => replies.push(m) }] });
      return replies;
    },
  };
}

describe('service worker', () => {
  it('precaches every listed file on install, pages past the HTTP cache', async () => {
    const w = worker();
    await w.install();
    expect([...w.store.get('stepwise-static-feed')!.keys()].sort()).toEqual(
      PRECACHE.map((u) => `${ORIGIN}${u}`).sort(),
    );
    expect(w.fetched.find((f) => f.url.endsWith('/stack-array/'))?.cache).toBe('reload');
    expect(w.fetched.find((f) => f.url.includes('/assets/'))?.cache).toBe('default');
    expect(w.calls.skipWaiting).toBe(0);
  });

  it("deletes older versions' caches on activate, and only StepWise's", async () => {
    const w = worker({ oldCaches: ['stepwise-static-0ld', 'stepwise-runtime-0ld', 'other-app'] });
    await w.install();
    await w.activate();
    expect([...w.store.keys()].sort()).toEqual(['other-app', 'stepwise-static-feed']);
    expect(w.calls).toMatchObject({ claim: 1, preload: 1 });
  });

  it('never handles another origin, or anything but GET', async () => {
    const w = worker();
    await w.install();
    expect(await w.request('https://example.supabase.co/rest/v1/examples')).toBeNull();
    expect(await w.request('https://example.supabase.co/auth', { method: 'POST' })).toBeNull();
    expect(await w.request('/stack-array/', { method: 'POST' })).toBeNull();
  });

  it('serves pages from the network while online, without caching them', async () => {
    const w = worker();
    await w.install();
    const before = w.fetched.length;
    expect(await w.request('/stack-array/', { mode: 'navigate' })).toBe('network /stack-array/');
    expect(w.fetched.length).toBe(before + 1);
    expect(w.store.has('stepwise-runtime-feed')).toBe(false);
  });

  it("offline, serves this build's copy of a page, else the home page", async () => {
    const w = worker();
    await w.install();
    w.store.get('stepwise-static-feed')!.set(`${ORIGIN}/`, new Response('cached home'));
    w.store.get('stepwise-static-feed')!.set(`${ORIGIN}/stack-array/`, new Response('cached'));
    w.goOffline();
    const page = (url: string) => w.request(url, { mode: 'navigate' });
    expect(await page('/stack-array/')).toBe('cached');
    expect(await page('/stack-array/?utm=x')).toBe('cached');
    expect(await page('/stack-array')).toBe('cached');
    expect(await page('/')).toBe('cached home');
    expect(await page('/not-built-yet/')).toBe('cached home');
  });

  it('serves hashed assets from the cache first, and keeps ones it had to fetch', async () => {
    const w = worker();
    await w.install();
    const before = w.fetched.length;
    // A module script's request carries an Origin header that the precache request did not.
    const script = { headers: { Origin: ORIGIN } };
    expect(await w.request('/assets/index-a1.js', script)).toBe('network /assets/index-a1.js');
    expect(w.fetched.length).toBe(before);
    expect(await w.request('/assets/new-b2.js')).toBe('network /assets/new-b2.js');
    expect(w.fetched.length).toBe(before + 1);
    w.goOffline();
    expect(await w.request('/assets/new-b2.js')).toBe('network /assets/new-b2.js');
  });

  it('serves other files from the network first and the cache when offline', async () => {
    const w = worker();
    await w.install();
    await w.request('/previews/bst.json');
    await w.request('/previews.json');
    // The precached thumbnails stay as the build made them; the others are kept as they come.
    expect([...w.store.get('stepwise-runtime-feed')!.keys()]).toEqual([
      `${ORIGIN}/previews/bst.json`,
    ]);
    w.goOffline();
    expect(await w.request('/previews/bst.json')).toBe('network /previews/bst.json');
    expect(await w.request('/previews.json')).toBe('network /previews.json');
    await expect(w.request('/previews/avl.json')).rejects.toThrow('Failed to fetch');
  });

  it('tells its version, and takes over only when asked', () => {
    const w = worker();
    expect(w.message({ type: 'version' })).toEqual(['feed']);
    expect(w.calls.skipWaiting).toBe(0);
    w.message({ type: 'skip-waiting' });
    expect(w.calls.skipWaiting).toBe(1);
    expect(w.message({ type: 'something else' })).toEqual([]);
  });
});
