/**
 * Preferences and progress follow a signed-in reader's account (app_stepwise.preferences, one
 * row per account). On sign-in the account's copy is read, merged with this browser's, shown,
 * and written back; after that each change here is written back a few seconds later. Nothing
 * waits for it, and a write that fails leaves the change in the browser, where the next sync
 * finds it. Signed out, or with accounts off, nothing here runs and nothing is sent.
 *
 * A write names the copy of the row it was merged from (its updated_at), and the database
 * refuses it if the row changed meanwhile: the sync then reads the row again, merges, and tries
 * again. So two tabs or two computers never overwrite each other's changes, and since the merge
 * (./sync-merge.ts) keeps the later of every setting, lesson, check and practice try, every copy
 * ends up the same.
 */
import { applyPrefs, clearPrefs, onPrefChange, storedPrefs } from '../ui/state.svelte';
import { progress } from '../ui/progress.svelte';
import { applySeen, clearSeen, onSeenChange, seen } from '../ui/new-since.svelte';
import { account, connect, onAccountUser, signOut, startupChecked } from './account.svelte';
import {
  AccountError,
  asAccountError,
  type AccountBackend,
  type AccountPreferences,
  type AccountUser,
} from './backend';
import { forgetCopied } from './library';
import {
  canonical,
  EPOCH,
  isEmptySynced,
  mergeSynced,
  parsePrefStamps,
  parseSynced,
  PREF_KEYS,
  sameSynced,
  type PrefStamps,
  type Synced,
} from './sync-merge';

/** This browser's side: its copy, and taking the merged one. */
export interface LocalCopy {
  read(): Synced;
  /** Show and store the merged copy (only what changed needs doing). */
  apply(merged: Synced, before: Synced): void;
}

/**
 * - off: signed out
 * - syncing: reading or writing
 * - saved: the account has everything this browser has
 * - offline: the last try failed (the browser keeps everything; the next change tries again)
 * - unavailable: the database has no preferences table yet; nothing more is tried this visit
 */
export type SyncStatus = 'off' | 'syncing' | 'saved' | 'offline' | 'unavailable';

/** How long a change waits before it is written, so a burst of changes is one write. */
export const SYNC_DELAY_MS = 3000;
/** A tab that comes back into view after this long reads the account again. */
const STALE_MS = 60_000;

export class AccountSync {
  status = $state<SyncStatus>('off');
  /** The account's "Email me when StepWise adds new pages (at most once a day)". */
  notifyNewPages = $state(false);
  /** Why the last sync failed, when status is offline. */
  problem = $state('');

  private userId: string | null = null;
  /** The account's row as last read or written; undefined when it must be read. */
  private known: AccountPreferences | null | undefined = undefined;
  private knownAt = 0;
  /** The email choice made here and not yet written. */
  private pendingNotify: boolean | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  /** Bumped on every sign-in and sign-out, so the answer to an older request is ignored. */
  private generation = 0;

  constructor(
    private readonly backend: () => Promise<AccountBackend>,
    private readonly local: LocalCopy,
    private readonly delayMs = SYNC_DELAY_MS,
  ) {}

  /** The reader signed in (sync now) or out (stop). */
  userChanged(user: AccountUser | null): void {
    const id = user?.id ?? null;
    if (id === this.userId) return;
    this.stop();
    this.userId = id;
    if (!id) return;
    this.status = 'syncing';
    void this.run();
  }

  /** Something changed here: write it to the account in a few seconds. */
  changed(): void {
    if (!this.userId || this.status === 'unavailable') return;
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, this.delayMs);
  }

  /** Write a waiting change now (the page is being hidden). */
  flush(): Promise<unknown> {
    if (!this.timer) return this.chain;
    this.cancelTimer();
    return this.run();
  }

  /** Read the account again if the copy here is old (the tab came back into view), or now. */
  refresh(force = false): Promise<unknown> {
    if (!this.userId || this.status === 'unavailable') return this.chain;
    if (!force && Date.now() - this.knownAt < STALE_MS) return this.chain;
    this.known = undefined;
    return this.run();
  }

  /** Settles once nothing is being read or written. */
  async idle(): Promise<void> {
    let c: Promise<unknown>;
    do {
      c = this.chain;
      await c;
    } while (c !== this.chain);
  }

  /** Turn the email about new pages on or off. Throws AccountError, and then puts it back. */
  async setNotifyNewPages(on: boolean): Promise<void> {
    if (!this.userId) throw new AccountError('expired');
    const before = this.notifyNewPages;
    this.pendingNotify = on;
    this.notifyNewPages = on;
    this.cancelTimer();
    const problem = await this.run();
    if (problem) {
      this.pendingNotify = null;
      this.notifyNewPages = before;
      throw problem;
    }
  }

  /** Stop syncing (signed out, or the reader's data is being deleted). */
  stop(): void {
    this.generation++;
    this.cancelTimer();
    this.userId = null;
    this.known = undefined;
    this.pendingNotify = null;
    this.notifyNewPages = false;
    this.problem = '';
    this.status = 'off';
  }

  private cancelTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** One sync after the ones already queued. Resolves with its problem, or null. */
  private run(): Promise<AccountError | null> {
    const gen = this.generation;
    const next = this.chain.then(() => (gen === this.generation ? this.syncOnce(gen) : null));
    this.chain = next;
    return next;
  }

  private async syncOnce(gen: number): Promise<AccountError | null> {
    const live = () => gen === this.generation;
    this.status = 'syncing';
    try {
      const b = await this.backend();
      if (!live()) return null;
      // Each round reads (when needed), merges, and writes only if the account lacks something.
      // A refused write means the row changed meanwhile, so the next round reads it again.
      for (let round = 0; round < 6; round++) {
        if (this.known === undefined) {
          const row = await b.readPreferences();
          if (!live()) return null;
          this.known = row;
          this.knownAt = Date.now();
        }
        const remote = this.known;
        const here = this.local.read();
        const theirs = remote ? parseSynced(remote) : null;
        const merged = theirs ? mergeSynced(here, theirs) : here;
        if (!sameSynced(merged, here)) this.local.apply(merged, here);
        const notify = this.pendingNotify ?? remote?.notifyNewPages ?? false;
        const upToDate = theirs
          ? sameSynced(merged, theirs) && notify === remote!.notifyNewPages
          : isEmptySynced(merged) && !notify;
        if (upToDate) {
          this.pendingNotify = null;
          this.notifyNewPages = notify;
          this.problem = '';
          this.status = 'saved';
          return null;
        }
        const stored = await b.writePreferences(
          {
            prefs: merged.prefs,
            progress: merged.progress,
            lastRelease: merged.lastRelease,
            notifyNewPages: notify,
          },
          remote?.updatedAt ?? null,
        );
        if (!live()) return null;
        this.known = stored ?? undefined;
        this.knownAt = Date.now();
      }
      throw new AccountError('other');
    } catch (e) {
      const problem = asAccountError(e);
      if (!live()) return null;
      if (problem.kind === 'unavailable') {
        // The database is not ready for this yet (0002_preferences.sql not applied): stay quiet.
        this.status = 'unavailable';
        this.problem = '';
      } else {
        this.status = 'offline';
        this.problem =
          problem.kind === 'large'
            ? 'Your progress is too large to keep in your account.'
            : problem.message;
      }
      this.known = undefined;
      return problem;
    }
  }
}

/** This browser's copy, as the app keeps it: src/ui/state.svelte.ts, progress and new-since. */
const browserCopy: LocalCopy = {
  read() {
    // A setting stored before times were kept counts as older than any choice made since.
    const raw: Record<string, { value: unknown; at: string }> = {};
    for (const [key, p] of Object.entries(storedPrefs()))
      raw[key] = { value: p.value, at: p.at ?? EPOCH };
    return {
      prefs: parsePrefStamps(raw),
      progress: progress.current,
      lastRelease: seen.last,
    };
  },
  apply(merged, before) {
    const changed: PrefStamps = {};
    for (const key of PREF_KEYS) {
      const stamp = merged.prefs[key];
      if (stamp && canonical(stamp) !== canonical(before.prefs[key])) changed[key] = stamp;
    }
    if (Object.keys(changed).length) applyPrefs(changed);
    if (canonical(merged.progress) !== canonical(before.progress))
      progress.mergeIn(merged.progress);
    if (merged.lastRelease !== before.lastRelease) applySeen(merged.lastRelease);
  },
};

/** The app's sync, following the signed-in reader. */
export const sync = new AccountSync(connect, browserCopy);

if (typeof window !== 'undefined') {
  onAccountUser((user) => sync.userChanged(user));
  onPrefChange(() => sync.changed());
  progress.onChange(() => sync.changed());
  onSeenChange(() => sync.changed());
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void sync.flush();
    else void sync.refresh();
  });
  addEventListener('pagehide', () => void sync.flush());
  if (account.user) sync.userChanged(account.user);
}

/** Settles once the account check as the page starts, and the first sync, are over. */
export async function accountSettled(): Promise<void> {
  await startupChecked;
  await sync.idle();
}

/**
 * "Delete my StepWise data": the reader's rows in app_stepwise (saved examples, preferences,
 * lesson lists), then this browser's copies of what the account keeps (settings, progress, the
 * last release seen), then sign out here. Throws AccountError, and then nothing has changed.
 */
export async function deleteMyData(): Promise<void> {
  const user = account.user;
  if (!user) throw new AccountError('expired');
  const b = await connect();
  // No write may land after the delete: stop, and let one already sent finish first.
  sync.stop();
  await sync.idle();
  try {
    await b.deleteMyData();
  } catch (e) {
    sync.userChanged(user);
    throw asAccountError(e);
  }
  clearPrefs();
  progress.clear();
  clearSeen();
  forgetCopied(user.id);
  await signOut(false);
}
