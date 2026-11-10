import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, setLesson, type Progress } from '../progress/progress';
import { laterRelease } from '../releases';
import { AccountError, type AccountBackend, type AccountUser } from './backend';
import { createFakeBackend, createFakeServer, type FakeBackend, type FakeServer } from './fake';
import { AccountSync, type LocalCopy } from './sync.svelte';
import {
  canonical,
  emptySynced,
  mergePrefStamps,
  mergeSynced,
  parsePrefStamps,
  parseSynced,
  PREF_KEYS,
  type PrefStamps,
  type Synced,
} from './sync-merge';

const T0 = Date.parse('2026-11-10T09:00:00.000Z');
const at = (n: number) => new Date(T0 + n * 1000).toISOString();
const RELEASES = ['2026-11-08-wave-7', '2026-11-09-wave-8', '2026-11-10-features'];

describe('merging settings', () => {
  const values = {
    theme: ['auto', 'light', 'dark', 'contrast'],
    speed: [0.25, 1, 4],
    detail: [1, 2, 3],
    codeView: ['formal', 'python'],
    tab: ['learn', 'practice'],
  };
  const stamps: fc.Arbitrary<PrefStamps> = fc.record(
    Object.fromEntries(
      PREF_KEYS.map((k) => [
        k,
        fc.record({
          value: fc.constantFrom(...values[k]),
          at: fc.integer({ min: 0, max: 4 }).map(at),
        }),
      ]),
    ) as Record<keyof PrefStamps, fc.Arbitrary<{ value: unknown; at: string }>>,
    { requiredKeys: [] },
  );

  it('keeps the later choice per setting, whichever copy comes first', () => {
    fc.assert(
      fc.property(stamps, stamps, stamps, (a, b, c) => {
        const ab = mergePrefStamps(a, b);
        expect(canonical(ab)).toBe(canonical(mergePrefStamps(b, a)));
        expect(canonical(mergePrefStamps(ab, c))).toBe(
          canonical(mergePrefStamps(a, mergePrefStamps(b, c))),
        );
        expect(canonical(mergePrefStamps(a, a))).toBe(canonical(a));
        for (const k of PREF_KEYS) {
          const times = [a[k], b[k]].filter(Boolean).map((s) => Date.parse(s!.at));
          if (times.length) expect(Date.parse(ab[k]!.at)).toBe(Math.max(...times));
          else expect(ab[k]).toBeUndefined();
        }
      }),
    );
  });

  it('drops what an account should not hold', () => {
    expect(
      parsePrefStamps({
        theme: { value: 'dark', at: at(1) },
        speed: { value: 3, at: at(1) },
        detail: { value: 2, at: 'yesterday' },
        tab: { value: 'learn' },
        codeView: 'python',
        colour: { value: 'red', at: at(1) },
      }),
    ).toEqual({ theme: { value: 'dark', at: at(1) } });
    expect(parsePrefStamps(null)).toEqual({});
    expect(parsePrefStamps([{ theme: 'dark' }])).toEqual({});
    expect(parseSynced({ prefs: 'x', progress: [], lastRelease: 'Wave 7' })).toEqual(emptySynced());
  });

  it('compares content, not key order', () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
    expect(canonical({ a: 1, b: undefined })).toBe(canonical({ a: 1 }));
  });
});

/** A browser: its copy of the data, kept in memory. */
function browser(start: Synced = emptySynced()) {
  let data = structuredClone(start);
  const local: LocalCopy = {
    read: () => structuredClone(data),
    apply: (merged) => {
      data = structuredClone(merged);
    },
  };
  return {
    local,
    get data() {
      return data;
    },
    change(fn: (d: Synced) => Synced) {
      data = fn(structuredClone(data));
    },
  };
}

/** A browser signed in to the shared account on `server`, with its own sync. */
function device(server: FakeServer, start?: Synced, delay = 1000) {
  const backend = createFakeBackend(server);
  const user = backend.signInAs('reader@example.com');
  const b = browser(start);
  const sync = new AccountSync(async () => backend, b.local, delay);
  return { backend, user, browser: b, sync };
}

const withLesson = (d: Synced, slug: string, done: boolean, t: number): Synced => ({
  ...d,
  progress: setLesson(d.progress, 'stack-array', slug, done, at(t)),
});
const withPref = (d: Synced, key: keyof PrefStamps, value: unknown, t: number): Synced => ({
  ...d,
  prefs: { ...d.prefs, [key]: { value, at: at(t) } },
});

afterEach(() => vi.useRealTimers());

describe('syncing with the account', () => {
  let server: FakeServer;
  beforeEach(() => {
    server = createFakeServer();
  });

  it('on sign-in, merges the account into the browser and the browser into the account', async () => {
    const first = device(
      server,
      withLesson(withPref(emptySynced(), 'theme', 'dark', 5), 'idea', true, 5),
    );
    first.sync.userChanged(first.user);
    await first.sync.idle();
    expect(first.sync.status).toBe('saved');

    const start = withPref(withPref(emptySynced(), 'theme', 'light', 1), 'speed', 2, 9);
    const second = device(server, withLesson(start, 'push', true, 7));
    second.sync.userChanged(second.user);
    await second.sync.idle();
    // The later theme (dark) comes from the account; the speed and lesson go up to it.
    expect(second.browser.data.prefs.theme?.value).toBe('dark');
    expect(second.browser.data.prefs.speed?.value).toBe(2);
    expect(Object.keys(second.browser.data.progress.pages['stack-array']!.lessons).sort()).toEqual([
      'idea',
      'push',
    ]);
    const row = server.preferences.get(second.user.id)!;
    expect(canonical(parseSynced(row))).toBe(canonical(second.browser.data));
  });

  it('writes changes a few seconds later, once for a burst', async () => {
    vi.useFakeTimers();
    const d = device(server, undefined, 3000);
    d.sync.userChanged(d.user);
    await d.sync.idle();
    // Nothing to keep yet: no row is made for an empty copy.
    expect(server.preferences.size).toBe(0);
    for (let i = 0; i < 3; i++) {
      d.browser.change((x) => withLesson(x, `l${i}`, true, i));
      d.sync.changed();
      vi.advanceTimersByTime(1000);
    }
    expect(d.backend.preferenceWrites).toHaveLength(0);
    vi.advanceTimersByTime(2000);
    await d.sync.idle();
    expect(d.backend.preferenceWrites).toEqual([{ owner: d.user.id, accepted: true }]);
    expect(Object.keys(server.preferences.get(d.user.id)!.progress as object)).toContain('pages');
  });

  it('writes a waiting change at once when the page is hidden', async () => {
    const d = device(server, undefined, 60_000);
    d.sync.userChanged(d.user);
    await d.sync.idle();
    d.browser.change((x) => withPref(x, 'tab', 'practice', 1));
    d.sync.changed();
    await d.sync.flush();
    expect((server.preferences.get(d.user.id)!.prefs as PrefStamps).tab?.value).toBe('practice');
  });

  it('does nothing signed out', async () => {
    const backend = createFakeBackend(server);
    const b = browser(withPref(emptySynced(), 'theme', 'dark', 1));
    let asked = 0;
    const sync = new AccountSync(async () => (asked++, backend), b.local, 0);
    sync.changed();
    await sync.flush();
    await sync.idle();
    expect(asked).toBe(0);
    expect(sync.status).toBe('off');
    expect(server.preferences.size).toBe(0);
  });

  it('two tabs writing at once both land: a refused write reads, merges and tries again', async () => {
    const a = device(server);
    const b = device(server);
    a.sync.userChanged(a.user);
    b.sync.userChanged(b.user);
    await Promise.all([a.sync.idle(), b.sync.idle()]);
    a.browser.change((x) => withPref(x, 'theme', 'dark', 3));
    b.browser.change((x) => withLesson(x, 'idea', true, 4));
    a.sync.changed();
    b.sync.changed();
    await Promise.all([a.sync.flush(), b.sync.flush()]);
    expect(
      a.backend.preferenceWrites.some((w) => !w.accepted) ||
        b.backend.preferenceWrites.some((w) => !w.accepted),
    ).toBe(true);
    await a.sync.refresh(true);
    const row = parseSynced(server.preferences.get(a.user.id)!);
    expect(row.prefs.theme?.value).toBe('dark');
    expect(row.progress.pages['stack-array']?.lessons.idea?.done).toBe(true);
    expect(canonical(a.browser.data)).toBe(canonical(row));
  });

  it('keeps an email choice made elsewhere when this tab writes something else', async () => {
    const a = device(server);
    const b = device(server);
    a.sync.userChanged(a.user);
    b.sync.userChanged(b.user);
    await Promise.all([a.sync.idle(), b.sync.idle()]);
    await a.sync.setNotifyNewPages(true);
    expect(server.preferences.get(a.user.id)?.notifyNewPages).toBe(true);
    // b still has the old row; its write is refused, it reads again and keeps the opt-in.
    b.browser.change((x) => withLesson(x, 'idea', true, 1));
    b.sync.changed();
    await b.sync.flush();
    expect(server.preferences.get(a.user.id)?.notifyNewPages).toBe(true);
    expect(b.sync.notifyNewPages).toBe(true);
    // The platform's unsubscribe link turns it off; the next write keeps that too.
    server.preferences.get(a.user.id)!.notifyNewPages = false;
    server.preferences.get(a.user.id)!.updatedAt = at(500);
    a.browser.change((x) => withPref(x, 'speed', 4, 2));
    a.sync.changed();
    await a.sync.flush();
    expect(server.preferences.get(a.user.id)?.notifyNewPages).toBe(false);
    expect(a.sync.notifyNewPages).toBe(false);
  });

  it('puts the email choice back when it cannot be saved', async () => {
    const d = device(server);
    d.sync.userChanged(d.user);
    await d.sync.idle();
    d.backend.failWith = 'unreachable';
    await expect(d.sync.setNotifyNewPages(true)).rejects.toThrow(AccountError);
    expect(d.sync.notifyNewPages).toBe(false);
    expect(d.sync.status).toBe('offline');
    expect(d.sync.problem).toMatch(/Could not reach/);
    // The next change, with the server back, goes through.
    d.backend.failWith = null;
    await d.sync.setNotifyNewPages(true);
    expect(d.sync.status).toBe('saved');
  });

  it('stays quiet when the database has no preferences table yet', async () => {
    const fake = createFakeBackend(server);
    const user = fake.signInAs('reader@example.com');
    let reads = 0;
    const missing: AccountBackend = {
      ...fake,
      readPreferences: async () => {
        reads++;
        throw new AccountError('unavailable');
      },
    };
    const b = browser(withPref(emptySynced(), 'theme', 'dark', 1));
    const sync = new AccountSync(async () => missing, b.local, 0);
    sync.userChanged(user);
    await sync.idle();
    expect(sync.status).toBe('unavailable');
    expect(sync.problem).toBe('');
    sync.changed();
    await sync.flush();
    expect(reads).toBe(1);
    expect(b.data.prefs.theme?.value).toBe('dark');
  });

  it('ignores an answer that comes back after signing out', async () => {
    const fake = createFakeBackend(server);
    const user: AccountUser = fake.signInAs('reader@example.com');
    server.preferences.set(user.id, {
      prefs: { theme: { value: 'dark', at: at(9) } },
      progress: emptyProgress(),
      lastRelease: null,
      notifyNewPages: false,
      updatedAt: at(9),
    });
    let release: () => void = () => {};
    let reading = false;
    const slow: AccountBackend = {
      ...fake,
      readPreferences: async () => {
        reading = true;
        await new Promise<void>((r) => (release = r));
        return fake.readPreferences();
      },
    };
    const b = browser();
    const sync = new AccountSync(async () => slow, b.local, 0);
    sync.userChanged(user);
    await vi.waitFor(() => expect(reading).toBe(true));
    sync.userChanged(null);
    release();
    await sync.idle();
    expect(b.data.prefs.theme).toBeUndefined();
    expect(sync.status).toBe('off');
  });

  it('two devices end up the same after any mix of changes and syncs', async () => {
    type Cmd =
      | { kind: 'pref'; dev: 0 | 1; key: 'theme' | 'speed'; pick: number }
      | { kind: 'lesson'; dev: 0 | 1; slug: string; done: boolean }
      | { kind: 'seen'; dev: 0 | 1; release: number }
      | { kind: 'sync'; dev: 0 | 1 }
      | { kind: 'both' };
    const dev = fc.constantFrom<0 | 1>(0, 1);
    const cmd: fc.Arbitrary<Cmd> = fc.oneof(
      fc.record({
        kind: fc.constant('pref' as const),
        dev,
        key: fc.constantFrom('theme' as const, 'speed' as const),
        pick: fc.nat(2),
      }),
      fc.record({
        kind: fc.constant('lesson' as const),
        dev,
        slug: fc.constantFrom('a', 'b', 'c'),
        done: fc.boolean(),
      }),
      fc.record({ kind: fc.constant('seen' as const), dev, release: fc.nat(2) }),
      fc.record({ kind: fc.constant('sync' as const), dev }),
      fc.record({ kind: fc.constant('both' as const) }),
    );
    const choices = { theme: ['light', 'dark', 'contrast'], speed: [0.5, 2, 4] };

    await fc.assert(
      fc.asyncProperty(fc.array(cmd, { maxLength: 25 }), async (cmds) => {
        const srv = createFakeServer();
        const devices = [device(srv), device(srv)];
        for (const d of devices) d.sync.userChanged(d.user);
        await Promise.all(devices.map((d) => d.sync.idle()));
        // What the end state must hold: the latest of every change.
        let clock = 0;
        const latest = new Map<string, unknown>();
        let progress: Progress = emptyProgress();
        let seenMax = -1;
        for (const c of cmds) {
          if (c.kind === 'both') {
            for (const d of devices) d.sync.changed();
            await Promise.all(devices.map((d) => d.sync.flush()));
            continue;
          }
          const d = devices[c.dev]!;
          if (c.kind === 'sync') {
            d.sync.changed();
            await d.sync.flush();
          } else if (c.kind === 'pref') {
            const value = choices[c.key][c.pick];
            const t = ++clock;
            d.browser.change((x) => withPref(x, c.key, value, t));
            latest.set(c.key, value);
          } else if (c.kind === 'lesson') {
            const t = ++clock;
            d.browser.change((x) => withLesson(x, c.slug, c.done, t));
            progress = setLesson(progress, 'stack-array', c.slug, c.done, at(t));
          } else {
            // As markSeen does: the last release seen only moves forward.
            d.browser.change((x) => ({
              ...x,
              lastRelease: laterRelease(x.lastRelease, RELEASES[c.release]!),
            }));
            seenMax = Math.max(seenMax, c.release);
          }
        }
        // Each device syncs once more, then reads the account afresh.
        for (const d of devices) {
          d.sync.changed();
          await d.sync.flush();
        }
        for (const d of devices) await d.sync.refresh(true);
        const [a, b] = devices.map((d) => d.browser.data);
        const row = parseSynced(srv.preferences.get(devices[0]!.user.id) ?? emptySynced());
        expect(canonical(a)).toBe(canonical(b));
        expect(canonical(a)).toBe(canonical(row));
        for (const [key, value] of latest) expect(a!.prefs[key as 'theme']?.value).toBe(value);
        expect(canonical(a!.progress)).toBe(canonical(progress));
        expect(a!.lastRelease).toBe(seenMax < 0 ? null : RELEASES[seenMax]);
      }),
      { numRuns: 150 },
    );
  });
});

describe('the merged copy', () => {
  it('is what each copy would get from the other', () => {
    const a = withLesson(withPref(emptySynced(), 'theme', 'dark', 2), 'x', true, 1);
    const b = { ...withPref(emptySynced(), 'theme', 'light', 1), lastRelease: RELEASES[1]! };
    const m = mergeSynced(a, b);
    expect(m.prefs.theme?.value).toBe('dark');
    expect(m.lastRelease).toBe(RELEASES[1]);
    expect(canonical(mergeSynced(b, a))).toBe(canonical(m));
  });
});

// The fake keeps the database's rules for this table too.
describe('fake preferences', () => {
  let fake: FakeBackend;
  beforeEach(() => {
    fake = createFakeBackend();
    fake.signInAs('a@example.com');
  });
  const fields = { prefs: {}, progress: emptyProgress(), lastRelease: null, notifyNewPages: false };

  it('writes only on top of the copy read', async () => {
    const first = await fake.writePreferences(fields, null);
    expect(first).not.toBeNull();
    expect(await fake.writePreferences(fields, null)).toBeNull();
    const second = await fake.writePreferences(fields, first!.updatedAt);
    expect(second!.updatedAt > first!.updatedAt).toBe(true);
    expect(await fake.writePreferences(fields, first!.updatedAt)).toBeNull();
  });

  it('deletes only this reader’s data', async () => {
    await fake.writePreferences(fields, null);
    await fake.createExample({ viz: 'bst', title: 'mine', example: {} });
    const other = createFakeBackend(fake.server);
    other.signInAs('b@example.com');
    await other.writePreferences(fields, null);
    await other.createExample({ viz: 'bst', title: 'theirs', example: {} });
    await fake.deleteMyData();
    expect(await fake.readPreferences()).toBeNull();
    expect(await fake.listExamples('bst')).toEqual([]);
    expect(await other.readPreferences()).not.toBeNull();
    expect((await other.listExamples('bst')).map((e) => e.title)).toEqual(['theirs']);
  });
});
