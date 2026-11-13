/**
 * The feed for the platform's daily opt-in email about new releases (app-notify), written to
 * dist/notify-feed.json by scripts/prerender.mjs from the same list as dist/releases.json.
 * The platform refuses or skips anything that breaks its rules: plain text only, newest first,
 * stable ids, https addresses on this site with no query string.
 */
import { SITE_URL } from './site';
import type { Release } from './releases';

export interface NotifyItem {
  id: string;
  title: string;
  url: string;
  date: string;
  summary: string;
}

export interface NotifyFeed {
  app: 'stepwise';
  items: NotifyItem[];
}

export const NOTIFY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const NOTIFY_MAX_ITEMS = 100;
export const NOTIFY_MAX_BYTES = 256 * 1024;
export const NOTIFY_MAX_TITLE = 200;
export const NOTIFY_MAX_SUMMARY = 500;

/** Plain text: no tags or entities, one line, trimmed, cut at `max` characters. */
function plain(s: string, max: number): string {
  const t = s
    .replace(/<[^>]*>/g, '')
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** A release opens its first new page; one with no new pages opens the home page. */
export function releaseUrl(r: Release): string {
  const first = r.pages[0];
  return first ? `${SITE_URL}/${first}/` : `${SITE_URL}/`;
}

/** The feed for a list of releases (oldest first, as in src/releases.ts), newest first. */
export function notifyFeed(releases: Release[]): NotifyFeed {
  const items = [...releases]
    .reverse()
    .slice(0, NOTIFY_MAX_ITEMS)
    .map((r) => ({
      id: r.id,
      title: plain(r.title, NOTIFY_MAX_TITLE),
      url: releaseUrl(r),
      date: r.date,
      summary: plain(r.note, NOTIFY_MAX_SUMMARY),
    }));
  return { app: 'stepwise', items };
}
