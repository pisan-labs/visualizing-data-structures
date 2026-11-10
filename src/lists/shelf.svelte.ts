import { connect } from '../account/account.svelte';
import { asAccountError, type AccountBackend } from '../account/backend';
import {
  LIST_LIMITS,
  LIST_MESSAGES,
  listTitle,
  type LessonList,
  type LessonListItem,
  type LessonListPatch,
  type LessonListSummary,
} from '../account/lists';
import { forgetPlayList } from './player.svelte';

/**
 * The reader's lesson lists, as "My lesson lists" and "Add to a lesson list" use them. Changes
 * throw AccountError (the caller shows its message); the lists stay as they were when one fails.
 */
export class ListShelf {
  lists = $state<LessonListSummary[]>([]);
  status = $state<'loading' | 'ready' | 'error'>('loading');
  /** Why the lists could not be loaded, when status is 'error'. */
  problem = $state('');
  /** The lists opened for editing, with their items, by id. */
  open = $state<Record<string, LessonList>>({});

  private pending: Promise<void> | null = null;

  constructor(private readonly backend: () => Promise<AccountBackend> = connect) {}

  /** Load the lists if they are not loaded yet (or failed to load); once at a time. */
  ensure(): Promise<void> {
    if (this.status === 'ready') return Promise.resolve();
    this.pending ??= this.refresh().finally(() => (this.pending = null));
    return this.pending;
  }

  async refresh(): Promise<void> {
    this.status = 'loading';
    try {
      this.lists = await (await this.backend()).listLessonLists();
      this.status = 'ready';
    } catch (e) {
      this.problem = asAccountError(e).message;
      this.status = 'error';
    }
  }

  async create(title: string, notes = ''): Promise<LessonListSummary> {
    const list = await call(async () =>
      (await this.backend()).createLessonList({
        title: listTitle(title),
        notes: notes.slice(0, LIST_LIMITS.notes),
      }),
    );
    this.lists = [list, ...this.lists.filter((l) => l.id !== list.id)];
    return list;
  }

  /** Change a list's name, notes or sharing. */
  async change(id: string, patch: LessonListPatch): Promise<LessonListSummary> {
    const clean: LessonListPatch = { ...patch };
    if (clean.title !== undefined) clean.title = listTitle(clean.title);
    if (clean.notes !== undefined) clean.notes = clean.notes.slice(0, LIST_LIMITS.notes);
    const list = await this.guard(id, async (b) => b.updateLessonList(id, clean));
    this.put(list);
    const opened = this.open[id];
    if (opened) this.open[id] = { ...opened, ...list, count: opened.items.length };
    return list;
  }

  async remove(id: string): Promise<void> {
    await this.guard(id, async (b) => b.deleteLessonList(id));
    this.drop(id);
  }

  /** Load a list's items, for editing. */
  async load(id: string): Promise<LessonList> {
    const list = await this.guard(id, async (b) => b.readLessonList(id));
    this.open[id] = list;
    this.put(list);
    return list;
  }

  close(id: string): void {
    delete this.open[id];
  }

  /** Put a saved example at the end of a list. */
  async add(listId: string, exampleId: string): Promise<LessonListItem> {
    const item = await this.guard(listId, async (b) => b.addToLessonList(listId, exampleId));
    const list = this.lists.find((l) => l.id === listId);
    // The list was just changed: it goes first, as the server orders them.
    if (list)
      this.lists = [{ ...list, count: list.count + 1 }, ...this.lists.filter((l) => l !== list)];
    const opened = this.open[listId];
    if (opened) this.open[listId] = { ...opened, items: [...opened.items, item] };
    return item;
  }

  async setNote(listId: string, itemId: string, note: string): Promise<LessonListItem> {
    const item = await this.guard(listId, async (b) =>
      b.setLessonListItemNote(itemId, note.slice(0, LIST_LIMITS.note)),
    );
    this.editItems(listId, (items) => items.map((i) => (i.id === itemId ? item : i)));
    return item;
  }

  async removeItem(listId: string, itemId: string): Promise<void> {
    await this.guard(listId, async (b) => b.removeLessonListItem(itemId));
    this.editItems(listId, (items) => items.filter((i) => i.id !== itemId));
  }

  /** Move an item one place earlier (-1) or later (+1). */
  async move(listId: string, itemId: string, dir: -1 | 1): Promise<void> {
    const items = this.open[listId]?.items ?? [];
    const i = items.findIndex((x) => x.id === itemId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    try {
      await this.guard(listId, async (b) =>
        b.reorderLessonList(
          listId,
          next.map((x) => x.id),
        ),
      );
    } catch (e) {
      // The list changed somewhere else: show it as it is now.
      await this.load(listId).catch(() => {});
      throw e;
    }
    this.editItems(listId, () => next);
  }

  private put(list: LessonListSummary) {
    this.lists = this.lists.map((l) =>
      l.id === list.id
        ? {
            id: list.id,
            title: list.title,
            notes: list.notes,
            shared: list.shared,
            count: list.count,
            createdAt: list.createdAt,
            updatedAt: list.updatedAt,
          }
        : l,
    );
  }

  private drop(id: string) {
    this.lists = this.lists.filter((l) => l.id !== id);
    delete this.open[id];
  }

  private editItems(listId: string, edit: (items: LessonListItem[]) => LessonListItem[]) {
    const opened = this.open[listId];
    if (opened) {
      const items = edit(opened.items);
      this.open[listId] = { ...opened, items, count: items.length };
      this.lists = this.lists.map((l) => (l.id === listId ? { ...l, count: items.length } : l));
    }
  }

  /**
   * Run a change to one list. The list is played afresh next time; one deleted elsewhere
   * (another tab, another computer) comes off the shelf.
   */
  private async guard<T>(listId: string, work: (b: AccountBackend) => Promise<T>): Promise<T> {
    forgetPlayList(listId);
    try {
      return await work(await this.backend());
    } catch (e) {
      const problem = asAccountError(e);
      if (problem.message === LIST_MESSAGES.missing) this.drop(listId);
      throw problem;
    }
  }
}

async function call<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw asAccountError(e);
  }
}
