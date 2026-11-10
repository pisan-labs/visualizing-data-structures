/**
 * Lesson lists on Supabase (supabase/migrations/0003_lesson_lists.sql). Part of the Supabase
 * adapter's chunk: ./supabase.ts spreads these methods into its backend.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AccountError } from './backend';
import { toAccountError } from './errors';
import {
  isListId,
  LIST_MESSAGES,
  listError,
  toPlayList,
  type LessonList,
  type LessonListBackend,
  type LessonListItem,
  type LessonListSummary,
  type PlayList,
} from './lists';

const LIST = 'id, title, notes, shared, created_at, updated_at';
// The items' ids, to count them (an aggregate count needs a PostgREST setting).
const COUNT = `${LIST}, items:lesson_list_items(id)`;
const ITEM = 'id, note, example_id, example:saved_examples(viz, title)';
const PLAY =
  'title, notes, items:lesson_list_items(note, example:saved_examples(viz, title, notes, example))';

interface ListRow {
  id: string;
  title: string;
  notes: string;
  shared: boolean;
  created_at: string;
  updated_at: string;
  items?: { id: string }[] | ItemRow[];
}

interface ItemRow {
  id: string;
  note: string;
  example_id: string;
  example: { viz: string; title: string } | null;
}

const summary = (r: ListRow, count: number): LessonListSummary => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  shared: r.shared,
  count,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const countOf = (r: ListRow): number => (Array.isArray(r.items) ? r.items.length : 0);

const item = (r: ItemRow): LessonListItem => ({
  id: r.id,
  exampleId: r.example_id,
  viz: r.example?.viz ?? '',
  title: r.example?.title ?? '',
  note: r.note,
});

/** A failed list call as an AccountError: the database's own list errors first. */
const fail = (error: unknown, status?: number): AccountError =>
  listError(error) ?? toAccountError(error, status);

export function supabaseLessonLists(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- no generated database types
  client: SupabaseClient<any, 'public', 'app_stepwise'>,
  /** The signed-in reader's id; throws AccountError('expired') when there is none. */
  userId: () => Promise<string>,
): LessonListBackend {
  const lists = () => client.from('lesson_lists');
  const items = () => client.from('lesson_list_items');

  async function guard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (e) {
      throw e instanceof AccountError ? e : fail(e);
    }
  }

  /** A row that is not there (or not this reader's) is "missing", with the list's message. */
  const missing = (error: { code?: string } | null, status: number, message: string) =>
    error?.code === 'PGRST116' || status === 406 ? new AccountError('missing', message) : null;

  return {
    listLessonLists: () =>
      guard(async () => {
        const owner = await userId();
        const { data, error, status } = await lists()
          .select(COUNT)
          .eq('owner', owner)
          .order('updated_at', { ascending: false });
        if (error) throw fail(error, status);
        return (data as ListRow[]).map((r) => summary(r, countOf(r)));
      }),

    readLessonList: (id) =>
      guard(async () => {
        if (!isListId(id)) throw new AccountError('missing', LIST_MESSAGES.missing);
        await userId();
        const { data, error, status } = await lists()
          .select(`${LIST}, items:lesson_list_items(${ITEM})`)
          .eq('id', id)
          .order('position', { referencedTable: 'items', ascending: true })
          .maybeSingle();
        if (error) throw fail(error, status);
        if (!data) throw new AccountError('missing', LIST_MESSAGES.missing);
        const row = data as ListRow;
        const rows = (row.items ?? []) as ItemRow[];
        return { ...summary(row, rows.length), items: rows.map(item) } satisfies LessonList;
      }),

    createLessonList: (input) =>
      guard(async () => {
        await userId();
        const { data, error, status } = await lists()
          .insert({ title: input.title, notes: input.notes ?? '' })
          .select(LIST)
          .single();
        if (error) throw fail(error, status);
        return summary(data as ListRow, 0);
      }),

    updateLessonList: (id, patch) =>
      guard(async () => {
        if (!isListId(id)) throw new AccountError('missing', LIST_MESSAGES.missing);
        await userId();
        const { data, error, status } = await lists()
          .update(patch)
          .eq('id', id)
          .select(COUNT)
          .single();
        if (error) throw missing(error, status, LIST_MESSAGES.missing) ?? fail(error, status);
        return summary(data as ListRow, countOf(data as ListRow));
      }),

    deleteLessonList: (id) =>
      guard(async () => {
        if (!isListId(id)) throw new AccountError('missing', LIST_MESSAGES.missing);
        await userId();
        const { data, error, status } = await lists().delete().eq('id', id).select('id');
        if (error) throw fail(error, status);
        if (!data?.length) throw new AccountError('missing', LIST_MESSAGES.missing);
      }),

    addToLessonList: (listId, exampleId, note = '') =>
      guard(async () => {
        if (!isListId(listId)) throw new AccountError('missing', LIST_MESSAGES.missing);
        if (!isListId(exampleId)) throw new AccountError('missing', LIST_MESSAGES.exampleGone);
        await userId();
        const { data, error, status } = await items()
          .insert({ list_id: listId, example_id: exampleId, note })
          .select(ITEM)
          .single();
        if (error) {
          // Row-level security refuses an item whose list or example is not (or no longer)
          // the reader's; a deleted example fails its foreign key.
          const code = (error as { code?: string }).code;
          if (code === '23503' || code === '42501')
            throw new AccountError('missing', LIST_MESSAGES.exampleGone);
          throw fail(error, status);
        }
        return item(data as unknown as ItemRow);
      }),

    setLessonListItemNote: (itemId, note) =>
      guard(async () => {
        if (!isListId(itemId)) throw new AccountError('missing', LIST_MESSAGES.itemMissing);
        await userId();
        const { data, error, status } = await items()
          .update({ note })
          .eq('id', itemId)
          .select(ITEM)
          .single();
        if (error) throw missing(error, status, LIST_MESSAGES.itemMissing) ?? fail(error, status);
        return item(data as unknown as ItemRow);
      }),

    removeLessonListItem: (itemId) =>
      guard(async () => {
        if (!isListId(itemId)) throw new AccountError('missing', LIST_MESSAGES.itemMissing);
        await userId();
        const { data, error, status } = await items().delete().eq('id', itemId).select('id');
        if (error) throw fail(error, status);
        if (!data?.length) throw new AccountError('missing', LIST_MESSAGES.itemMissing);
      }),

    reorderLessonList: (listId, itemIds) =>
      guard(async () => {
        if (!isListId(listId)) throw new AccountError('missing', LIST_MESSAGES.missing);
        await userId();
        const { error, status } = await client.rpc('reorder_lesson_list', {
          p_list: listId,
          p_items: itemIds,
        });
        if (error) throw fail(error, status);
      }),

    readSharedLessonList: (id) =>
      guard(async () => {
        if (!isListId(id)) return null;
        // Readers without an account get no access to the tables: a function returns a shared
        // list's content and nothing else.
        const { data, error, status } = await client
          .rpc('shared_lesson_list', { p_id: id })
          .maybeSingle();
        if (error) throw fail(error, status);
        return toPlayList(data);
      }),

    readOwnPlayList: (id) =>
      guard(async (): Promise<PlayList | null> => {
        if (!isListId(id)) return null;
        const { data: session } = await client.auth.getSession();
        if (!session.session) return null;
        const { data, error, status } = await lists()
          .select(PLAY)
          .eq('id', id)
          .order('position', { referencedTable: 'items', ascending: true })
          .maybeSingle();
        if (error) throw fail(error, status);
        if (!data) return null;
        const row = data as unknown as {
          title: string;
          notes: string;
          items: { note: string; example: Record<string, unknown> | null }[];
        };
        return toPlayList({
          title: row.title,
          notes: row.notes,
          items: (row.items ?? []).map((i) => ({ ...i.example, note: i.note })),
        });
      }),
  };
}
