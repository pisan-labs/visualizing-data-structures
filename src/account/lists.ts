/**
 * Lesson lists in an account: an ordered set of the account's saved examples, from any pages, for
 * teaching one class. The tables, policies and functions are in
 * supabase/migrations/0003_lesson_lists.sql; the Supabase adapter is ./lists-supabase.ts and the
 * stand-in for unit tests ./lists-fake.ts. Like the rest of the backend, every method throws only
 * AccountError, whose message is safe to show as is.
 */
import { AccountError, isExampleId } from './backend';

/** A list as "My lesson lists" shows it, without its items. */
export interface LessonListSummary {
  id: string;
  title: string;
  notes: string;
  shared: boolean;
  /** How many examples it holds. */
  count: number;
  createdAt: string;
  updatedAt: string;
}

/** One example in a list, as the owner edits it. */
export interface LessonListItem {
  id: string;
  /** The saved example it holds. */
  exampleId: string;
  /** The example's page and name. */
  viz: string;
  title: string;
  /** A note for this step of the class, shown while the list plays. */
  note: string;
}

/** A list with its items in order, for its owner. */
export interface LessonList extends LessonListSummary {
  items: LessonListItem[];
}

/** One example of a list being played. `example` is untrusted: run it through validateExample. */
export interface PlayItem {
  viz: string;
  title: string;
  notes: string;
  example: unknown;
  note: string;
}

/** What playing a list needs, and all a shared list's link may read: no owner or ids. */
export interface PlayList {
  title: string;
  notes: string;
  items: PlayItem[];
}

export type LessonListPatch = Partial<Pick<LessonListSummary, 'title' | 'notes' | 'shared'>>;

export interface LessonListBackend {
  /** This reader's lists, most recently changed first. */
  listLessonLists(): Promise<LessonListSummary[]>;
  /** One of this reader's lists with its items in order. Throws 'missing' when it is not theirs. */
  readLessonList(id: string): Promise<LessonList>;
  createLessonList(input: { title: string; notes?: string }): Promise<LessonListSummary>;
  updateLessonList(id: string, patch: LessonListPatch): Promise<LessonListSummary>;
  deleteLessonList(id: string): Promise<void>;
  /** Put one of this reader's saved examples at the end of one of their lists. */
  addToLessonList(listId: string, exampleId: string, note?: string): Promise<LessonListItem>;
  setLessonListItemNote(itemId: string, note: string): Promise<LessonListItem>;
  removeLessonListItem(itemId: string): Promise<void>;
  /** Put the list's items in this order; it must name every item once. */
  reorderLessonList(listId: string, itemIds: string[]): Promise<void>;
  /** A shared list, signed in or not; null when it is missing, private or deleted. */
  readSharedLessonList(id: string): Promise<PlayList | null>;
  /** One of this reader's own lists, to play, shared or not; null when it is not theirs. */
  readOwnPlayList(id: string): Promise<PlayList | null>;
}

/** The most lists one account holds, and examples one list holds; the database says the same. */
export const MAX_LISTS = 200;
export const MAX_LIST_ITEMS = 100;

/** Field limits, the same as the database's check constraints. */
export const LIST_LIMITS = { title: 200, notes: 2000, note: 2000 } as const;

/** Whether a string can be a list's or an item's id (a UUID). Anything else is never looked up. */
export const isListId = isExampleId;

export const LIST_MESSAGES = {
  missing: 'That lesson list is no longer in your account.',
  itemMissing: 'That example is no longer in this list. It may have been removed or deleted.',
  lists: `Your account holds as many lesson lists as it can (${MAX_LISTS}). Delete one to make another.`,
  items: `A lesson list holds at most ${MAX_LIST_ITEMS} examples. Remove some, or start another list.`,
  order: 'This list changed somewhere else (another tab or computer). Here it is as it is now.',
  exampleGone: 'That example is no longer in your account, so it cannot go in a list.',
  notAvailable:
    'This lesson list is not available. Its owner may have deleted it or stopped sharing it.',
  off: 'This link opens a lesson list saved in an account, and accounts are not available here.',
} as const;

/**
 * The lesson-list errors the database raises, in words a reader understands; null for anything
 * else (the caller's usual mapping handles it).
 */
export function listError(raw: unknown): AccountError | null {
  const message =
    raw && typeof raw === 'object' && typeof (raw as { message?: unknown }).message === 'string'
      ? (raw as { message: string }).message
      : '';
  if (message.includes('lesson_lists_limit')) return new AccountError('full', LIST_MESSAGES.lists);
  if (message.includes('lesson_list_items_limit'))
    return new AccountError('full', LIST_MESSAGES.items);
  if (message.includes('lesson_list_order')) return new AccountError('other', LIST_MESSAGES.order);
  if (message.includes('lesson_list_missing'))
    return new AccountError('missing', LIST_MESSAGES.missing);
  return null;
}

/** A list name as the database keeps it: trimmed, within the limit, never empty. */
export function listTitle(title: string, fallback = 'Untitled list'): string {
  return title.trim().slice(0, LIST_LIMITS.title) || fallback;
}

/**
 * A list as a shared link or its owner returns it, checked: anything that is not a list of
 * items with a page and a name is dropped, so a damaged row never breaks the page.
 */
export function toPlayList(raw: unknown): PlayList | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as { title?: unknown; notes?: unknown; items?: unknown };
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const items = Array.isArray(r.items) ? r.items : [];
  return {
    title: str(r.title),
    notes: str(r.notes),
    items: items.flatMap((it: unknown): PlayItem[] => {
      if (!it || typeof it !== 'object') return [];
      const i = it as Record<string, unknown>;
      if (typeof i.viz !== 'string' || !i.viz) return [];
      return [
        {
          viz: i.viz,
          title: str(i.title),
          notes: str(i.notes),
          example: i.example,
          note: str(i.note),
        },
      ];
    }),
  };
}
