import { readJson, writeJson } from '../engine/storage';
import type { Level } from '../engine/types';

export type Theme = 'auto' | 'light' | 'dark' | 'contrast';
export type Tab = 'learn' | 'bigo' | 'examples' | 'trace' | 'history';
export type CodeView = 'formal' | 'plain' | 'python' | 'java' | 'cpp';

/** Per-viewer conveniences, remembered in the browser when storage is available. */
export const prefs = $state({
  theme: readJson<Theme>('theme', 'auto'),
  speed: readJson<number>('speed', 1),
  detail: readJson<Level>('detail', 2),
  tab: readJson<Tab>('tab', 'learn'),
  codeView: readJson<CodeView>('codeView', 'formal'),
});

export function setPref<K extends keyof typeof prefs>(key: K, value: (typeof prefs)[K]): void {
  prefs[key] = value;
  writeJson(key, value);
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
