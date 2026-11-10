/**
 * The reader's account, for the UI. With accounts off (no configuration) nothing here does
 * anything. Otherwise supabase-js loads only when it is needed: the reader opens Sign in, a
 * session is already stored, a sign-in comes back in the address, or a #saved= link opens.
 */
import { listeners } from '../engine/listeners';
import { notify } from '../ui/state.svelte';
import { readAuthReturn, stashReturn, takeStash } from './auth-return';
import {
  AccountError,
  asAccountError,
  type AccountBackend,
  type AccountUser,
  type AuthReturn,
  type LinkAnswer,
  type SharedExample,
} from './backend';
import { accountConfig, SESSION_KEY } from './config';

export const account = $state({
  /** False when accounts are off: no account UI anywhere. */
  enabled: accountConfig() !== null,
  user: null as AccountUser | null,
  /** A stored session is being checked, or a sign-in is being finished. */
  checking: false,
  /**
   * An emailed sign-in link came back while someone else is signed in here: the account menu
   * asks before switching. `hint` is the link's address, partly hidden (a***@example.com).
   */
  switchTo: null as { hint: string; ret: AuthReturn } | null,
});

const userChanges = listeners<[AccountUser | null]>();

/**
 * Called whenever the signed-in reader changes: signing in or out, here or in another tab
 * (src/account/sync.svelte.ts follows it). Returns an unsubscribe.
 */
export const onAccountUser = userChanges.add;

function setUser(user: AccountUser | null): void {
  const before = account.user?.id ?? null;
  account.user = user;
  if ((user?.id ?? null) !== before) userChanges.emit(user);
}

let markChecked: () => void = () => {};
/**
 * Settles once the check as the page starts is over: a stored session checked, a sign-in that
 * came back finished, or nothing to check.
 */
export const startupChecked: Promise<void> = new Promise((resolve) => (markChecked = resolve));

type Factory = () => Promise<AccountBackend>;

const supabase: Factory = async () => {
  const config = accountConfig();
  if (!config) throw new AccountError('off');
  const { createSupabaseBackend } = await import('./supabase');
  return createSupabaseBackend(config);
};

let factory: Factory = supabase;
let backend: Promise<AccountBackend> | null = null;

/** The account service, loaded the first time it is asked for. Throws AccountError. */
export function connect(): Promise<AccountBackend> {
  if (!account.enabled) return Promise.reject(new AccountError('off'));
  backend ??= factory().then(
    (b) => {
      b.onUserChange((user) => setUser(user));
      return b;
    },
    (e: unknown) => {
      // Try again next time (the chunk may not have loaded because the network was down).
      backend = null;
      throw asAccountError(e);
    },
  );
  return backend;
}

/** For unit tests: use this backend (null puts the real one back). */
export function useBackendForTests(b: AccountBackend | null): void {
  factory = b ? async () => b : supabase;
  backend = null;
  account.enabled = b !== null || accountConfig() !== null;
  account.switchTo = null;
  setUser(null);
}

/** Whether supabase-js has a session stored in this browser (without loading it). */
export function hasStoredSession(): boolean {
  try {
    return localStorage.getItem(SESSION_KEY) !== null;
  } catch {
    return false;
  }
}

let started = false;

/**
 * Run once as the app starts, before it reads the address: take a sign-in return out of the
 * address (putting the reader's page back), and check a stored session.
 */
export function startAccounts(): void {
  if (started) return;
  started = true;
  if (!account.enabled) return markChecked();
  const { ret, search, hash } = readAuthReturn(location.search, location.hash);
  if (ret) {
    const back = takeStash();
    try {
      history.replaceState(
        history.state,
        '',
        back ? back.path + back.hash : location.pathname + search + hash,
      );
    } catch {
      // The address keeps the parameters; the page still works.
    }
    void finishSignIn(ret).finally(markChecked);
    return;
  }
  // Embeds never sign in and show no account UI, so they leave a stored session alone.
  const embed = /(?:^#|&)embed=1(?:&|$)/.test(location.hash);
  if (!embed && hasStoredSession()) void refresh().finally(markChecked);
  else markChecked();
}

async function refresh(): Promise<void> {
  account.checking = true;
  try {
    setUser(await (await connect()).currentUser());
  } catch (e) {
    notify(asAccountError(e).message, 'error');
  } finally {
    account.checking = false;
  }
}

/**
 * Whether an address fits a link's hint (a***@example.com: the first letters, then the domain).
 * Without a hint nobody fits, so the reader is asked.
 */
export function fitsHint(email: string | null, hint: string): boolean {
  const m = /^([^*@]*)\*+@(.+)$/.exec(hint.trim().toLowerCase());
  if (!m || !email) return false;
  const [local = '', domain = ''] = email.toLowerCase().split('@');
  return domain === m[2] && local.startsWith(m[1]!);
}

async function finishSignIn(ret: AuthReturn, ask = true): Promise<void> {
  account.checking = true;
  try {
    const b = await connect();
    // An emailed link for someone else, while a reader is signed in here: ask first.
    if (ask && ret.kind === 'token' && hasStoredSession()) {
      const current = await b.currentUser().catch(() => null);
      if (current && !fitsHint(current.email, ret.emailHint)) {
        setUser(current);
        account.switchTo = { hint: ret.emailHint, ret };
        return;
      }
    }
    const user = await b.completeSignIn(ret);
    setUser(user);
    notify(user.email ? `Signed in as ${user.email}.` : 'Signed in.');
  } catch (e) {
    notify(asAccountError(e).message, 'error');
    // A failed return (an old link, another browser's Google return) leaves an earlier sign-in
    // in place.
    if (hasStoredSession()) await refresh();
  } finally {
    account.checking = false;
  }
}

/** The reader chose to switch to the account an emailed link signs in to. */
export async function confirmSwitch(): Promise<void> {
  const pending = account.switchTo;
  account.switchTo = null;
  if (pending) await finishSignIn(pending.ret, false);
}

/** The reader chose to stay signed in as they are: the link is left unused. */
export function declineSwitch(): void {
  account.switchTo = null;
}

const here = () => location.origin + location.pathname;

/**
 * Ask for an emailed sign-in link that comes back to this page (the page's hash is put aside in
 * this tab, since the link's address has none). Throws AccountError.
 */
export async function sendSignInLink(email: string, turnstileToken?: string): Promise<LinkAnswer> {
  const b = await connect();
  const answer = await b.sendSignInLink(email, here(), turnstileToken);
  if (answer.status === 'sent') stashReturn(location.pathname, location.hash);
  return answer;
}

/** Leave for Google's sign-in, which comes back to this page. Throws AccountError. */
export async function continueWithGoogle(): Promise<void> {
  const b = await connect();
  stashReturn(location.pathname, location.hash);
  await b.signInWithGoogle(here());
}

export async function signOut(say = true): Promise<void> {
  try {
    await (await connect()).signOut();
  } catch (e) {
    notify(asAccountError(e).message, 'error');
    return;
  } finally {
    setUser(null);
  }
  if (say) notify('Signed out. The examples in your account are there when you sign in again.');
}

/** The example a #saved=<id> link names. Throws AccountError with a message for the reader. */
export async function openShared(id: string): Promise<SharedExample> {
  if (!account.enabled) {
    throw new AccountError(
      'off',
      'This link opens an example saved in an account, and accounts are not available here.',
    );
  }
  const found = await (await connect()).readSharedExample(id);
  if (!found) {
    throw new AccountError(
      'missing',
      'That saved example is not available. Its owner may have deleted it or stopped sharing it.',
    );
  }
  return found;
}
