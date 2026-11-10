import type { SavedExample } from '../engine/types';

/**
 * "Pick up where you left off": the pages a reader opened last, newest first, each with the
 * example and step they left it at, in the example link encoding (#ex=<code>).
 */

export const RECENT_KEY = 'recent';
export const MAX_RECENT = 3;

export interface RecentPage {
  id: string;
  title: string;
  /** The example link code (as in #ex=<code>), or null when the page was left as it opened. */
  code: string | null;
  /** The step on screen, from 1, among the steps shown at the reader's detail level. */
  step: number;
  steps: number;
  /** When the reader left the page. */
  at: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Read an untrusted list from storage; anything malformed is dropped. */
export function parseRecent(raw: unknown): RecentPage[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentPage[] = [];
  for (const r of raw) {
    if (!isRecord(r)) continue;
    const { id, title, code, step, steps, at } = r;
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id)) continue;
    if (typeof title !== 'string' || typeof at !== 'string' || !Number.isFinite(Date.parse(at)))
      continue;
    if (code !== null && (typeof code !== 'string' || !/^[zj][\w-]*$/.test(code))) continue;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 1);
    if (out.some((o) => o.id === id)) continue;
    out.push({ id, title: title.slice(0, 200), code, step: n(step), steps: n(steps), at });
  }
  return out.slice(0, MAX_RECENT);
}

/** Put a page first, dropping its older entry and anything past the limit. */
export function addRecent(list: RecentPage[], page: RecentPage, max = MAX_RECENT): RecentPage[] {
  return [page, ...list.filter((r) => r.id !== page.id)].slice(0, max);
}

/**
 * The example link code, made at once. A page that is closing cannot wait for the compressed
 * form (encodeExample is asynchronous), so this is its other form: "j" and the JSON in base64url,
 * which decodeExample reads too.
 */
export function encodeExampleNow(ex: SavedExample): string {
  const bytes = new TextEncoder().encode(JSON.stringify(ex));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return 'j' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "just now", "5 minutes ago", "yesterday", "last week"... */
export function timeAgo(at: string, now: number): string {
  const secs = Math.max(0, (now - Date.parse(at)) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (secs >= size) return rtf.format(-Math.floor(secs / size), unit);
  }
  return 'just now';
}
