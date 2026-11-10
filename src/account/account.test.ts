import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveToLibrary, loadLibrary, type LibraryItem } from '../engine/storage';
import type { SavedExample } from '../engine/types';
import { account, connect, fitsHint, openShared, useBackendForTests } from './account.svelte';
import { readAuthReturn, stashReturn, takeStash } from './auth-return';
import { AccountError, asAccountError, exampleOf, isExampleId, MESSAGES } from './backend';
import { accountConfig, makeConfig, readConfig, SESSION_KEY } from './config';
import { toAccountError } from './errors';
import { createFakeBackend, type FakeBackend } from './fake';
import { copyBrowserExamples, notYetCopied, saveToAccount } from './library';
import { AccountShelf } from './shelf.svelte';
import { createSupabaseBackend } from './supabase';

/** A Storage that lives in memory (Node has no localStorage or sessionStorage). */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ex = (viz: string, ops: SavedExample['ops'] = []): SavedExample => ({
  format: 1,
  viz,
  settings: {},
  seed: 1,
  ops,
});

describe('configuration', () => {
  it('is on only with both values and a real address', () => {
    expect(makeConfig('https://auth.example.org', 'anon-key')).toEqual({
      url: 'https://auth.example.org',
      anonKey: 'anon-key',
    });
    expect(makeConfig('https://auth.example.org/', ' key ')).toEqual({
      url: 'https://auth.example.org',
      anonKey: 'key',
    });
    expect(makeConfig('https://auth.example.org', '')).toBeNull();
    expect(makeConfig('', 'key')).toBeNull();
    expect(makeConfig(undefined, undefined)).toBeNull();
    expect(makeConfig('auth.example.org', 'key')).toBeNull();
    expect(makeConfig('javascript:alert(1)', 'key')).toBeNull();
  });

  it('reads the build values unless a test override is set', () => {
    const env = { VITE_SUPABASE_URL: 'https://a.example.org', VITE_SUPABASE_ANON_KEY: 'k' };
    expect(readConfig(env, undefined)).toEqual({ url: 'https://a.example.org', anonKey: 'k' });
    expect(readConfig({}, undefined)).toBeNull();
    expect(readConfig({ VITE_SUPABASE_URL: 'https://a.example.org' }, undefined)).toBeNull();
    // The override wins either way: null turns accounts off whatever the build says.
    expect(readConfig(env, null)).toBeNull();
    expect(readConfig({}, { url: 'https://t.example.test', anonKey: 't' })).toEqual({
      url: 'https://t.example.test',
      anonKey: 't',
    });
    expect(readConfig(env, { url: 'https://t.example.test' })).toBeNull();
  });

  it('is off in the tests, which build with no values', () => {
    expect(accountConfig()).toBeNull();
    expect(account.enabled).toBe(false);
  });
});

describe('accounts off', () => {
  it('connects to nothing and says so', async () => {
    await expect(connect()).rejects.toThrow(MESSAGES.off);
    await expect(openShared('00000000-0000-4000-8000-000000000001')).rejects.toThrow(
      'accounts are not available here',
    );
  });
});

describe('examples in an account (fake backend)', () => {
  let fake: FakeBackend;
  beforeEach(() => {
    fake = createFakeBackend();
    useBackendForTests(fake);
  });
  afterEach(() => useBackendForTests(null));

  it('lists, saves, renames, shares and deletes this page’s examples', async () => {
    fake.signInAs('a@example.com');
    const shelf = new AccountShelf('stack-array', () => connect());
    await shelf.refresh();
    expect(shelf.status).toBe('ready');
    expect(shelf.items).toEqual([]);

    const first = await shelf.save('First', ex('stack-array', [['push', 1]]));
    const second = await shelf.save('Second', ex('stack-array', [['push', 2]]));
    expect(shelf.items.map((i) => i.title)).toEqual(['Second', 'First']);
    expect(first.shared).toBe(false);
    expect(isExampleId(first.id)).toBe(true);

    // Another page's example is not on this page's list.
    await saveToAccount(fake, 'Elsewhere', ex('bst'));
    await shelf.refresh();
    expect(shelf.items.map((i) => i.title)).toEqual(['Second', 'First']);

    const renamed = await shelf.rename(first.id, '  Renamed  ');
    expect(renamed.title).toBe('Renamed');
    expect(shelf.items.find((i) => i.id === first.id)?.title).toBe('Renamed');
    // Opening uses the account's name, and the example's own operations.
    expect(exampleOf(renamed)).toMatchObject({ title: 'Renamed', ops: [['push', 1]] });

    await shelf.setShared(second.id, true);
    expect(shelf.items.find((i) => i.id === second.id)?.shared).toBe(true);

    await shelf.remove(first.id);
    expect(shelf.items.map((i) => i.title)).toEqual(['Second']);
    await shelf.refresh();
    expect(shelf.items.map((i) => i.title)).toEqual(['Second']);
  });

  it('keeps each account’s examples to itself; a shared one is readable by its link only', async () => {
    fake.signInAs('a@example.com');
    const mine = await saveToAccount(fake, 'Private', ex('bst'));
    const shared = await saveToAccount(fake, 'Shared', ex('bst', [['insert', 5]]));
    await fake.updateExample(shared.id, { shared: true });

    fake.signInAs('b@example.com');
    expect(await fake.listExamples('bst')).toEqual([]);
    await expect(fake.updateExample(mine.id, { title: 'Taken' })).rejects.toThrow(MESSAGES.missing);
    await expect(fake.deleteExample(mine.id)).rejects.toThrow(MESSAGES.missing);

    await fake.signOut();
    expect(await fake.readSharedExample(mine.id)).toBeNull();
    expect(await fake.readSharedExample('not-an-id')).toBeNull();
    const read = await fake.readSharedExample(shared.id);
    expect(read).toEqual({
      viz: 'bst',
      title: 'Shared',
      notes: '',
      example: { ...ex('bst', [['insert', 5]]), title: 'Shared' },
    });
    expect(Object.keys(read!).sort()).toEqual(['example', 'notes', 'title', 'viz']);

    // The store's openShared says plainly when there is nothing to open.
    await expect(openShared(mine.id)).rejects.toThrow('not available');
    await expect(openShared(shared.id)).resolves.toMatchObject({ title: 'Shared' });
  });

  it('takes an example deleted elsewhere off the list', async () => {
    fake.signInAs('a@example.com');
    const shelf = new AccountShelf('bst', () => connect());
    const row = await shelf.save('Gone soon', ex('bst'));
    await fake.deleteExample(row.id);
    await expect(shelf.rename(row.id, 'New')).rejects.toThrow(MESSAGES.missing);
    expect(shelf.items).toEqual([]);
  });

  it('refuses oversize examples and a full account', async () => {
    fake.signInAs('a@example.com');
    await expect(
      fake.createExample({ viz: 'bst', title: 'x'.repeat(201), example: {} }),
    ).rejects.toThrow(MESSAGES.large);
    // saveToAccount trims the name to the limit instead.
    await expect(saveToAccount(fake, 'x'.repeat(300), ex('bst'))).resolves.toMatchObject({
      title: 'x'.repeat(200),
    });
    for (let i = 1; i < 1000; i++)
      await fake.createExample({ viz: 'bst', title: `n${i}`, example: {} });
    await expect(saveToAccount(fake, 'one too many', ex('bst'))).rejects.toThrow(MESSAGES.full);
  });

  it('copies the browser’s examples once, skipping ones already copied', async () => {
    saveToLibrary('Old stack', ex('stack-array', [['push', 1]]));
    saveToLibrary('A tree', ex('bst', [['insert', 3]]));
    saveToLibrary('New stack', ex('stack-array', [['push', 2]]));
    const library = loadLibrary();
    const a = fake.signInAs('a@example.com');
    expect(notYetCopied(a.id, library)).toHaveLength(3);

    expect(await copyBrowserExamples(fake, a.id, library)).toEqual({
      copied: 3,
      left: 0,
      error: null,
    });
    expect(notYetCopied(a.id, library)).toEqual([]);
    // Oldest first, so the newest is on top of the list.
    expect((await fake.listExamples('stack-array')).map((r) => r.title)).toEqual([
      'New stack',
      'Old stack',
    ]);
    expect(await copyBrowserExamples(fake, a.id, library)).toMatchObject({ copied: 0 });
    expect(fake.rows).toHaveLength(3);

    // Another account starts from scratch.
    const b = fake.signInAs('b@example.com');
    expect(notYetCopied(b.id, library)).toHaveLength(3);
  });

  it('stops a copy that fails halfway and carries on next time', async () => {
    const library: LibraryItem[] = ['one', 'two', 'three'].map((title, i) => ({
      key: `k${i}`,
      title,
      savedAt: '2026-11-10T00:00:00Z',
      example: ex('bst'),
    }));
    const a = fake.signInAs('a@example.com');
    const create = fake.createExample.bind(fake);
    let calls = 0;
    fake.createExample = async (input) => {
      if (++calls === 2) throw new AccountError('unreachable');
      return create(input);
    };
    const first = await copyBrowserExamples(fake, a.id, library);
    expect(first.copied).toBe(1);
    expect(first.left).toBe(2);
    expect(first.error?.message).toBe(MESSAGES.unreachable);
    expect(notYetCopied(a.id, library)).toHaveLength(2);
    expect(await copyBrowserExamples(fake, a.id, library)).toMatchObject({ copied: 2, left: 0 });
    expect(fake.rows.map((r) => r.title).sort()).toEqual(['one', 'three', 'two']);
  });

  it('shows a short message when the account cannot be reached', async () => {
    fake.signInAs('a@example.com');
    const shelf = new AccountShelf('bst', () => connect());
    fake.failWith = 'unreachable';
    await shelf.refresh();
    expect(shelf.status).toBe('error');
    expect(shelf.problem).toBe(MESSAGES.unreachable);
    await expect(shelf.save('x', ex('bst'))).rejects.toThrow(MESSAGES.unreachable);
    fake.failWith = null;
    await shelf.refresh();
    expect(shelf.status).toBe('ready');
  });

  it('follows sign-in and sign-out', async () => {
    await connect();
    fake.signInAs('a@example.com');
    expect(account.user?.email).toBe('a@example.com');
    await fake.signOut();
    expect(account.user).toBeNull();
  });
});

describe('failure messages', () => {
  it('turns Supabase errors into plain words', () => {
    const kind = (raw: unknown, status?: number) => toAccountError(raw, status).kind;
    expect(kind({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 })).toBe(
      'unreachable',
    );
    expect(kind(new TypeError('Failed to fetch'))).toBe('unreachable');
    expect(kind({ message: 'TypeError: NetworkError when attempting to fetch resource.' }, 0)).toBe(
      'unreachable',
    );
    expect(kind({ name: 'TimeoutError', message: 'signal timed out' })).toBe('unreachable');
    expect(kind({ message: 'Service Unavailable' }, 503)).toBe('unreachable');
    expect(kind({ code: 'PGRST116', message: 'no rows' }, 406)).toBe('missing');
    expect(kind({ code: '23514', message: 'violates check constraint' }, 400)).toBe('large');
    expect(kind({ code: 'P0001', message: 'saved_examples_limit: at most 1000' }, 400)).toBe(
      'full',
    );
    expect(kind({ code: 'PGRST301', message: 'JWT expired' }, 401)).toBe('expired');
    expect(kind({ name: 'AuthApiError', code: 'otp_expired', status: 403 })).toBe('link');
    expect(kind({ name: 'AuthPKCECodeVerifierMissingError', status: 400 })).toBe('browser');
    expect(kind({ name: 'AuthPKCEGrantCodeExchangeError', status: 500 })).toBe('link');
    expect(kind({ name: 'AuthApiError', code: 'email_address_invalid', status: 400 })).toBe(
      'email',
    );
    expect(kind({ message: 'something odd' }, 418)).toBe('other');
    const passed = new AccountError('missing');
    expect(toAccountError(passed)).toBe(passed);
  });

  it('says to wait or use Google when sign-in emails are limited', () => {
    const perAddress = toAccountError({
      name: 'AuthApiError',
      status: 429,
      code: 'over_email_send_rate_limit',
      message: 'For security purposes, you can only request this after 42 seconds.',
    });
    expect(perAddress.kind).toBe('rate');
    expect(perAddress.retryAfter).toBe(42);
    expect(perAddress.message).toBe(
      'Too many sign-in emails right now. Try Google, or wait a minute and try again.',
    );
    const project = toAccountError({ name: 'AuthApiError', message: 'email rate limit exceeded' });
    expect(project.kind).toBe('rate');
    expect(project.retryAfter).toBeUndefined();
    expect(toAccountError({ message: 'Too Many Requests' }, 429).kind).toBe('rate');
  });

  it('says when the database is not ready for a feature yet', () => {
    const kind = (raw: unknown, status?: number) => toAccountError(raw, status).kind;
    expect(
      kind(
        {
          code: 'PGRST205',
          message: "Could not find the table 'app_stepwise.preferences' in the schema cache",
        },
        404,
      ),
    ).toBe('unavailable');
    expect(kind({ code: 'PGRST202', message: 'Could not find the function' }, 404)).toBe(
      'unavailable',
    );
    expect(kind({ code: '42P01', message: 'relation does not exist' }, 404)).toBe('unavailable');
  });

  it('treats a part of the site that did not load as unreachable', () => {
    expect(asAccountError(new TypeError('Failed to fetch dynamically imported module')).kind).toBe(
      'unreachable',
    );
    expect(asAccountError(new Error('boom')).kind).toBe('other');
  });
});

describe('coming back from signing in', () => {
  it('takes the code out of the address', () => {
    expect(readAuthReturn('?code=abc', '')).toEqual({
      ret: { kind: 'code', code: 'abc' },
      search: '',
      hash: '',
    });
    expect(readAuthReturn('?code=abc&sb_flow_id=f1&keep=1', '#ex=z123')).toEqual({
      ret: { kind: 'code', code: 'abc', flowId: 'f1' },
      search: '?keep=1',
      hash: '#ex=z123',
    });
  });

  it('reads an error from the query or the hash and strips both', () => {
    const q = readAuthReturn(
      '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );
    expect(q).toEqual({
      ret: {
        kind: 'error',
        code: 'otp_expired',
        description: 'Email link is invalid or has expired',
      },
      search: '',
      hash: '',
    });
    // Anyone can write a description into a link, so only a short one is shown.
    const long = readAuthReturn(`?error=x&error_description=${'a'.repeat(500)}`, '').ret;
    expect(long?.kind === 'error' && long.description.length).toBe(160);
    expect(readAuthReturn('', '#error=server_error&error_description=Oops').ret).toEqual({
      kind: 'error',
      code: 'server_error',
      description: 'Oops',
    });
  });

  it('takes an emailed link’s token and hint out of the address', () => {
    expect(
      readAuthReturn('?token_hash=th1&type=email&email_hint=a***%40example.com&keep=1', ''),
    ).toEqual({
      ret: { kind: 'token', tokenHash: 'th1', type: 'email', emailHint: 'a***@example.com' },
      search: '?keep=1',
      hash: '',
    });
    // Only a token return loses a "type" in the query.
    expect(readAuthReturn('?code=c&type=x', '').search).toBe('?type=x');
    const long = readAuthReturn(`?token_hash=t&email_hint=${'a'.repeat(500)}`, '').ret;
    expect(long?.kind === 'token' && long.emailHint.length).toBe(120);
  });

  it('tells whether an address fits a link’s hint', () => {
    expect(fitsHint('ann@example.com', 'a***@example.com')).toBe(true);
    expect(fitsHint('Ann@Example.com', 'a***@example.com')).toBe(true);
    expect(fitsHint('ann@example.com', 'an***@example.com')).toBe(true);
    expect(fitsHint('bob@example.com', 'a***@example.com')).toBe(false);
    expect(fitsHint('ann@example.org', 'a***@example.com')).toBe(false);
    expect(fitsHint('ann@example.com', '')).toBe(false);
    expect(fitsHint(null, 'a***@example.com')).toBe(false);
  });

  it('leaves every other address alone', () => {
    for (const [search, hash] of [
      ['', ''],
      ['', '#ex=zABC&embed=1'],
      ['', '#saved=00000000-0000-4000-8000-000000000001'],
      ['?utm=x', '#lesson=idea'],
    ] as const) {
      expect(readAuthReturn(search, hash)).toEqual({ ret: null, search, hash });
    }
  });

  it('puts the page and its hash back once, if fresh and on this site', () => {
    stashReturn('/stack-array/', '#ex=z1');
    expect(takeStash()).toEqual({ path: '/stack-array/', hash: '#ex=z1' });
    expect(takeStash()).toBeNull();

    stashReturn('/bst/', '');
    expect(takeStash(Date.now() + 2 * 60 * 60 * 1000)).toBeNull();

    sessionStorage.setItem(
      'stepwise:auth-return',
      JSON.stringify({ path: '//evil.example', hash: '', at: Date.now() }),
    );
    expect(takeStash()).toBeNull();
    sessionStorage.setItem('stepwise:auth-return', '{not json');
    expect(takeStash()).toBeNull();
  });
});

/** The Supabase adapter against a pretend server: which requests it makes, and what it does. */
describe('Supabase adapter (no network)', () => {
  const URL_ = 'https://auth.example.test';
  const userId = '0000000a-0000-4000-8000-000000000000';
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: userId, exp: 4102444800, role: 'authenticated' })}.c2ln`;
  const user = { id: userId, email: 'a@example.com', aud: 'authenticated', role: 'authenticated' };

  interface Seen {
    method: string;
    url: URL;
    headers: Headers;
    body: unknown;
  }

  function setup(answer: (req: Seen) => { status?: number; body?: unknown } | 'network') {
    const seen: Seen[] = [];
    const fetchMock = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const req: Seen = {
        method: init.method ?? 'GET',
        url: new URL(String(input instanceof Request ? input.url : input)),
        headers: new Headers(init.headers),
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      seen.push(req);
      const a = answer(req);
      if (a === 'network') throw new TypeError('fetch failed');
      return new Response(a.body === undefined ? null : JSON.stringify(a.body), {
        status: a.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    const storage = memoryStorage();
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        access_token: jwt,
        refresh_token: 'refresh',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 4102444800,
        user,
      }),
    );
    const backend = createSupabaseBackend(
      { url: URL_, anonKey: 'anon' },
      { fetch: fetchMock, storage },
    );
    return { backend, seen, storage };
  }

  const ok = (req: Seen) => {
    const path = req.url.pathname;
    if (path === '/auth/v1/user') return { body: user };
    if (path === '/rest/v1/rpc/ensure_profile') return { status: 204 };
    if (path === '/rest/v1/saved_examples') return { body: [] };
    if (path === '/rest/v1/rpc/shared_example')
      return { body: { viz: 'bst', title: 'T', notes: '', example: { format: 1 } } };
    if (path === '/auth/v1/otp') return { body: {} };
    return { status: 404, body: { message: 'not mocked' } };
  };

  it('checks a stored session, and makes sure of the HintWise profile once', async () => {
    const { backend, seen } = setup(ok);
    expect(await backend.currentUser()).toEqual({ id: userId, email: 'a@example.com' });
    await vi.waitFor(() =>
      expect(seen.some((r) => r.url.pathname === '/rest/v1/rpc/ensure_profile')).toBe(true),
    );
    const profile = seen.find((r) => r.url.pathname === '/rest/v1/rpc/ensure_profile')!;
    expect(profile.method).toBe('POST');
    expect(profile.headers.get('content-profile')).toBe('platform');
    await vi.waitFor(() =>
      expect(localStorage.getItem('stepwise:account-profiles')).toContain(userId),
    );
    await backend.currentUser();
    expect(seen.filter((r) => r.url.pathname === '/rest/v1/rpc/ensure_profile')).toHaveLength(1);
  });

  it('asks for this reader’s rows of this page, in the app_stepwise schema', async () => {
    const { backend, seen } = setup(ok);
    await backend.listExamples('bst');
    const list = seen.find((r) => r.url.pathname === '/rest/v1/saved_examples')!;
    expect(list.method).toBe('GET');
    expect(list.url.searchParams.get('owner')).toBe(`eq.${userId}`);
    expect(list.url.searchParams.get('viz')).toBe('eq.bst');
    expect(list.headers.get('accept-profile')).toBe('app_stepwise');
    expect(list.headers.get('authorization')).toBe(`Bearer ${jwt}`);
  });

  it('reads a shared example through the function, signed out too', async () => {
    const { backend, seen, storage } = setup(ok);
    storage.removeItem(SESSION_KEY);
    expect(await backend.readSharedExample('00000000-0000-4000-8000-000000000001')).toEqual({
      viz: 'bst',
      title: 'T',
      notes: '',
      example: { format: 1 },
    });
    const rpc = seen.find((r) => r.url.pathname === '/rest/v1/rpc/shared_example')!;
    expect(rpc.method).toBe('POST');
    expect(rpc.body).toEqual({ p_id: '00000000-0000-4000-8000-000000000001' });
    expect(rpc.headers.get('content-profile')).toBe('app_stepwise');
    // Not an id: no request at all.
    const before = seen.length;
    expect(await backend.readSharedExample('nope')).toBeNull();
    expect(seen.length).toBe(before);
  });

  const LINK = '/functions/v1/sign-in-link';

  it('asks the sign-in-link service for a magic link that comes back to the page', async () => {
    const { backend, seen } = setup((req) =>
      req.url.pathname === LINK ? { body: { status: 'sent' } } : ok(req),
    );
    expect(
      await backend.sendSignInLink('a@example.com', 'https://stepwise.example.test/bst/'),
    ).toEqual({ status: 'sent' });
    const sent = seen.find((r) => r.url.pathname === LINK)!;
    expect(sent.method).toBe('POST');
    expect(sent.url.origin).toBe(URL_);
    expect(sent.headers.get('apikey')).toBe('anon');
    expect(sent.headers.get('content-type')).toBe('application/json');
    const id = localStorage.getItem('hintwise.browserId');
    expect(id).toMatch(/^[\w-]{8,100}$/);
    expect(sent.body).toEqual({
      email: 'a@example.com',
      redirectTo: 'https://stepwise.example.test/bst/',
      app: 'stepwise',
      browserId: id,
    });
    // Supabase's own magic links are not used.
    expect(seen.some((r) => r.url.pathname === '/auth/v1/otp')).toBe(false);
    // The same browser id every time, and a check's token when there is one.
    await backend.sendSignInLink('a@example.com', 'https://stepwise.example.test/', 'tok-1');
    const again = seen.filter((r) => r.url.pathname === LINK)[1]!;
    expect(again.body).toMatchObject({ browserId: id, turnstileToken: 'tok-1' });
  });

  it('passes on the service’s answers: wait, a check, or its own message', async () => {
    const answers: { status: number; body?: unknown }[] = [
      { status: 429, body: { status: 'wait', retryAt: '2026-11-10T18:42:00.000Z' } },
      { status: 403, body: { status: 'challenge', siteKey: 'site-key' } },
      { status: 403, body: { status: 'challenge', siteKey: 'site-key', failed: true } },
      { status: 503, body: { status: 'error', message: 'Email sign-in is paused; try Google' } },
      {
        status: 400,
        body: { status: 'error', message: 'That email address does not look right.' },
      },
      { status: 500 },
      { status: 429 },
    ];
    const { backend } = setup((req) => (req.url.pathname === LINK ? answers.shift()! : ok(req)));
    const send = () => backend.sendSignInLink('a@example.com', 'https://x.test/');
    expect(await send()).toEqual({ status: 'wait', retryAt: '2026-11-10T18:42:00.000Z' });
    expect(await send()).toEqual({ status: 'challenge', siteKey: 'site-key', failed: false });
    expect(await send()).toEqual({ status: 'challenge', siteKey: 'site-key', failed: true });
    await expect(send()).rejects.toThrow('Email sign-in is paused; try Google');
    await expect(send()).rejects.toThrow('That email address does not look right.');
    await expect(send()).rejects.toThrow(MESSAGES.unreachable);
    // A wait with no time: a minute from now.
    const wait = await send();
    expect(wait.status).toBe('wait');
    const left = Date.parse((wait as { retryAt: string }).retryAt) - Date.now();
    expect(left).toBeGreaterThan(50_000);
    expect(left).toBeLessThanOrEqual(60_000);
  });

  it('verifies an emailed link’s token, in any browser', async () => {
    const other = { ...user, id: '0000000c-0000-4000-8000-000000000000', email: 'c@example.com' };
    const { backend, seen, storage } = setup((req) =>
      req.url.pathname === '/auth/v1/verify'
        ? {
            body: {
              access_token: jwt,
              refresh_token: 'r2',
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: 4102444800,
              user: other,
            },
          }
        : ok(req),
    );
    storage.removeItem(SESSION_KEY);
    const got = await backend.completeSignIn({
      kind: 'token',
      tokenHash: 'th-1',
      type: 'email',
      emailHint: 'c***@example.com',
    });
    expect(got).toEqual({ id: other.id, email: 'c@example.com' });
    const verify = seen.find((r) => r.url.pathname === '/auth/v1/verify')!;
    expect(verify.method).toBe('POST');
    expect(verify.body).toMatchObject({ token_hash: 'th-1', type: 'email' });
    expect(storage.getItem(SESSION_KEY)).toContain('r2');
  });

  it('reads and writes the preferences row by compare and swap', async () => {
    const row = {
      prefs: { theme: { value: 'dark', at: '2026-11-10T09:00:00.000Z' } },
      progress: { version: 1, pages: {} },
      last_release: '2026-11-09-wave-8',
      notify_new_pages: true,
      updated_at: '2026-11-10T09:00:00.123456+00:00',
    };
    let patched = true;
    const { backend, seen } = setup((req) => {
      if (req.url.pathname !== '/rest/v1/preferences') return ok(req);
      // maybeSingle takes an array and returns its one row, or null for none.
      if (req.method === 'GET') return { body: [row] };
      if (req.method === 'POST')
        return { status: 409, body: { code: '23505', message: 'duplicate key' } };
      if (req.method === 'PATCH')
        return { body: patched ? [{ ...row, updated_at: '2026-11-10T09:00:01.5+00:00' }] : [] };
      return { status: 405 };
    });
    expect(await backend.readPreferences()).toEqual({
      prefs: row.prefs,
      progress: row.progress,
      lastRelease: '2026-11-09-wave-8',
      notifyNewPages: true,
      updatedAt: row.updated_at,
    });
    const get = seen.find((r) => r.url.pathname === '/rest/v1/preferences')!;
    expect(get.url.searchParams.get('owner')).toBe(`eq.${userId}`);
    expect(get.headers.get('accept-profile')).toBe('app_stepwise');

    const fields = {
      prefs: {},
      progress: { version: 1, pages: {} },
      lastRelease: null,
      notifyNewPages: false,
    };
    // An update names the copy it was merged from.
    expect((await backend.writePreferences(fields, row.updated_at))?.updatedAt).toBe(
      '2026-11-10T09:00:01.5+00:00',
    );
    const patch = seen.find((r) => r.method === 'PATCH')!;
    expect(patch.url.searchParams.get('owner')).toBe(`eq.${userId}`);
    expect(patch.url.searchParams.get('updated_at')).toBe(`eq.${row.updated_at}`);
    expect(patch.body).toEqual({
      prefs: {},
      progress: { version: 1, pages: {} },
      last_release: null,
      notify_new_pages: false,
    });
    // Changed meanwhile: nothing matched, so null (read again).
    patched = false;
    expect(await backend.writePreferences(fields, row.updated_at)).toBeNull();
    // A first row that another tab made first: null too.
    expect(await backend.writePreferences(fields, null)).toBeNull();
    const post = seen.find(
      (r) => r.method === 'POST' && r.url.pathname === '/rest/v1/preferences',
    )!;
    expect(post.body).toMatchObject({ owner: userId, notify_new_pages: false });
  });

  it('deletes my data through delete_my_data, or table by table without it', async () => {
    const { backend, seen } = setup((req) =>
      req.url.pathname === '/rest/v1/rpc/delete_my_data' ? { body: { preferences: 1 } } : ok(req),
    );
    await backend.deleteMyData();
    const rpc = seen.find((r) => r.url.pathname === '/rest/v1/rpc/delete_my_data')!;
    expect(rpc.method).toBe('POST');
    expect(rpc.headers.get('content-profile')).toBe('app_stepwise');

    // A database without 0002: no function, no preferences table; the examples still go.
    const old = setup((req) => {
      if (req.url.pathname === '/rest/v1/rpc/delete_my_data')
        return { status: 404, body: { code: 'PGRST202', message: 'Could not find the function' } };
      if (req.url.pathname === '/rest/v1/preferences')
        return { status: 404, body: { code: 'PGRST205', message: 'Could not find the table' } };
      if (req.url.pathname === '/rest/v1/saved_examples') return { status: 204 };
      return ok(req);
    });
    await old.backend.deleteMyData();
    const deletes = old.seen.filter((r) => r.method === 'DELETE');
    expect(deletes.map((r) => r.url.pathname)).toEqual([
      '/rest/v1/preferences',
      '/rest/v1/saved_examples',
    ]);
    for (const d of deletes) expect(d.url.searchParams.get('owner')).toBe(`eq.${userId}`);
  });

  it('fails softly with no network', async () => {
    const { backend } = setup(() => 'network');
    await expect(backend.listExamples('bst')).rejects.toThrow(MESSAGES.unreachable);
    await expect(backend.readSharedExample('00000000-0000-4000-8000-000000000001')).rejects.toThrow(
      MESSAGES.unreachable,
    );
    await expect(backend.sendSignInLink('a@example.com', 'https://x.test/')).rejects.toThrow(
      MESSAGES.unreachable,
    );
    // The stored session still counts: the reader stays signed in while the server is away.
    expect(await backend.currentUser()).toEqual({ id: userId, email: 'a@example.com' });
  });

  it('signs out only here, even when the server cannot be told', async () => {
    const { backend, seen, storage } = setup(() => 'network');
    await backend.signOut();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
    const logout = seen.find((r) => r.url.pathname === '/auth/v1/logout');
    expect(logout?.url.searchParams.get('scope')).toBe('local');
  });
});
