/**
 * The reader's account, for the UI. With accounts off (no configuration) nothing here does
 * anything. Otherwise supabase-js loads only when it is needed: the reader opens Sign in, a
 * session is already stored, a sign-in comes back in the address, or a #saved= link opens.
 */
import { notify } from '../ui/state.svelte';
import { readAuthReturn, stashReturn, takeStash } from './auth-return';
import {
  AccountError,
  asAccountError,
  type AccountBackend,
  type AccountUser,
  type AuthReturn,
  type SharedExample,
} from './backend';
import { accountConfig, SESSION_KEY } from './config';

export const account = $state({
  /** False when accounts are off: no account UI anywhere. */
  enabled: accountConfig() !== null,
  user: null as AccountUser | null,
  /** A stored session is being checked, or a sign-in is being finished. */
  checking: false,
});

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
      b.onUserChange((user) => {
        account.user = user;
      });
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
  account.user = null;
}

function hasStoredSession(): boolean {
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
  if (started || !account.enabled) return;
  started = true;
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
    void finishSignIn(ret);
    return;
  }
  // Embeds never sign in and show no account UI, so they leave a stored session alone.
  const embed = /(?:^#|&)embed=1(?:&|$)/.test(location.hash);
  if (!embed && hasStoredSession()) void refresh();
}

async function refresh(): Promise<void> {
  account.checking = true;
  try {
    account.user = await (await connect()).currentUser();
  } catch (e) {
    notify(asAccountError(e).message, 'error');
  } finally {
    account.checking = false;
  }
}

async function finishSignIn(ret: AuthReturn): Promise<void> {
  account.checking = true;
  try {
    const user = await (await connect()).completeSignIn(ret);
    account.user = user;
    notify(user.email ? `Signed in as ${user.email}.` : 'Signed in.');
  } catch (e) {
    notify(asAccountError(e).message, 'error');
    // A failed return (an old link, another browser's link) leaves an earlier sign-in in place.
    if (hasStoredSession()) await refresh();
  } finally {
    account.checking = false;
  }
}

const here = () => location.origin + location.pathname;

/** Email a sign-in link that comes back to this page. Throws AccountError. */
export async function sendSignInLink(email: string): Promise<void> {
  const b = await connect();
  stashReturn(location.pathname, location.hash);
  await b.sendSignInLink(email, here());
}

/** Leave for Google's sign-in, which comes back to this page. Throws AccountError. */
export async function continueWithGoogle(): Promise<void> {
  const b = await connect();
  stashReturn(location.pathname, location.hash);
  await b.signInWithGoogle(here());
}

export async function signOut(): Promise<void> {
  try {
    await (await connect()).signOut();
  } catch (e) {
    notify(asAccountError(e).message, 'error');
    return;
  } finally {
    account.user = null;
  }
  notify('Signed out. The examples in your account are there when you sign in again.');
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
