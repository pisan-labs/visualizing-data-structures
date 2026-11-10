import { listeners } from '../engine/listeners';
import { readJson, removeJson, writeJson } from '../engine/storage';
import type { Level } from '../engine/types';
import { now } from '../progress/progress';

export type Theme = 'auto' | 'light' | 'dark' | 'contrast';
export type Tab = 'learn' | 'bigo' | 'practice' | 'examples' | 'trace' | 'history';
export type CodeView = 'formal' | 'plain' | 'python' | 'java' | 'cpp';

const DEFAULTS = {
  theme: 'auto' as Theme,
  speed: 1,
  detail: 2 as Level,
  tab: 'learn' as Tab,
  codeView: 'formal' as CodeView,
};

/** Per-viewer conveniences, remembered in the browser when storage is available. */
export const prefs = $state({
  theme: readJson<Theme>('theme', DEFAULTS.theme),
  speed: readJson<number>('speed', DEFAULTS.speed),
  detail: readJson<Level>('detail', DEFAULTS.detail),
  tab: readJson<Tab>('tab', DEFAULTS.tab),
  codeView: readJson<CodeView>('codeView', DEFAULTS.codeView),
});

type PrefKey = keyof typeof prefs;
const PREF_KEYS = Object.keys(DEFAULTS) as PrefKey[];

// When the reader set each preference, so that a signed-in reader's copies (this browser and
// the account, src/account/sync.svelte.ts) can keep the later choice per preference.
const TIMES = 'pref-times';
const readTimes = (): Record<string, unknown> => {
  const t = readJson<unknown>(TIMES, {});
  return t && typeof t === 'object' && !Array.isArray(t) ? (t as Record<string, unknown>) : {};
};

const changes = listeners();
const applied = listeners();

/** Called after the reader changes a preference here. Returns an unsubscribe. */
export const onPrefChange = changes.add;

/** Called after preferences from the account were applied (an open page may follow them). */
export const onPrefsApplied = applied.add;

export function setPref<K extends PrefKey>(key: K, value: (typeof prefs)[K]): void {
  prefs[key] = value;
  writeJson(key, value);
  writeJson(TIMES, { ...readTimes(), [key]: now() });
  changes.emit();
}

/**
 * The preferences stored in this browser, each with when it was set: `at` is null for one stored
 * before times were kept. Preferences never set here are left out. Values are as stored
 * (unchecked).
 */
export function storedPrefs(): Partial<Record<PrefKey, { value: unknown; at: string | null }>> {
  const times = readTimes();
  const out: Partial<Record<PrefKey, { value: unknown; at: string | null }>> = {};
  for (const key of PREF_KEYS) {
    const value = readJson<unknown>(key, undefined);
    if (value === undefined) continue;
    const at = times[key];
    out[key] = { value, at: typeof at === 'string' ? at : null };
  }
  return out;
}

/** Take preferences from the account: shown at once and stored here with their times. */
export function applyPrefs(given: Partial<Record<PrefKey, { value: unknown; at: string }>>): void {
  const times = readTimes();
  for (const key of PREF_KEYS) {
    const p = given[key];
    if (!p) continue;
    (prefs as Record<PrefKey, unknown>)[key] = p.value;
    writeJson(key, p.value);
    times[key] = p.at;
  }
  writeJson(TIMES, times);
  applied.emit();
}

/** Forget the preferences stored here ("Delete my StepWise data"): back to the defaults. */
export function clearPrefs(): void {
  for (const key of PREF_KEYS) {
    (prefs as Record<PrefKey, unknown>)[key] = DEFAULTS[key];
    removeJson(key);
  }
  removeJson(TIMES);
  applied.emit();
}

export interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export const notices = $state<Notice[]>([]);
let nextNotice = 1;

export function notify(text: string, tone: Notice['tone'] = 'info'): void {
  const id = nextNotice++;
  notices.push({ id, text, tone });
  setTimeout(() => {
    const i = notices.findIndex((n) => n.id === id);
    if (i >= 0) notices.splice(i, 1);
  }, 5000);
}

export const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
