/**
 * Lesson lists for the in-memory account service (./fake.ts), keeping the database's rules: each
 * reader sees and changes only their own lists, an item holds only an example from the same
 * account, field limits, at most MAX_LISTS lists and MAX_LIST_ITEMS items, new items at the end,
 * a reorder that names every item once, and a shared list readable by its link. An item whose
 * example was deleted is gone, as the database's cascade does.
 */
import { AccountError, type AccountUser } from './backend';
import {
  isListId,
  LIST_LIMITS,
  LIST_MESSAGES,
  MAX_LIST_ITEMS,
  MAX_LISTS,
  type LessonListBackend,
  type LessonListItem,
  type LessonListSummary,
  type PlayList,
} from './lists';

export interface StoredList {
  id: string;
  owner: string;
  title: string;
  notes: string;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredItem {
  id: string;
  listId: string;
  exampleId: string;
  position: number;
  note: string;
}

export interface FakeListContext {
  /** The signed-in reader; throws as the fake does when there is none, or when it is failing. */
  me(): AccountUser;
  /** Throws when the fake is set to fail. */
  check(): void;
  /** The current user, or null, without failing. */
  user(): AccountUser | null;
  /** Every saved example of every account. */
  examples: readonly {
    id: string;
    owner: string;
    viz: string;
    title: string;
    notes: string;
    example: unknown;
  }[];
  now(): string;
  newId(): string;
}

export interface FakeListStore {
  lists: StoredList[];
  items: StoredItem[];
}

export function fakeLessonLists(
  ctx: FakeListContext,
): LessonListBackend & { readonly lessonLists: FakeListStore } {
  const store: FakeListStore = { lists: [], items: [] };

  /** The cascade: items whose example was deleted, or whose list was, are gone. */
  function prune() {
    const examples = new Set(ctx.examples.map((e) => e.id));
    const lists = new Set(store.lists.map((l) => l.id));
    for (let i = store.items.length - 1; i >= 0; i--) {
      const it = store.items[i]!;
      if (!examples.has(it.exampleId) || !lists.has(it.listId)) store.items.splice(i, 1);
    }
  }

  function mine(id: string): StoredList {
    const me = ctx.me();
    prune();
    const list = store.lists.find((l) => l.id === id && l.owner === me.id);
    if (!list) throw new AccountError('missing', LIST_MESSAGES.missing);
    return list;
  }

  const itemsOf = (listId: string) =>
    store.items.filter((i) => i.listId === listId).sort((a, b) => a.position - b.position);

  function summary(l: StoredList): LessonListSummary {
    return structuredClone({
      id: l.id,
      title: l.title,
      notes: l.notes,
      shared: l.shared,
      count: itemsOf(l.id).length,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    });
  }

  function itemOf(i: StoredItem): LessonListItem {
    const ex = ctx.examples.find((e) => e.id === i.exampleId);
    return {
      id: i.id,
      exampleId: i.exampleId,
      viz: ex?.viz ?? '',
      title: ex?.title ?? '',
      note: i.note,
    };
  }

  function playOf(l: StoredList): PlayList {
    return structuredClone({
      title: l.title,
      notes: l.notes,
      items: itemsOf(l.id).map((i) => {
        const ex = ctx.examples.find((e) => e.id === i.exampleId)!;
        return { viz: ex.viz, title: ex.title, notes: ex.notes, example: ex.example, note: i.note };
      }),
    });
  }

  function limits(l: { title?: string; notes?: string; note?: string }) {
    if (
      (l.title ?? '').length > LIST_LIMITS.title ||
      (l.notes ?? '').length > LIST_LIMITS.notes ||
      (l.note ?? '').length > LIST_LIMITS.note
    )
      throw new AccountError('large', 'That is longer than a lesson list can keep.');
  }

  function myItem(itemId: string): StoredItem {
    const me = ctx.me();
    prune();
    const it = store.items.find((i) => i.id === itemId);
    const list = it && store.lists.find((l) => l.id === it.listId && l.owner === me.id);
    if (!it || !list) throw new AccountError('missing', LIST_MESSAGES.itemMissing);
    return it;
  }

  const touch = (listId: string) => {
    const l = store.lists.find((x) => x.id === listId);
    if (l) l.updatedAt = ctx.now();
  };

  return {
    lessonLists: store,

    async listLessonLists() {
      const me = ctx.me();
      prune();
      return store.lists
        .filter((l) => l.owner === me.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(summary);
    },

    async readLessonList(id) {
      const list = mine(id);
      return { ...summary(list), items: itemsOf(list.id).map(itemOf) };
    },

    async createLessonList(input) {
      const me = ctx.me();
      if (store.lists.filter((l) => l.owner === me.id).length >= MAX_LISTS)
        throw new AccountError('full', LIST_MESSAGES.lists);
      limits(input);
      const at = ctx.now();
      const list: StoredList = {
        id: ctx.newId(),
        owner: me.id,
        title: input.title,
        notes: input.notes ?? '',
        shared: false,
        createdAt: at,
        updatedAt: at,
      };
      store.lists.push(list);
      return summary(list);
    },

    async updateLessonList(id, patch) {
      const list = mine(id);
      const next = { ...list, ...patch };
      limits(next);
      Object.assign(list, next, { updatedAt: ctx.now() });
      return summary(list);
    },

    async deleteLessonList(id) {
      const list = mine(id);
      store.lists.splice(store.lists.indexOf(list), 1);
      prune();
    },

    async addToLessonList(listId, exampleId, note = '') {
      const list = mine(listId);
      const me = ctx.me();
      if (!ctx.examples.some((e) => e.id === exampleId && e.owner === me.id))
        throw new AccountError('missing', LIST_MESSAGES.exampleGone);
      const items = itemsOf(list.id);
      if (items.length >= MAX_LIST_ITEMS) throw new AccountError('full', LIST_MESSAGES.items);
      limits({ note });
      const it: StoredItem = {
        id: ctx.newId(),
        listId: list.id,
        exampleId,
        position: items.length ? items.at(-1)!.position + 1 : 0,
        note,
      };
      store.items.push(it);
      touch(list.id);
      return itemOf(it);
    },

    async setLessonListItemNote(itemId, note) {
      const it = myItem(itemId);
      limits({ note });
      it.note = note;
      return itemOf(it);
    },

    async removeLessonListItem(itemId) {
      const it = myItem(itemId);
      store.items.splice(store.items.indexOf(it), 1);
      touch(it.listId);
    },

    async reorderLessonList(listId, itemIds) {
      const list = mine(listId);
      const items = itemsOf(list.id);
      const ids = new Set(itemIds);
      if (
        ids.size !== itemIds.length ||
        itemIds.length !== items.length ||
        items.some((i) => !ids.has(i.id))
      )
        throw new AccountError('other', LIST_MESSAGES.order);
      itemIds.forEach((id, n) => {
        items.find((i) => i.id === id)!.position = n;
      });
      touch(list.id);
    },

    async readSharedLessonList(id) {
      ctx.check();
      if (!isListId(id)) return null;
      prune();
      const list = store.lists.find((l) => l.id === id && l.shared);
      return list ? playOf(list) : null;
    },

    async readOwnPlayList(id) {
      ctx.check();
      const me = ctx.user();
      if (!me || !isListId(id)) return null;
      prune();
      const list = store.lists.find((l) => l.id === id && l.owner === me.id);
      return list ? playOf(list) : null;
    },
  };
}
