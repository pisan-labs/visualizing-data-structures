import type { Request } from '@playwright/test';
import { USER, type Mock } from './supabase-mock';

/**
 * Lesson lists in the pretend Supabase (./supabase-mock.ts): the two tables as row-level
 * security leaves them for the signed-in reader, and the two functions, enough for the requests
 * src/account/lists-supabase.ts sends. Items whose example was deleted are gone, as the
 * database's cascade does.
 */

export interface ListRow {
  id: string;
  owner: string;
  title: string;
  notes: string;
  shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface ItemRow {
  id: string;
  list_id: string;
  example_id: string;
  position: number;
  note: string;
}

let ids = 0;
const at = () => new Date(Date.UTC(2026, 10, 10, 10, 0, ids)).toISOString();

export function listRow(fields: Partial<ListRow> & Pick<ListRow, 'title'>): ListRow {
  const when = at();
  return {
    id: `1a000000-0000-4000-8000-${(++ids).toString(16).padStart(12, '0')}`,
    owner: USER.id,
    notes: '',
    shared: false,
    created_at: when,
    updated_at: when,
    ...fields,
  };
}

export function itemRow(
  fields: Pick<ItemRow, 'list_id' | 'example_id' | 'position'> & Partial<ItemRow>,
): ItemRow {
  return {
    id: `1a100000-0000-4000-8000-${(++ids).toString(16).padStart(12, '0')}`,
    note: '',
    ...fields,
  };
}

type Json = (status: number, data?: unknown) => Promise<void>;

/** Answer a lesson-list request, or return null when it is not one. */
export function answerLists(
  mock: Mock,
  req: Request,
  url: URL,
  body: unknown,
  json: Json,
): Promise<void> | null {
  const path = url.pathname;
  if (
    path !== '/rest/v1/lesson_lists' &&
    path !== '/rest/v1/lesson_list_items' &&
    path !== '/rest/v1/rpc/shared_lesson_list' &&
    path !== '/rest/v1/rpc/reorder_lesson_list'
  )
    return null;

  // The cascade: an item goes with its example and its list.
  mock.items = mock.items.filter(
    (i) =>
      mock.rows.some((r) => r.id === i.example_id) && mock.lists.some((l) => l.id === i.list_id),
  );
  const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
  const eq = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, '');
  const signedIn = (req.headers()['authorization'] ?? '').includes('.');
  const now = new Date().toISOString();
  const itemsOf = (listId: string) =>
    mock.items.filter((i) => i.list_id === listId).sort((a, b) => a.position - b.position);
  const example = (id: string) => mock.rows.find((r) => r.id === id);
  const itemOut = (i: ItemRow) => {
    const e = example(i.example_id)!;
    return {
      id: i.id,
      note: i.note,
      example_id: i.example_id,
      position: i.position,
      example: { viz: e.viz, title: e.title, notes: e.notes, example: e.example },
    };
  };
  const listOut = (l: ListRow) => ({
    id: l.id,
    title: l.title,
    notes: l.notes,
    shared: l.shared,
    created_at: l.created_at,
    updated_at: l.updated_at,
    items: itemsOf(l.id).map(itemOut),
  });
  const touch = (listId: string) => {
    const l = mock.lists.find((x) => x.id === listId);
    if (l) l.updated_at = now;
  };
  const answer = (rows: unknown[]) => (one ? json(200, rows[0]) : json(200, rows));

  if (path === '/rest/v1/rpc/shared_lesson_list') {
    const id = (body as { p_id?: string })?.p_id;
    const l = mock.lists.find((x) => x.id === id && x.shared);
    return json(
      200,
      l
        ? [
            {
              title: l.title,
              notes: l.notes,
              items: itemsOf(l.id).map((i) => {
                const e = example(i.example_id)!;
                return {
                  viz: e.viz,
                  title: e.title,
                  notes: e.notes,
                  example: e.example,
                  note: i.note,
                };
              }),
            },
          ]
        : [],
    );
  }

  // The tables: only for the signed in, and only their own rows.
  if (!signedIn) return json(401, { code: '42501', message: 'permission denied' });
  const mine = mock.lists.filter((l) => l.owner === USER.id);

  if (path === '/rest/v1/rpc/reorder_lesson_list') {
    const { p_list, p_items } = body as { p_list: string; p_items: string[] };
    const list = mine.find((l) => l.id === p_list);
    if (!list)
      return json(400, { code: 'P0001', message: 'lesson_list_missing: no such lesson list' });
    const items = itemsOf(list.id);
    const names = new Set(p_items);
    if (
      names.size !== p_items.length ||
      p_items.length !== items.length ||
      items.some((i) => !names.has(i.id))
    )
      return json(400, {
        code: 'P0001',
        message: 'lesson_list_order: name every item of the list once',
      });
    p_items.forEach((id, n) => (items.find((i) => i.id === id)!.position = n));
    touch(list.id);
    return json(204);
  }

  if (path === '/rest/v1/lesson_lists') {
    if (req.method() === 'GET') {
      const rows = mine
        .filter(
          (l) => (!eq('id') || l.id === eq('id')) && (!eq('owner') || l.owner === eq('owner')),
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map(listOut);
      return answer(rows);
    }
    if (req.method() === 'POST') {
      const input = body as Partial<ListRow>;
      if (mine.length >= 200)
        return json(400, {
          code: 'P0001',
          message: 'lesson_lists_limit: an account holds at most 200',
        });
      const l = listRow({
        title: input.title ?? '',
        notes: input.notes ?? '',
        created_at: now,
        updated_at: now,
      });
      mock.lists.push(l);
      return json(201, one ? listOut(l) : [listOut(l)]);
    }
    const target = mine.find((l) => l.id === eq('id'));
    if (req.method() === 'PATCH') {
      if (!target)
        return json(406, { code: 'PGRST116', message: 'no rows', details: '', hint: null });
      Object.assign(target, body as Partial<ListRow>, { updated_at: now });
      return json(200, one ? listOut(target) : [listOut(target)]);
    }
    if (req.method() === 'DELETE') {
      if (target) mock.lists.splice(mock.lists.indexOf(target), 1);
      mock.items = mock.items.filter((i) => i.list_id !== target?.id);
      return json(200, target ? [{ id: target.id }] : []);
    }
  }

  if (path === '/rest/v1/lesson_list_items') {
    if (req.method() === 'POST') {
      const input = body as { list_id: string; example_id: string; note?: string };
      const list = mine.find((l) => l.id === input.list_id);
      const ex = mock.rows.find((r) => r.id === input.example_id && r.owner === USER.id);
      if (!list || !ex)
        return json(403, { code: '42501', message: 'new row violates row-level security policy' });
      const items = itemsOf(list.id);
      if (items.length >= 100)
        return json(400, {
          code: 'P0001',
          message: 'lesson_list_items_limit: a lesson list holds at most 100 examples',
        });
      const it = itemRow({
        list_id: list.id,
        example_id: ex.id,
        note: input.note ?? '',
        position: items.length ? items.at(-1)!.position + 1 : 0,
      });
      mock.items.push(it);
      touch(list.id);
      return json(201, one ? itemOut(it) : [itemOut(it)]);
    }
    const target = mock.items.find(
      (i) => i.id === eq('id') && mine.some((l) => l.id === i.list_id),
    );
    if (req.method() === 'PATCH') {
      if (!target)
        return json(406, { code: 'PGRST116', message: 'no rows', details: '', hint: null });
      Object.assign(target, { note: (body as { note?: string }).note ?? target.note });
      return json(200, one ? itemOut(target) : [itemOut(target)]);
    }
    if (req.method() === 'DELETE') {
      if (target) {
        mock.items.splice(mock.items.indexOf(target), 1);
        touch(target.list_id);
      }
      return json(200, target ? [{ id: target.id }] : []);
    }
  }
  return json(405, { message: 'method not mocked' });
}
