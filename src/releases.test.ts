import { describe, expect, it } from 'vitest';
import {
  isReleaseId,
  latestRelease,
  laterRelease,
  RELEASE_ID,
  releases,
  releasesSince,
  type Release,
} from './releases';
import { families } from './viz/catalog';
import { liveIds } from './viz/registry';

describe('the list of releases', () => {
  it('has unique, well-formed ids that start with their date', () => {
    const ids = releases.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of releases) {
      expect(r.id).toMatch(RELEASE_ID);
      expect(isReleaseId(r.id)).toBe(true);
      // The database keeps the id too (app_stepwise.preferences.last_release).
      expect(r.id).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
      expect(r.id.startsWith(`${r.date}-`)).toBe(true);
      expect(new Date(`${r.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(r.date);
    }
  });

  it('keeps the ids already published', () => {
    // Readers' browsers and accounts hold these: never rename one.
    expect(releases.slice(0, 3).map((r) => r.id)).toEqual([
      '2026-11-08-wave-7',
      '2026-11-09-wave-8',
      '2026-11-10-features',
    ]);
  });

  it('is in date order, oldest first', () => {
    const dates = releases.map((r) => r.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('names only pages that exist, each in one release', () => {
    const titled = new Set(families.flatMap((f) => f.items.map((i) => i.id)));
    const all = releases.flatMap((r) => r.pages);
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) {
      expect(liveIds, id).toContain(id);
      expect(titled.has(id), id).toBe(true);
    }
  });

  it('says what each release has in a title and one line', () => {
    for (const r of releases) {
      expect(r.title.trim().length).toBeGreaterThan(0);
      expect(r.title.length).toBeLessThanOrEqual(80);
      expect(r.note.trim().length).toBeGreaterThan(0);
      expect(r.note).not.toMatch(/\n/);
      expect(r.note.length).toBeLessThanOrEqual(240);
    }
    // The counts in the titles match the lists.
    for (const r of releases) {
      const n = /^(\d+) new pages/.exec(r.title)?.[1];
      if (n) expect(r.pages.length, r.id).toBe(Number(n));
    }
  });
});

describe('new since the last visit', () => {
  const list: Release[] = [
    { id: '2026-01-01-a', date: '2026-01-01', title: 'A', note: 'a', pages: [] },
    { id: '2026-01-02-z', date: '2026-01-02', title: 'Z', note: 'z', pages: [] },
    { id: '2026-01-02-b', date: '2026-01-02', title: 'B', note: 'b', pages: [] },
    { id: '2026-01-03-c', date: '2026-01-03', title: 'C', note: 'c', pages: [] },
  ];
  const ids = (rs: Release[]) => rs.map((r) => r.id);

  it('lists the releases after the last one seen, newest first', () => {
    expect(ids(releasesSince('2026-01-01-a', list))).toEqual([
      '2026-01-03-c',
      '2026-01-02-b',
      '2026-01-02-z',
    ]);
    // Same day: the list's order, not the alphabet.
    expect(ids(releasesSince('2026-01-02-z', list))).toEqual(['2026-01-03-c', '2026-01-02-b']);
    expect(releasesSince('2026-01-03-c', list)).toEqual([]);
  });

  it('shows nothing on a first visit or for a malformed id', () => {
    expect(releasesSince(null, list)).toEqual([]);
    expect(releasesSince('Wave 7', list)).toEqual([]);
    expect(releasesSince('', list)).toEqual([]);
  });

  it('places an id from a newer build after the known ones of its day', () => {
    expect(ids(releasesSince('2026-01-02-new', list))).toEqual(['2026-01-03-c']);
    expect(releasesSince('2027-05-05-later', list)).toEqual([]);
    expect(ids(releasesSince('2025-12-31-older', list))).toHaveLength(4);
  });

  it('keeps the later of two ids, the same either way round', () => {
    const cases: [string | null, string | null, string | null][] = [
      ['2026-01-01-a', '2026-01-03-c', '2026-01-03-c'],
      ['2026-01-02-z', '2026-01-02-b', '2026-01-02-b'],
      ['2026-01-02-b', '2026-01-02-new', '2026-01-02-new'],
      [null, '2026-01-01-a', '2026-01-01-a'],
      ['bad id', '2026-01-01-a', '2026-01-01-a'],
      [null, null, null],
    ];
    for (const [a, b, want] of cases) {
      expect(laterRelease(a, b, list)).toBe(want);
      expect(laterRelease(b, a, list)).toBe(want);
    }
    expect(latestRelease(list).id).toBe('2026-01-03-c');
    expect(latestRelease().id).toBe(releases[releases.length - 1]!.id);
  });
});
