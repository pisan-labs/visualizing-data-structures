/**
 * What the account keeps of a reader's settings and progress (app_stepwise.preferences), and how
 * two copies of it merge: the browser's and the account's, or two browsers' through the account.
 * The merge is the same whichever copy comes first and changes nothing when a copy meets itself,
 * so copies can meet as often as they like and still agree in the end.
 */
import { emptyProgress, mergeProgress, parseProgress, type Progress } from '../progress/progress';
import { isReleaseId, laterRelease } from '../releases';
import { SPEEDS } from '../ui/shortcuts';

/** The settings that follow the account. */
export const PREF_KEYS = ['theme', 'speed', 'detail', 'codeView', 'tab'] as const;
export type PrefKey = (typeof PREF_KEYS)[number];

/** A setting and when the reader chose it. */
export interface PrefStamp {
  value: unknown;
  at: string;
}
export type PrefStamps = Partial<Record<PrefKey, PrefStamp>>;

/** The time given to a setting stored before times were kept: older than any real choice. */
export const EPOCH = new Date(0).toISOString();

const oneOf =
  (...allowed: unknown[]) =>
  (v: unknown) =>
    allowed.includes(v);

/** The values each setting may take; anything else from an account is dropped. */
const VALID: Record<PrefKey, (v: unknown) => boolean> = {
  theme: oneOf('auto', 'light', 'dark', 'contrast'),
  speed: oneOf(...SPEEDS),
  detail: oneOf(1, 2, 3),
  codeView: oneOf('formal', 'plain', 'python', 'java', 'cpp'),
  tab: oneOf('learn', 'bigo', 'practice', 'examples', 'trace', 'history'),
};

export const validPref = (key: PrefKey, value: unknown): boolean => VALID[key](value);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function cleanTime(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) && Math.abs(t) <= 8.64e15 ? new Date(t).toISOString() : null;
}

/** Read untrusted settings (from an account, or storage): unknown keys and bad values dropped. */
export function parsePrefStamps(raw: unknown): PrefStamps {
  const out: PrefStamps = {};
  if (!isRecord(raw)) return out;
  for (const key of PREF_KEYS) {
    const s = raw[key];
    if (!isRecord(s) || !VALID[key](s.value)) continue;
    const at = cleanTime(s.at);
    if (at) out[key] = { value: s.value, at };
  }
  return out;
}

/** JSON with object keys sorted, so equal content is an equal string whatever the key order. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isRecord(v)) {
    const keys = Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** Per setting, the later choice wins; at the same time, the larger value (any fixed rule will do). */
export function mergePrefStamps(a: PrefStamps, b: PrefStamps): PrefStamps {
  const out: PrefStamps = {};
  for (const key of PREF_KEYS) {
    const x = a[key];
    const y = b[key];
    if (!x || !y) {
      if (x ?? y) out[key] = (x ?? y)!;
      continue;
    }
    const d = Date.parse(x.at) - Date.parse(y.at);
    out[key] = d > 0 ? x : d < 0 ? y : canonical(x.value) >= canonical(y.value) ? x : y;
  }
  return out;
}

/** The part of a reader's data that is merged (the email choice is not: see sync.svelte.ts). */
export interface Synced {
  prefs: PrefStamps;
  progress: Progress;
  lastRelease: string | null;
}

export const emptySynced = (): Synced => ({
  prefs: {},
  progress: emptyProgress(),
  lastRelease: null,
});

/** Read an account's copy; anything malformed is dropped. */
export function parseSynced(raw: {
  prefs: unknown;
  progress: unknown;
  lastRelease: unknown;
}): Synced {
  return {
    prefs: parsePrefStamps(raw.prefs),
    progress: parseProgress(raw.progress),
    lastRelease: isReleaseId(raw.lastRelease) ? raw.lastRelease : null,
  };
}

export function mergeSynced(a: Synced, b: Synced): Synced {
  return {
    prefs: mergePrefStamps(a.prefs, b.prefs),
    progress: mergeProgress(a.progress, b.progress),
    lastRelease: laterRelease(a.lastRelease, b.lastRelease),
  };
}

export const sameSynced = (a: Synced, b: Synced): boolean => canonical(a) === canonical(b);

/** Nothing worth a row: no setting chosen, no progress, no release seen. */
export const isEmptySynced = (s: Synced): boolean => sameSynced(s, emptySynced());
