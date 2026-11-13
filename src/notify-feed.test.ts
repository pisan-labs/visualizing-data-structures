import { describe, expect, it } from 'vitest';
import {
  NOTIFY_ID,
  NOTIFY_MAX_BYTES,
  NOTIFY_MAX_ITEMS,
  NOTIFY_MAX_SUMMARY,
  NOTIFY_MAX_TITLE,
  notifyFeed,
} from './notify-feed';
import { releases, type Release } from './releases';
import { SITE_URL } from './site';

describe('the notify feed', () => {
  const feed = notifyFeed(releases);
  const text = JSON.stringify(feed, null, 2);

  it('follows the platform rules', () => {
    expect(feed.app).toBe('stepwise');
    expect(feed.items.length).toBeGreaterThan(0);
    expect(feed.items.length).toBeLessThanOrEqual(NOTIFY_MAX_ITEMS);
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(NOTIFY_MAX_BYTES);
    for (const it of feed.items) {
      expect(Object.keys(it).sort()).toEqual(['date', 'id', 'summary', 'title', 'url']);
      expect(it.id).toMatch(NOTIFY_ID);
      expect(it.title.length).toBeGreaterThan(0);
      expect(it.title.length).toBeLessThanOrEqual(NOTIFY_MAX_TITLE);
      expect(it.summary.length).toBeLessThanOrEqual(NOTIFY_MAX_SUMMARY);
      expect(it.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Plain text: nothing the platform would escape and show literally.
      for (const s of [it.title, it.summary]) {
        expect(s).not.toMatch(/[<>]|&\w+;|&#/);
        expect(s).not.toMatch(/\n/);
      }
      const u = new URL(it.url);
      expect(u.protocol).toBe('https:');
      expect(u.host).toBe('stepwise.hintwise.org');
      expect(u.port).toBe('');
      expect(it.url.startsWith(`${SITE_URL}/`)).toBe(true);
      expect(it.url).not.toMatch(/[?#]/);
    }
  });

  it('has unique ids that match releases.json, newest first', () => {
    const ids = feed.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(releases.map((r) => r.id).reverse());
    const dates = feed.items.map((i) => i.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('sends each release to a page that opens it', () => {
    const wave7 = feed.items.find((i) => i.id === '2026-11-08-wave-7')!;
    expect(wave7.url).toBe(`${SITE_URL}/${releases[0]!.pages[0]}/`);
    // A release with no new pages opens the home page.
    expect(feed.items.find((i) => i.id === '2026-11-10-features')!.url).toBe(`${SITE_URL}/`);
  });

  it('turns markup and long text into plain, bounded text, and keeps the newest 100', () => {
    const many: Release[] = Array.from({ length: 120 }, (_, n) => ({
      id: `2026-01-01-r${n}`,
      date: '2026-01-01',
      title: n === 119 ? '<b>Tom & Jerry</b>' : 'x'.repeat(300),
      note: 'y'.repeat(900),
      pages: [],
    }));
    const f = notifyFeed(many);
    expect(f.items).toHaveLength(100);
    expect(f.items[0]!.id).toBe('2026-01-01-r119');
    expect(f.items[0]!.title.length).toBeLessThanOrEqual(NOTIFY_MAX_TITLE);
    expect(f.items[0]!.summary.length).toBeLessThanOrEqual(NOTIFY_MAX_SUMMARY);
    expect(f.items[0]!.title).toBe('Tom and Jerry');
    expect(f.items[99]!.id).toBe('2026-01-01-r20');
  });
});
