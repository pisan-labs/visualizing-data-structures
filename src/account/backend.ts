/**
 * What the site needs from an account service. The Supabase adapter (./supabase.ts) is the real
 * one and loads on demand; ./fake.ts is an in-memory stand-in for unit tests.
 *
 * Every method throws only AccountError, whose message is short and safe to show as is. Callers
 * show it and carry on: an account that cannot be reached never stops the rest of the page.
 */

export interface AccountUser {
  id: string;
  email: string | null;
}

/** An example saved in an account. `example` is untrusted: run it through validateExample. */
export interface AccountExample {
  id: string;
  viz: string;
  title: string;
  notes: string;
  example: unknown;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewAccountExample {
  viz: string;
  title: string;
  notes?: string;
  example: unknown;
  shared?: boolean;
}

export type AccountExamplePatch = Partial<Pick<AccountExample, 'title' | 'notes' | 'shared'>> & {
  example?: unknown;
};

/** What a shared example's link may read: no owner, id or dates. */
export interface SharedExample {
  viz: string;
  title: string;
  notes: string;
  example: unknown;
}

/**
 * A sign-in that came back in the page's address (the PKCE flow): `?code=` to exchange for a
 * session, or `?error=...&error_description=...`.
 */
export type AuthReturn =
  | { kind: 'code'; code: string; flowId?: string }
  | { kind: 'error'; code: string; description: string };

export interface AccountBackend {
  /** Email a sign-in link that brings the reader back to `returnTo`. */
  sendSignInLink(email: string, returnTo: string): Promise<void>;
  /** Leave for Google's sign-in page, which comes back to `returnTo`. */
  signInWithGoogle(returnTo: string): Promise<void>;
  /** Finish a sign-in that came back in the address. */
  completeSignIn(ret: AuthReturn): Promise<AccountUser>;
  signOut(): Promise<void>;
  /** The signed-in reader, or null. */
  currentUser(): Promise<AccountUser | null>;
  /** Called when the reader signs in or out, here or in another tab. Returns an unsubscribe. */
  onUserChange(listener: (user: AccountUser | null) => void): () => void;
  /** This reader's examples for one page, most recently changed first. */
  listExamples(viz: string): Promise<AccountExample[]>;
  createExample(input: NewAccountExample): Promise<AccountExample>;
  updateExample(id: string, patch: AccountExamplePatch): Promise<AccountExample>;
  deleteExample(id: string): Promise<void>;
  /** A shared example, signed in or not; null when it is missing, private or deleted. */
  readSharedExample(id: string): Promise<SharedExample | null>;
}

export type AccountErrorKind =
  | 'off'
  | 'unreachable'
  | 'expired'
  | 'rate'
  | 'email'
  | 'link'
  | 'browser'
  | 'missing'
  | 'full'
  | 'large'
  | 'other';

export const MESSAGES: Record<AccountErrorKind, string> = {
  off: 'Accounts are not available on this site.',
  unreachable:
    'Could not reach your account. Try again in a minute; the rest of the page still works.',
  expired: 'Your sign-in has expired. Sign in again.',
  rate: 'Too many sign-in emails right now. Try Google, or wait a minute and try again.',
  email: 'That email address does not look right.',
  link: 'That sign-in link has expired or was already used. Ask for a new one.',
  browser: 'Open the sign-in link in the same browser you asked for it from.',
  missing: 'That example is no longer in your account.',
  full: 'Your account holds as many examples as it can (1000). Delete some to save more.',
  large: 'This example is too large to keep in an account. Download it as a file instead.',
  other: 'Something went wrong with your account. Try again in a minute.',
};

/** A problem with the account, in words a reader understands. Show `message` as is. */
export class AccountError extends Error {
  override name = 'AccountError';
  constructor(
    readonly kind: AccountErrorKind,
    message: string = MESSAGES[kind],
    /** For 'rate': how many seconds the server asked us to wait, when it said. */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

/** Supabase sends one sign-in link per address a minute; the dialog waits as long. */
export const LINK_WAIT_MS = 60_000;

/** Whole seconds until `until` (a time in ms), never below 0. */
export const secondsLeft = (until: number, now: number): number =>
  Math.max(0, Math.ceil((until - now) / 1000));

/** The most examples one account holds; the database enforces the same number. */
export const MAX_EXAMPLES = 1000;

/** Field limits, the same as the database's check constraints. */
export const LIMITS = { title: 200, notes: 2000, exampleBytes: 262_144 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a string can be a saved example's id (a UUID). Anything else is never looked up. */
export const isExampleId = (s: string): boolean => UUID.test(s);

/**
 * Any failure as an AccountError. The backends throw only AccountError; anything else is a
 * part of the site that did not load (no network) or a bug.
 */
export function asAccountError(e: unknown): AccountError {
  if (e instanceof AccountError) return e;
  const text = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return new AccountError(/fetch|network|load failed|import/i.test(text) ? 'unreachable' : 'other');
}

/**
 * The example to open, with the name and notes it has in the account (a rename changes only
 * the row's title). Still untrusted: the page runs it through validateExample.
 */
export function exampleOf(row: AccountExample | SharedExample): unknown {
  const ex = row.example;
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return ex;
  return { ...ex, title: row.title, ...(row.notes ? { notes: row.notes } : {}) };
}
