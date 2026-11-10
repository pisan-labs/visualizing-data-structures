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
  type AccountUser,
} from './backend';

interface StoredRow extends AccountExample {
  owner: string;
}

export interface FakeBackend extends AccountBackend {
  /** Sign in as this email (as if the reader followed the link). */
  signInAs(email: string): AccountUser;
  /** Every later call fails with this kind of error until it is set back to null. */
  failWith: AccountErrorKind | null;
  /** Emails a sign-in link was sent to, in order. */
  readonly linksSent: { email: string; returnTo: string }[];
  /** Where "Continue with Google" would have gone. */
  readonly googleReturns: string[];
  /** Every row of every account, for checks. */
  readonly rows: StoredRow[];
}

export function createFakeBackend(): FakeBackend {
  let user: AccountUser | null = null;
  const listeners = new Set<(u: AccountUser | null) => void>();
  const rows: StoredRow[] = [];
  const users = new Map<string, AccountUser>();
  let ids = 0;
  let clock = Date.parse('2026-11-10T09:00:00Z');
  const now = () => new Date((clock += 1000)).toISOString();
  const newId = () => `00000000-0000-4000-8000-${(++ids).toString(16).padStart(12, '0')}`;

  const setUser = (u: AccountUser | null) => {
    user = u;
    for (const l of listeners) l(u);
  };

  const fake: FakeBackend = {
    failWith: null,
    linksSent: [],
    googleReturns: [],
    rows,

    signInAs(email) {
      const u = users.get(email) ?? { id: `user-${users.size + 1}`, email };
      users.set(email, u);
      setUser(u);
      return u;
    },

    async sendSignInLink(email, returnTo) {
      check();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError('email');
      fake.linksSent.push({ email, returnTo });
    },

    async signInWithGoogle(returnTo) {
      check();
      fake.googleReturns.push(returnTo);
    },

    async completeSignIn(ret) {
      check();
      if (ret.kind === 'error')
        throw new AccountError('link', `Sign-in did not work: ${ret.description}`);
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
