/**
 * An in-memory account service for unit tests. It keeps the rules the database keeps (each
 * reader sees only their own rows, anyone may read a shared row, field limits, at most
 * MAX_EXAMPLES per account), and can be made to fail like an unreachable project.
 */
import {
  AccountError,
  isExampleId,
  LIMITS,
  MAX_EXAMPLES,
  type AccountBackend,
  type AccountErrorKind,
  type AccountExample,
  type AccountPreferences,
  type AccountUser,
  type LinkAnswer,
} from './backend';
import { fakeLessonLists, type FakeListStore } from './lists-fake';

interface StoredRow extends AccountExample {
  owner: string;
}

/**
 * The stored side, which several fakes can share: two browsers (or two tabs) signed in to one
 * account each get their own fake backed by one server.
 */
export interface FakeServer {
  rows: StoredRow[];
  /** app_stepwise.preferences, by owner. */
  preferences: Map<string, AccountPreferences>;
  users: Map<string, AccountUser>;
  ids: number;
  clock: number;
}

export function createFakeServer(): FakeServer {
  return {
    rows: [],
    preferences: new Map(),
    users: new Map(),
    ids: 0,
    clock: Date.parse('2026-11-10T09:00:00Z'),
  };
}

export interface FakeBackend extends AccountBackend {
  /** Sign in as this email (as if the reader followed the link). */
  signInAs(email: string): AccountUser;
  /** Every later call fails with this kind of error until it is set back to null. */
  failWith: AccountErrorKind | null;
  /** Emails a sign-in link was sent to, in order. */
  readonly linksSent: { email: string; returnTo: string; turnstileToken?: string }[];
  /** What the next sign-in-link requests answer instead of "sent", in order. */
  readonly linkAnswers: LinkAnswer[];
  /** Every preferences write that reached the server (refused ones included). */
  readonly preferenceWrites: { owner: string; accepted: boolean }[];
  readonly server: FakeServer;
  /** Where "Continue with Google" would have gone. */
  readonly googleReturns: string[];
  /** Every row of every account, for checks. */
  readonly rows: StoredRow[];
  /** Every lesson list and item of every account, for checks. */
  readonly lessonLists: FakeListStore;
}

export function createFakeBackend(server: FakeServer = createFakeServer()): FakeBackend {
  let user: AccountUser | null = null;
  const listeners = new Set<(u: AccountUser | null) => void>();
  const { rows, users } = server;
  const now = () => new Date((server.clock += 1000)).toISOString();
  const newId = () => `00000000-0000-4000-8000-${(++server.ids).toString(16).padStart(12, '0')}`;

  const setUser = (u: AccountUser | null) => {
    user = u;
    for (const l of listeners) l(u);
  };

  const fake: FakeBackend = {
    failWith: null,
    linksSent: [],
    linkAnswers: [],
    preferenceWrites: [],
    googleReturns: [],
    rows,
    server,

    signInAs(email) {
      const u = users.get(email) ?? { id: `user-${users.size + 1}`, email };
      users.set(email, u);
      setUser(u);
      return u;
    },

    async sendSignInLink(email, returnTo, turnstileToken) {
      check();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError('email');
      const answer = fake.linkAnswers.shift() ?? { status: 'sent' };
      if (answer.status === 'sent')
        fake.linksSent.push({ email, returnTo, ...(turnstileToken ? { turnstileToken } : {}) });
      return answer;
    },

    async signInWithGoogle(returnTo) {
      check();
      fake.googleReturns.push(returnTo);
    },

    async completeSignIn(ret) {
      check();
      if (ret.kind === 'error')
        throw new AccountError('link', `Sign-in did not work: ${ret.description}`);
      if (ret.kind === 'token' && ret.tokenHash === 'used') throw new AccountError('link');
      return fake.signInAs('returned@example.com');
    },

    async signOut() {
      setUser(null);
    },

    async currentUser() {
      check();
      return user;
    },

    onUserChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async listExamples(viz) {
      const me = signedIn();
      return rows
        .filter((r) => r.owner === me.id && r.viz === viz)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(publicRow);
    },

    async createExample(input) {
      const me = signedIn();
      if (rows.filter((r) => r.owner === me.id).length >= MAX_EXAMPLES)
        throw new AccountError('full');
      const row: StoredRow = {
        id: newId(),
        owner: me.id,
        viz: input.viz,
        title: input.title,
        notes: input.notes ?? '',
        example: structuredClone(input.example),
        shared: input.shared ?? false,
        createdAt: now(),
        updatedAt: now(),
      };
      limits(row);
      rows.push(row);
      return publicRow(row);
    },

    async updateExample(id, patch) {
      const me = signedIn();
      const row = rows.find((r) => r.id === id && r.owner === me.id);
      if (!row) throw new AccountError('missing');
      const next = { ...row, ...structuredClone(patch), updatedAt: now() };
      limits(next);
      Object.assign(row, next);
      return publicRow(row);
    },

    async deleteExample(id) {
      const me = signedIn();
      const i = rows.findIndex((r) => r.id === id && r.owner === me.id);
      if (i < 0) throw new AccountError('missing');
      rows.splice(i, 1);
    },

    async readSharedExample(id) {
      check();
      if (!isExampleId(id)) return null;
      // Like the database function: shared rows only, and only their content.
      const row = rows.find((r) => r.id === id && r.shared);
      return row
        ? structuredClone({
            viz: row.viz,
            title: row.title,
            notes: row.notes,
            example: row.example,
          })
        : null;
    },

    ...fakeLessonLists({ me: signedIn, check, user: () => user, examples: rows, now, newId }),

    async readPreferences() {
      const me = signedIn();
      const row = server.preferences.get(me.id);
      return row ? structuredClone(row) : null;
    },

    async writePreferences(fields, seen) {
      const me = signedIn();
      const row = server.preferences.get(me.id) ?? null;
      // Compare and swap, as the database does it: only on top of the copy that was read.
      const accepted = seen === null ? row === null : row?.updatedAt === seen;
      fake.preferenceWrites.push({ owner: me.id, accepted });
      if (!accepted) return null;
      const size = (v: unknown) => JSON.stringify(v).length;
      if (size(fields.prefs) > 4096 || size(fields.progress) > 524_288)
        throw new AccountError('large');
      const next: AccountPreferences = { ...structuredClone(fields), updatedAt: now() };
      server.preferences.set(me.id, next);
      return structuredClone(next);
    },

    async deleteMyData() {
      const me = signedIn();
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.owner === me.id) rows.splice(i, 1);
      server.preferences.delete(me.id);
    },
  };

  function check() {
    if (fake.failWith) throw new AccountError(fake.failWith);
  }

  function signedIn(): AccountUser {
    check();
    if (!user) throw new AccountError('expired');
    return user;
  }

  function limits(row: StoredRow) {
    if (
      row.title.length > LIMITS.title ||
      row.notes.length > LIMITS.notes ||
      JSON.stringify(row.example).length > LIMITS.exampleBytes
    )
      throw new AccountError('large');
  }

  function publicRow({ owner: _owner, ...rest }: StoredRow): AccountExample {
    return structuredClone(rest);
  }

  return fake;
}
