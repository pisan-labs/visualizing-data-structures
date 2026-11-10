import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect, useBackendForTests } from '../account/account.svelte';
import { AccountError, MESSAGES } from '../account/backend';
import { SESSION_KEY } from '../account/config';
import { createFakeBackend, type FakeBackend } from '../account/fake';
import {
  LIST_MESSAGES,
  listError,
  listTitle,
  MAX_LIST_ITEMS,
  MAX_LISTS,
  toPlayList,
} from '../account/lists';
import { createSupabaseBackend } from '../account/supabase';
import { listHref, listsHref, parseLocation, vizHref } from '../ui/route';
import { forgetPlayList, itemHref, ListPlay, openPlayList } from './player.svelte';
import { ListShelf } from './shelf.svelte';

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
});

const ex = (viz: string, ops: unknown[] = []) => ({ format: 1, viz, settings: {}, seed: 1, ops });
const ID = '00000000-0000-4000-8000-0000000000aa';

describe('addresses', () => {
  it('reads My lesson lists and a list link on the home page', () => {
    expect(parseLocation('/', '#lists')).toEqual({ kind: 'lists', key: '/#lists' });
    expect(parseLocation('/', `#list=${ID}`)).toEqual({
      kind: 'list',
      id: ID,
      key: `/#list=${ID}`,
    });
    expect(listsHref).toBe('/#lists');
    expect(listHref(ID)).toBe(`/#list=${ID}`);
    expect(parseLocation('/', listHref(ID).slice(1))).toMatchObject({ kind: 'list', id: ID });
  });

  it('reads and writes a list playing on a page', () => {
    const r = parseLocation('/bst/', `#ex=zabc&list=${ID}&item=3`);
    expect(r).toMatchObject({ kind: 'viz', id: 'bst', code: 'zabc', list: ID, item: 3 });
    expect(parseLocation('/bst/', `#list=${ID}`)).toMatchObject({ list: ID, item: 1 });
    for (const bad of ['0', '-2', 'x', '1.5e9x']) {
      expect(parseLocation('/bst/', `#list=${ID}&item=${bad}`)).toMatchObject({ item: 1 });
    }
    expect(parseLocation('/bst/', `#list=${ID}&item=2.7`)).toMatchObject({ item: 2 });
    expect(vizHref('bst', { list: ID, item: 2 })).toBe(`/bst/#list=${ID}&item=2`);
    expect(vizHref('bst', { ex: 'zabc', list: ID, item: 2 })).toBe(
      `/bst/#ex=zabc&list=${ID}&item=2`,
    );
    expect(vizHref('bst', { ex: 'zabc', list: null, item: 2 })).toBe('/bst/#ex=zabc');
  });

  it('leaves every other address as it was', () => {
    expect(parseLocation('/', '')).toEqual({ kind: 'catalog' });
    expect(parseLocation('/', '#main')).toEqual({ kind: 'catalog' });
    expect(parseLocation('/', '#/stack-array?ex=z1')).toEqual({
      kind: 'legacy',
      target: '/stack-array/#ex=z1',
    });
    expect(parseLocation('/stack-array/', '#lesson=the-idea&saved=abc')).toMatchObject({
      kind: 'viz',
      lesson: 'the-idea',
      saved: 'abc',
      list: null,
      item: 1,
    });
    expect(vizHref('stack-array', { ex: 'z1', embed: true, theme: 'dark' })).toBe(
      '/stack-array/#ex=z1&embed=1&theme=dark',
    );
    expect(vizHref('stack-array')).toBe('/stack-array/');
  });
});

describe('list errors', () => {
  it('turns the database’s list errors into plain words', () => {
    expect(listError({ message: 'lesson_lists_limit: an account holds at most 200' })).toEqual(
      new AccountError('full', LIST_MESSAGES.lists),
    );
    expect(listError({ message: 'lesson_list_items_limit: ...' })?.message).toBe(
      LIST_MESSAGES.items,
    );
    expect(listError({ message: 'lesson_list_order: ...' })?.message).toBe(LIST_MESSAGES.order);
    expect(listError({ message: 'lesson_list_missing: ...' })?.kind).toBe('missing');
    expect(listError({ message: 'saved_examples_limit' })).toBeNull();
    expect(listError('nothing')).toBeNull();
    expect(LIST_MESSAGES.lists).toContain(String(MAX_LISTS));
    expect(LIST_MESSAGES.items).toContain(String(MAX_LIST_ITEMS));
  });

  it('keeps names within the limit and never empty', () => {
    expect(listTitle('  Week 3  ')).toBe('Week 3');
    expect(listTitle('   ')).toBe('Untitled list');
    expect(listTitle('x'.repeat(300))).toHaveLength(200);
  });

  it('drops what is not a list item from a list it reads', () => {
    expect(toPlayList(null)).toBeNull();
    expect(toPlayList([])).toBeNull();
    expect(
      toPlayList({
        title: 'T',
        notes: 7,
        items: [
          { viz: 'bst', title: 'A', notes: '', example: { format: 1 }, note: 'n' },
          { title: 'no page' },
          null,
          'x',
          { viz: 'stack-array' },
        ],
      }),
    ).toEqual({
      title: 'T',
      notes: '',
      items: [
        { viz: 'bst', title: 'A', notes: '', example: { format: 1 }, note: 'n' },
        { viz: 'stack-array', title: '', notes: '', example: undefined, note: '' },
      ],
    });
  });
});

describe('lesson lists (fake backend)', () => {
  let fake: FakeBackend;
  beforeEach(() => {
    fake = createFakeBackend();
    useBackendForTests(fake);
  });
  afterEach(() => useBackendForTests(null));

  async function examples(...vizzes: string[]) {
    const out = [];
    for (const [i, viz] of vizzes.entries())
      out.push(await fake.createExample({ viz, title: `${viz} ${i + 1}`, example: ex(viz) }));
    return out;
  }

  it('makes, fills, reorders, renames, shares and deletes a list', async () => {
    fake.signInAs('a@example.com');
    const [a, b, c] = await examples('stack-array', 'bst', 'queue-array');
    const shelf = new ListShelf(() => connect());
    await shelf.refresh();
    expect(shelf.lists).toEqual([]);

    const week = await shelf.create('  Week 1  ');
    expect(week.title).toBe('Week 1');
    expect(shelf.lists.map((l) => l.title)).toEqual(['Week 1']);
    for (const e of [a!, b!, c!]) await shelf.add(week.id, e.id);
    expect(shelf.lists[0]?.count).toBe(3);

    const open = await shelf.load(week.id);
    expect(open.items.map((i) => i.viz)).toEqual(['stack-array', 'bst', 'queue-array']);
    expect(open.items[1]).toMatchObject({ exampleId: b!.id, title: 'bst 2', note: '' });

    // Moving by one place, both ways, and nothing past either end.
    await shelf.move(week.id, open.items[2]!.id, -1);
    expect(shelf.open[week.id]?.items.map((i) => i.viz)).toEqual([
      'stack-array',
      'queue-array',
      'bst',
    ]);
    await shelf.move(week.id, open.items[0]!.id, 1);
    await shelf.move(week.id, open.items[1]!.id, 1);
    expect(shelf.open[week.id]?.items.map((i) => i.viz)).toEqual([
      'queue-array',
      'stack-array',
      'bst',
    ]);
    // The server keeps that order.
    expect((await fake.readLessonList(week.id)).items.map((i) => i.viz)).toEqual([
      'queue-array',
      'stack-array',
      'bst',
    ]);

    await shelf.setNote(week.id, open.items[0]!.id, 'Ask what comes out first');
    await shelf.change(week.id, { title: 'Week one', notes: 'Stacks and queues', shared: true });
    expect(shelf.lists[0]).toMatchObject({ title: 'Week one', notes: 'Stacks and queues' });
    expect(shelf.open[week.id]).toMatchObject({ title: 'Week one', shared: true });

    // Anyone with the link plays it, in order, with the notes; nothing about who owns it.
    const shared = await fake.readSharedLessonList(week.id);
    expect(shared).toEqual({
      title: 'Week one',
      notes: 'Stacks and queues',
      items: [
        {
          viz: 'queue-array',
          title: 'queue-array 3',
          notes: '',
          example: ex('queue-array'),
          note: '',
        },
        {
          viz: 'stack-array',
          title: 'stack-array 1',
          notes: '',
          example: ex('stack-array'),
          note: 'Ask what comes out first',
        },
        { viz: 'bst', title: 'bst 2', notes: '', example: ex('bst'), note: '' },
      ],
    });

    await shelf.removeItem(week.id, open.items[1]!.id);
    expect(shelf.open[week.id]?.items).toHaveLength(2);
    expect(shelf.lists[0]?.count).toBe(2);

    await shelf.remove(week.id);
    expect(shelf.lists).toEqual([]);
    expect(await fake.readSharedLessonList(week.id)).toBeNull();
    expect(fake.lessonLists.items).toEqual([]);
    // Its examples are still in the account.
    expect(fake.rows).toHaveLength(3);
  });

  it('keeps each account’s lists to itself', async () => {
    const userA = fake.signInAs('a@example.com');
    const [a] = await examples('stack-array');
    const list = await fake.createLessonList({ title: 'A list' });
    await fake.addToLessonList(list.id, a!.id);

    fake.signInAs('b@example.com');
    const [b] = await examples('bst');
    expect(await fake.listLessonLists()).toEqual([]);
    await expect(fake.readLessonList(list.id)).rejects.toThrow(LIST_MESSAGES.missing);
    await expect(fake.updateLessonList(list.id, { title: 'taken' })).rejects.toThrow(
      LIST_MESSAGES.missing,
    );
    await expect(fake.deleteLessonList(list.id)).rejects.toThrow(LIST_MESSAGES.missing);
    await expect(fake.addToLessonList(list.id, b!.id)).rejects.toThrow(LIST_MESSAGES.missing);
    const item = fake.lessonLists.items[0]!;
    await expect(fake.setLessonListItemNote(item.id, 'x')).rejects.toThrow();
    await expect(fake.removeLessonListItem(item.id)).rejects.toThrow();
    await expect(fake.reorderLessonList(list.id, [item.id])).rejects.toThrow();
    // B cannot put A's example in his own list.
    const mine = await fake.createLessonList({ title: 'B list' });
    await expect(fake.addToLessonList(mine.id, a!.id)).rejects.toThrow(LIST_MESSAGES.exampleGone);
    // Private: not by its link, and not as B's own.
    expect(await fake.readSharedLessonList(list.id)).toBeNull();
    expect(await fake.readOwnPlayList(list.id)).toBeNull();

    fake.signInAs(userA.email!);
    expect((await fake.readLessonList(list.id)).items).toHaveLength(1);
    expect(await fake.readOwnPlayList(list.id)).toMatchObject({ title: 'A list' });
  });

  it('takes a deleted example out of every list', async () => {
    fake.signInAs('a@example.com');
    const [a, b] = await examples('stack-array', 'bst');
    const one = await fake.createLessonList({ title: 'One' });
    const two = await fake.createLessonList({ title: 'Two' });
    await fake.addToLessonList(one.id, a!.id);
    await fake.addToLessonList(one.id, b!.id);
    await fake.addToLessonList(two.id, a!.id);
    await fake.deleteExample(a!.id);
    expect((await fake.readLessonList(one.id)).items.map((i) => i.viz)).toEqual(['bst']);
    expect((await fake.listLessonLists()).map((l) => [l.title, l.count])).toEqual([
      ['Two', 0],
      ['One', 1],
    ]);
    await expect(fake.addToLessonList(two.id, a!.id)).rejects.toThrow(LIST_MESSAGES.exampleGone);
  });

  it('refuses too many lists, too many items, long fields and a wrong order', async () => {
    fake.signInAs('a@example.com');
    const [a] = await examples('stack-array');
    await expect(fake.createLessonList({ title: 'x'.repeat(201) })).rejects.toThrow();
    const list = await fake.createLessonList({ title: 'Full' });
    for (let i = 0; i < MAX_LIST_ITEMS; i++) await fake.addToLessonList(list.id, a!.id);
    await expect(fake.addToLessonList(list.id, a!.id)).rejects.toThrow(LIST_MESSAGES.items);
    const items = (await fake.readLessonList(list.id)).items.map((i) => i.id);
    await expect(fake.reorderLessonList(list.id, items.slice(1))).rejects.toThrow(
      LIST_MESSAGES.order,
    );
    await expect(
      fake.reorderLessonList(list.id, [items[0]!, items[0]!, ...items.slice(2)]),
    ).rejects.toThrow(LIST_MESSAGES.order);
    await expect(fake.setLessonListItemNote(items[0]!, 'n'.repeat(2001))).rejects.toThrow();
    for (let i = 1; i < MAX_LISTS; i++) await fake.createLessonList({ title: `n${i}` });
    await expect(fake.createLessonList({ title: 'one too many' })).rejects.toThrow(
      LIST_MESSAGES.lists,
    );
  });

  it('shows a list changed elsewhere as it is now, and drops one deleted elsewhere', async () => {
    fake.signInAs('a@example.com');
    const [a, b] = await examples('stack-array', 'bst');
    const shelf = new ListShelf(() => connect());
    const list = await shelf.create('Week');
    await shelf.add(list.id, a!.id);
    await shelf.add(list.id, b!.id);
    const open = await shelf.load(list.id);
    // Another tab takes the second one out.
    await fake.removeLessonListItem(open.items[1]!.id);
    await expect(shelf.move(list.id, open.items[0]!.id, 1)).rejects.toThrow(LIST_MESSAGES.order);
    expect(shelf.open[list.id]?.items.map((i) => i.viz)).toEqual(['stack-array']);
    // Another tab deletes the list.
    await fake.deleteLessonList(list.id);
    await expect(shelf.change(list.id, { title: 'gone' })).rejects.toThrow(LIST_MESSAGES.missing);
    expect(shelf.lists).toEqual([]);
    expect(shelf.open[list.id]).toBeUndefined();
  });

  it('loads the lists once for the pickers, and again after a failure', async () => {
    fake.signInAs('a@example.com');
    await fake.createLessonList({ title: 'One' });
    const spy = vi.spyOn(fake, 'listLessonLists');
    const shelf = new ListShelf(() => connect());
    fake.failWith = 'unreachable';
    await Promise.all([shelf.ensure(), shelf.ensure()]);
    expect(shelf.status).toBe('error');
    expect(shelf.problem).toBe(MESSAGES.unreachable);
    fake.failWith = null;
    await shelf.ensure();
    await shelf.ensure();
    expect(shelf.lists.map((l) => l.title)).toEqual(['One']);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('playing a list', () => {
  let fake: FakeBackend;
  beforeEach(() => {
    fake = createFakeBackend();
    useBackendForTests(fake);
  });
  afterEach(() => useBackendForTests(null));

  async function aList(shared: boolean) {
    fake.signInAs('a@example.com');
    const one = await fake.createExample({
      viz: 'stack-array',
      title: 'One',
      example: ex('stack-array'),
    });
    const two = await fake.createExample({ viz: 'bst', title: 'Two', example: ex('bst') });
    const list = await fake.createLessonList({ title: 'Class' });
    await fake.addToLessonList(list.id, one.id, 'first');
    await fake.addToLessonList(list.id, two.id);
    if (shared) await fake.updateLessonList(list.id, { shared: true });
    return list.id;
  }

  it('plays a shared list signed out, and the owner’s own private one', async () => {
    const shared = await aList(true);
    const own = await aList(false);
    await fake.signOut();
    const list = await openPlayList(shared, true);
    expect(list.items.map((i) => [i.viz, i.title, i.note])).toEqual([
      ['stack-array', 'One', 'first'],
      ['bst', 'Two', ''],
    ]);
    expect(itemHref(shared, list, 2)).toBe(`/bst/#list=${shared}&item=2`);
    await expect(openPlayList(own, true)).rejects.toThrow(LIST_MESSAGES.notAvailable);
    fake.signInAs('a@example.com');
    expect((await openPlayList(own, true)).title).toBe('Class');
  });

  it('says plainly when a list is private, missing or deleted', async () => {
    const id = await aList(true);
    fake.signInAs('b@example.com');
    await openPlayList(id, true);
    fake.signInAs('a@example.com');
    await fake.updateLessonList(id, { shared: false });
    fake.signInAs('b@example.com');
    // Moving through a list asks once; the list's link asks again.
    expect((await openPlayList(id)).title).toBe('Class');
    await expect(openPlayList(id, true)).rejects.toThrow(LIST_MESSAGES.notAvailable);
    await expect(openPlayList('ffffffff-0000-4000-8000-000000000000')).rejects.toThrow(
      LIST_MESSAGES.notAvailable,
    );
    await expect(openPlayList('not-an-id')).rejects.toThrow(LIST_MESSAGES.notAvailable);
    fake.failWith = 'unreachable';
    forgetPlayList(id);
    await expect(openPlayList(id)).rejects.toThrow(MESSAGES.unreachable);
  });

  it('stays within a list that shrank since its link was made', async () => {
    const id = await aList(true);
    const play = new ListPlay(id, 7);
    expect(play.status).toBe('loading');
    await play.load();
    expect(play.status).toBe('ready');
    expect([play.n, play.total, play.item?.title]).toEqual([2, 2, 'Two']);
    const bad = new ListPlay('ffffffff-0000-4000-8000-000000000000', 1);
    expect(await bad.load()).toBeNull();
    expect(bad.status).toBe('error');
    expect(bad.problem).toBe(LIST_MESSAGES.notAvailable);
    expect(new ListPlay(id, -3).n).toBe(1);
  });

  it('says so when accounts are off', async () => {
    useBackendForTests(null);
    await expect(openPlayList(ID)).rejects.toThrow(LIST_MESSAGES.off);
  });
});

describe('Supabase adapter for lists (no network)', () => {
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

  function setup(
    answer: (req: Seen) => { status?: number; body?: unknown } | 'network',
    signedIn = true,
  ) {
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
    if (signedIn)
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
    return { backend, seen };
  }

  const at = '2026-11-10T09:00:00Z';
  const listRow = { id: ID, title: 'L', notes: '', shared: false, created_at: at, updated_at: at };
  const ok = (req: Seen) => {
    const path = req.url.pathname;
    if (path === '/rest/v1/lesson_lists' && req.method === 'GET')
      return {
        body: [
          {
            ...listRow,
            items: [
              {
                id: 'i1',
                note: 'n',
                example_id: 'e1',
                example: { viz: 'bst', title: 'T', notes: 'x', example: { format: 1 } },
              },
            ],
          },
        ],
      };
    if (path === '/rest/v1/lesson_lists' && req.method === 'POST')
      return { status: 201, body: listRow };
    if (path === '/rest/v1/lesson_list_items' && req.method === 'POST')
      return {
        status: 201,
        body: { id: 'i2', note: '', example_id: 'e2', example: { viz: 'bst', title: 'T2' } },
      };
    if (path === '/rest/v1/rpc/reorder_lesson_list') return { status: 204 };
    if (path === '/rest/v1/rpc/shared_lesson_list')
      return {
        body: [
          {
            title: 'S',
            notes: '',
            items: [{ viz: 'bst', title: 'T', notes: '', example: {}, note: '' }],
          },
        ],
      };
    return { status: 404, body: { message: 'not mocked' } };
  };

  it('lists, reads and changes the reader’s own lists in the app_stepwise schema', async () => {
    const { backend, seen } = setup(ok);
    const lists = await backend.listLessonLists();
    expect(lists).toEqual([
      { id: ID, title: 'L', notes: '', shared: false, count: 1, createdAt: at, updatedAt: at },
    ]);
    const get = seen.find((r) => r.url.pathname === '/rest/v1/lesson_lists')!;
    expect(get.url.searchParams.get('owner')).toBe(`eq.${userId}`);
    expect(get.url.searchParams.get('order')).toBe('updated_at.desc');
    expect(get.url.searchParams.get('select')).toContain('items:lesson_list_items(id)');
    expect(get.headers.get('accept-profile')).toBe('app_stepwise');

    const list = await backend.readLessonList(ID);
    expect(list.items).toEqual([{ id: 'i1', exampleId: 'e1', viz: 'bst', title: 'T', note: 'n' }]);
    const read = seen.at(-1)!;
    expect(read.url.searchParams.get('id')).toBe(`eq.${ID}`);
    expect(read.url.searchParams.get('items.order')).toBe('position.asc');

    await backend.createLessonList({ title: 'New' });
    expect(seen.at(-1)).toMatchObject({ method: 'POST', body: { title: 'New', notes: '' } });
    const added = await backend.addToLessonList(ID, '00000000-0000-4000-8000-000000000002', 'hi');
    expect(added).toEqual({ id: 'i2', exampleId: 'e2', viz: 'bst', title: 'T2', note: '' });
    expect(seen.at(-1)?.body).toEqual({
      list_id: ID,
      example_id: '00000000-0000-4000-8000-000000000002',
      note: 'hi',
    });
    await backend.reorderLessonList(ID, ['a', 'b']);
    expect(seen.at(-1)).toMatchObject({
      method: 'POST',
      body: { p_list: ID, p_items: ['a', 'b'] },
    });
    expect(seen.at(-1)?.url.pathname).toBe('/rest/v1/rpc/reorder_lesson_list');

    expect(await backend.readOwnPlayList(ID)).toEqual({
      title: 'L',
      notes: '',
      items: [{ viz: 'bst', title: 'T', notes: 'x', example: { format: 1 }, note: 'n' }],
    });
  });

  it('reads a shared list through the function, signed out too', async () => {
    const { backend, seen } = setup(ok, false);
    expect(await backend.readSharedLessonList(ID)).toEqual({
      title: 'S',
      notes: '',
      items: [{ viz: 'bst', title: 'T', notes: '', example: {}, note: '' }],
    });
    const rpc = seen.find((r) => r.url.pathname === '/rest/v1/rpc/shared_lesson_list')!;
    expect(rpc.body).toEqual({ p_id: ID });
    expect(rpc.headers.get('content-profile')).toBe('app_stepwise');
    // Signed out, the tables are never asked; not an id, nothing is asked at all.
    const before = seen.length;
    expect(await backend.readOwnPlayList(ID)).toBeNull();
    expect(await backend.readSharedLessonList('nope')).toBeNull();
    expect(seen.length).toBe(before);
    await expect(backend.listLessonLists()).rejects.toThrow(MESSAGES.expired);
  });

  it('says plainly when a list is full, gone or unreachable', async () => {
    const full = setup((req) =>
      req.url.pathname === '/rest/v1/lesson_list_items'
        ? {
            status: 400,
            body: {
              code: 'P0001',
              message: 'lesson_list_items_limit: a lesson list holds at most 100 examples',
            },
          }
        : ok(req),
    );
    await expect(
      full.backend.addToLessonList(ID, '00000000-0000-4000-8000-000000000002'),
    ).rejects.toThrow(LIST_MESSAGES.items);

    const refused = setup((req) =>
      req.url.pathname === '/rest/v1/lesson_list_items'
        ? { status: 403, body: { code: '42501', message: 'new row violates row-level security' } }
        : ok(req),
    );
    await expect(
      refused.backend.addToLessonList(ID, '00000000-0000-4000-8000-000000000002'),
    ).rejects.toThrow(LIST_MESSAGES.exampleGone);

    const gone = setup((req) =>
      req.url.pathname === '/rest/v1/lesson_lists' ? { body: [] } : ok(req),
    );
    await expect(gone.backend.readLessonList(ID)).rejects.toThrow(LIST_MESSAGES.missing);
    await expect(gone.backend.deleteLessonList(ID)).rejects.toThrow(LIST_MESSAGES.missing);

    const down = setup(() => 'network');
    await expect(down.backend.listLessonLists()).rejects.toThrow(MESSAGES.unreachable);
    await expect(down.backend.readSharedLessonList(ID)).rejects.toThrow(MESSAGES.unreachable);
  });
});
