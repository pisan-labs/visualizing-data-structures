/**
 * Playing a lesson list: its link (/#list=<id>) opens the first example's page, and each page of
 * the list carries #list=<id>&item=<n> (1 for the first). Moving through the list happens in the
 * page, without a reload, so Present mode and full screen carry on from one example to the next.
 */
import { account, connect } from '../account/account.svelte';
import { AccountError, asAccountError } from '../account/backend';
import { LIST_MESSAGES, type PlayItem, type PlayList } from '../account/lists';
import { navigate, vizHref } from '../ui/route';

/** Lists opened in this page, so moving through one asks the server once. Never shown. */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a cache, not state
const opened = new Map<string, PlayList>();

/**
 * A list to play: a shared one (anyone with its link), or one of the reader's own, shared or
 * not. `fresh` asks the server again, as opening the list's link does. Throws AccountError with a
 * message for the reader.
 */
export async function openPlayList(id: string, fresh = false): Promise<PlayList> {
  if (!account.enabled) throw new AccountError('off', LIST_MESSAGES.off);
  const known = opened.get(id);
  if (known && !fresh) return known;
  const backend = await connect();
  const list =
    (await backend.readSharedLessonList(id)) ??
    (await backend.readOwnPlayList(id).catch(() => null));
  if (!list) {
    opened.delete(id);
    throw new AccountError('missing', LIST_MESSAGES.notAvailable);
  }
  opened.set(id, list);
  return list;
}

/** The reader changed this list: the next play asks the server. */
export function forgetPlayList(id: string): void {
  opened.delete(id);
}

/** The address of a list's example `n` (1 for the first). */
export const itemHref = (id: string, list: PlayList, n: number): string =>
  vizHref(list.items[n - 1]!.viz, { list: id, item: n });

/**
 * Present mode carries over to the next example's page: the page that is leaving leaves the
 * page presenting, and the one that opens takes it up (VizPage).
 */
export const carry = $state({ present: false });
let carryTimer: ReturnType<typeof setTimeout> | undefined;

/** Go to example `n` of the list, in this page. */
export function goToItem(id: string, list: PlayList, n: number, presenting: boolean): void {
  carry.present = presenting;
  clearTimeout(carryTimer);
  // If no page takes it up (the next page could not load), stop presenting after a while.
  if (presenting)
    carryTimer = setTimeout(() => {
      if (!carry.present) return;
      carry.present = false;
      document.documentElement.classList.remove('presenting');
    }, 15_000);
  navigate(itemHref(id, list, n));
}

/** Whether the page that opens should start presenting (once). */
export function takePresent(): boolean {
  const on = carry.present;
  carry.present = false;
  clearTimeout(carryTimer);
  return on;
}

/** One list being played on one page, for the list bar. */
export class ListPlay {
  status = $state<'loading' | 'ready' | 'error'>('loading');
  list = $state<PlayList | null>(null);
  problem = $state('');
  /** The example on this page, 1 for the first. */
  n = $state(1);
  private loading: Promise<PlayList | null> | null = null;

  constructor(
    readonly id: string,
    n: number,
  ) {
    this.n = Math.max(1, Math.floor(n) || 1);
  }

  get total(): number {
    return this.list?.items.length ?? 0;
  }

  get item(): PlayItem | undefined {
    return this.list?.items[this.n - 1];
  }

  /** Fetch the list once; null (with `problem` set) when it cannot be played. */
  load(): Promise<PlayList | null> {
    this.loading ??= openPlayList(this.id).then(
      (list) => {
        this.list = list;
        // The list may have shrunk since the link was made: stay within it.
        if (list.items.length && this.n > list.items.length) this.n = list.items.length;
        this.status = 'ready';
        return list;
      },
      (e: unknown) => {
        this.problem = asAccountError(e).message;
        this.status = 'error';
        return null;
      },
    );
    return this.loading;
  }
}
