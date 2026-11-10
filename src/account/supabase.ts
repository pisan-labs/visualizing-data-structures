/**
 * The Supabase adapter. This module and @supabase/supabase-js load together, on demand, as one
 * chunk (account.svelte.ts imports it with a dynamic import()), so a signed-out visit never
 * downloads either. The tables, policies and functions are in supabase/migrations: everything
 * StepWise keeps lives in the app_stepwise schema of the shared HintWise project.
 */
import { createClient, type Session, type User } from '@supabase/supabase-js';
import { readJson, writeJson } from '../engine/storage';
import {
  AccountError,
  isExampleId,
  type AccountBackend,
  type AccountExample,
  type AccountExamplePatch,
  type AccountUser,
  type AuthReturn,
  type NewAccountExample,
  type SharedExample,
} from './backend';
import { SESSION_KEY, type AccountConfig } from './config';
import { toAccountError } from './errors';
import { supabaseLessonLists } from './lists-supabase';

/** A request that gets no answer in this long counts as unreachable. */
const TIMEOUT_MS = 15_000;

const COLUMNS = 'id, viz, title, notes, example, shared, created_at, updated_at';

interface Row {
  id: string;
  viz: string;
  title: string;
  notes: string;
  example: unknown;
  shared: boolean;
  created_at: string;
  updated_at: string;
}

const fromRow = (r: Row): AccountExample => ({
  id: r.id,
  viz: r.viz,
  title: r.title,
  notes: r.notes,
  example: r.example,
  shared: r.shared,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toUser = (u: User | null | undefined): AccountUser | null =>
  u ? { id: u.id, email: u.email ?? null } : null;

/** fetch with a time limit, so a request that hangs fails like one that was refused. */
function fetchWithTimeout(base: typeof fetch): typeof fetch {
  return (input, init = {}) => {
    const limit = AbortSignal.timeout(TIMEOUT_MS);
    const signal =
      init.signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([init.signal, limit])
        : (init.signal ?? limit);
    return base(input, { ...init, signal });
  };
}

export interface SupabaseOptions {
  /** For tests: answer requests without a network. */
  fetch?: typeof fetch;
  /** For tests: keep the session somewhere other than localStorage. */
  storage?: {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
    removeItem(k: string): void;
  };
}

/** Accounts whose HintWise profile this browser has made sure of (platform.ensure_profile). */
const PROFILES = 'account-profiles';

export function createSupabaseBackend(
  config: AccountConfig,
  options: SupabaseOptions = {},
): AccountBackend {
  const client = createClient(config.url, config.anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      // The app takes ?code= and ?error= out of the address before it routes, because the
      // page rewrites its address as the reader works, and hands them to completeSignIn. So
      // supabase-js finds nothing there, and a real address is never read twice.
      detectSessionInUrl: true,
      storageKey: SESSION_KEY,
      ...(options.storage ? { storage: options.storage } : {}),
    },
    db: { schema: 'app_stepwise' },
    global: { fetch: fetchWithTimeout(options.fetch ?? ((...a) => fetch(...a))) },
  });
  const table = () => client.from('saved_examples');

  /** Run an account call; anything it throws becomes an AccountError. */
  async function guard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (e) {
      throw toAccountError(e);
    }
  }

  async function userId(): Promise<string> {
    const { data, error } = await client.auth.getSession();
    if (error) throw toAccountError(error);
    const id = data.session?.user.id;
    if (!id) throw new AccountError('expired');
    return id;
  }

  /**
   * Make sure the shared HintWise profile exists, once per account in this browser. Best
   * effort: nothing waits for it, and a failure only means it is tried again next time.
   */
  function ensureProfile(user: AccountUser | null) {
    if (!user) return;
    const done = readJson<string[]>(PROFILES, []);
    if (Array.isArray(done) && done.includes(user.id)) return;
    client
      .schema('platform')
      .rpc('ensure_profile')
      .then(
        ({ error }) => {
          if (!error) writeJson(PROFILES, [...(Array.isArray(done) ? done : []), user.id]);
        },
        () => {},
      );
  }

  const sessionUser = (session: Session | null): AccountUser | null => toUser(session?.user);

  return {
    sendSignInLink: (email, returnTo) =>
      guard(async () => {
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: returnTo },
        });
        if (error) throw toAccountError(error);
      }),

    signInWithGoogle: (returnTo) =>
      guard(async () => {
        // supabase-js leaves for Google's page by itself.
        const { error } = await client.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: returnTo, queryParams: { prompt: 'select_account' } },
        });
        if (error) throw toAccountError(error);
      }),

    completeSignIn: (ret: AuthReturn) =>
      guard(async () => {
        if (ret.kind === 'error') {
          // Supabase's own words ("Email link is invalid or has expired") are plain enough.
          throw new AccountError(
            'link',
            ret.description ? `Sign-in did not work: ${ret.description}` : undefined,
          );
        }
        const { data, error } = await client.auth.exchangeCodeForSession(
          ret.code,
          ret.flowId ? { flowId: ret.flowId } : undefined,
        );
        if (error) throw toAccountError(error);
        const user = toUser(data.user ?? data.session?.user);
        if (!user) throw new AccountError('link');
        ensureProfile(user);
        return user;
      }),

    signOut: () =>
      guard(async () => {
        // Only this site in this browser: a global sign-out would end every HintWise app's
        // session. supabase-js forgets the session here even when the server cannot be told.
        await client.auth.signOut({ scope: 'local' });
      }),

    currentUser: () =>
      guard(async () => {
        const { data } = await client.auth.getSession();
        if (!data.session) return null;
        // Ask the server whether the session still holds. If it cannot be reached, trust the
        // stored one: the reader stays signed in and each call says when it fails.
        const { data: fresh, error } = await client.auth.getUser();
        if (error) {
          if (toAccountError(error).kind === 'unreachable') return sessionUser(data.session);
          await client.auth.signOut({ scope: 'local' });
          return null;
        }
        const user = toUser(fresh.user);
        ensureProfile(user);
        return user;
      }),

    onUserChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // Callbacks run inside supabase-js's own bookkeeping: hand the change over afterwards.
        setTimeout(() => listener(sessionUser(session)), 0);
      });
      return () => data.subscription.unsubscribe();
    },

    listExamples: (viz) =>
      guard(async () => {
        const owner = await userId();
        const { data, error, status } = await table()
          .select(COLUMNS)
          .eq('owner', owner)
          .eq('viz', viz)
          .order('updated_at', { ascending: false });
        if (error) throw toAccountError(error, status);
        return (data as Row[]).map(fromRow);
      }),

    createExample: (input: NewAccountExample) =>
      guard(async () => {
        await userId();
        const { data, error, status } = await table()
          .insert({
            viz: input.viz,
            title: input.title,
            notes: input.notes ?? '',
            example: input.example,
            shared: input.shared ?? false,
          })
          .select(COLUMNS)
          .single();
        if (error) throw toAccountError(error, status);
        return fromRow(data as Row);
      }),

    updateExample: (id: string, patch: AccountExamplePatch) =>
      guard(async () => {
        if (!isExampleId(id)) throw new AccountError('missing');
        await userId();
        const { data, error, status } = await table()
          .update(patch)
          .eq('id', id)
          .select(COLUMNS)
          .single();
        if (error) throw toAccountError(error, status);
        return fromRow(data as Row);
      }),

    deleteExample: (id: string) =>
      guard(async () => {
        if (!isExampleId(id)) throw new AccountError('missing');
        await userId();
        const { data, error, status } = await table().delete().eq('id', id).select('id');
        if (error) throw toAccountError(error, status);
        if (!data?.length) throw new AccountError('missing');
      }),

    readSharedExample: (id: string) =>
      guard(async () => {
        if (!isExampleId(id)) return null;
        // Readers without an account get no access to the table itself: a function returns a
        // shared row's content and nothing else.
        const { data, error, status } = await client
          .rpc('shared_example', { p_id: id })
          .maybeSingle();
        if (error) throw toAccountError(error, status);
        return (data as SharedExample | null) ?? null;
      }),

    ...supabaseLessonLists(client, userId),
  };
}
