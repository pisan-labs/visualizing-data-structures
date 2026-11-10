/**
 * The sync as the app wires it: this browser's settings (src/ui/state.svelte.ts), progress and
 * last release seen, against the fake account; and "Delete my StepWise data".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, setLesson } from '../progress/progress';
import { latestRelease } from '../releases';
import { applySeen, clearSeen, markSeen, noteFirstVisit, seen } from '../ui/new-since.svelte';
import { progress } from '../ui/progress.svelte';
import { prefs, setPref } from '../ui/state.svelte';
import { account, connect, useBackendForTests } from './account.svelte';
import { createFakeBackend, type FakeBackend } from './fake';
import { deleteMyData, sync } from './sync.svelte';
import type { PrefStamps } from './sync-merge';

const at = (n: number) => new Date(Date.parse('2026-11-10T09:00:00.000Z') + n * 1000).toISOString();

/** A Storage that lives in memory (Node has no localStorage). */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

let fake: FakeBackend;
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  fake = createFakeBackend();
  useBackendForTests(fake);
  clearSeen();
  progress.clear();
});
afterEach(() => {
  sync.stop();
  useBackendForTests(null);
  vi.unstubAllGlobals();
});

describe('preferences and progress in the app', () => {
  it('takes the account’s copy on sign-in, then deletes everything on request', async () => {
    // This browser: a theme chosen before times were kept, a release seen, an example copied.
    localStorage.setItem('stepwise:theme', '"light"');
    localStorage.setItem('stepwise:last-release', '"2026-11-08-wave-7"');
    localStorage.setItem(
      'stepwise:account-copied',
      JSON.stringify({ 'user-1': ['k1'], 'user-9': ['k2'] }),
    );
    localStorage.setItem('stepwise:library', '[]');
    await connect();
    const user = fake.signInAs('a@example.com');
    expect(account.user?.id).toBe('user-1');
    fake.server.preferences.set(user.id, {
      prefs: { theme: { value: 'dark', at: at(1) }, detail: { value: 3, at: at(1) } },
      progress: setLesson(emptyProgress(), 'bst', 'idea', true, at(1)),
      lastRelease: '2026-11-09-wave-8',
      notifyNewPages: true,
      updatedAt: at(1),
    });
    await fake.createExample({ viz: 'bst', title: 'mine', example: {} });

    sync.userChanged(user);
    await sync.idle();
    expect(prefs.theme).toBe('dark');
    expect(prefs.detail).toBe(3);
    expect(localStorage.getItem('stepwise:theme')).toBe('"dark"');
    expect(seen.last).toBe('2026-11-09-wave-8');
    expect(progress.current.pages.bst?.lessons.idea?.done).toBe(true);
    expect(sync.notifyNewPages).toBe(true);
    // A setting changed here goes up a few seconds later (now, as the page is hidden).
    setPref('speed', 2);
    sync.changed();
    await sync.flush();
    expect((fake.server.preferences.get(user.id)!.prefs as PrefStamps).speed?.value).toBe(2);

    await deleteMyData();
    expect(fake.server.preferences.size).toBe(0);
    expect(fake.rows).toEqual([]);
    expect(account.user).toBeNull();
    expect(prefs.theme).toBe('auto');
    expect(prefs.detail).toBe(2);
    for (const key of ['theme', 'speed', 'detail', 'pref-times', 'progress', 'last-release'])
      expect(localStorage.getItem(`stepwise:${key}`), key).toBeNull();
    expect(JSON.parse(localStorage.getItem('stepwise:account-copied')!)).toEqual({
      'user-9': ['k2'],
    });
    // Examples saved in this browser only are not the account's: they stay.
    expect(localStorage.getItem('stepwise:library')).toBe('[]');
    expect(seen.last).toBeNull();
    expect(progress.current.pages).toEqual({});
  });

  it('changes nothing when the delete fails, and syncs on', async () => {
    await connect();
    const user = fake.signInAs('a@example.com');
    sync.userChanged(user);
    setPref('tab', 'practice');
    sync.changed();
    await sync.flush();
    expect(fake.server.preferences.has(user.id)).toBe(true);
    fake.failWith = 'unreachable';
    await expect(deleteMyData()).rejects.toThrow(/Could not reach/);
    expect(account.user?.id).toBe(user.id);
    expect(localStorage.getItem('stepwise:tab')).toBe('"practice"');
    fake.failWith = null;
    await sync.idle();
    expect(fake.server.preferences.has(user.id)).toBe(true);
  });
});

describe('the last release seen', () => {
  it('records the latest on a first visit, after the account has had its say', async () => {
    let settle: () => void = () => {};
    const settled = new Promise<void>((r) => (settle = r));
    const first = noteFirstVisit(settled);
    // The account knew an older one: that wins over "first visit".
    applySeen('2026-11-08-wave-7');
    settle();
    await first;
    expect(seen.last).toBe('2026-11-08-wave-7');

    clearSeen();
    await noteFirstVisit(Promise.resolve());
    expect(seen.last).toBe(latestRelease().id);
    expect(localStorage.getItem('stepwise:last-release')).toBe(JSON.stringify(latestRelease().id));
    // It only moves forward.
    markSeen('2026-11-08-wave-7');
    expect(seen.last).toBe(latestRelease().id);
  });
});
