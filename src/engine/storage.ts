import type { SavedExample } from './types';

/**
 * Browser storage helpers. Storage can be missing or throw (private windows, blocked site data),
 * so every call is wrapped and the app works without it.
 */

const PREFIX = 'stepwise:';

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export interface LibraryItem {
  key: string;
  title: string;
  savedAt: string;
  example: SavedExample;
}

export function loadLibrary(): LibraryItem[] {
  const items = readJson<unknown>('library', []);
  return Array.isArray(items) ? (items as LibraryItem[]) : [];
}

export function saveToLibrary(title: string, example: SavedExample): LibraryItem | null {
  const item: LibraryItem = {
    key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    savedAt: new Date().toISOString(),
    example: { ...example, title },
  };
  return writeJson('library', [item, ...loadLibrary()]) ? item : null;
}

export function deleteFromLibrary(key: string): void {
  writeJson(
    'library',
    loadLibrary().filter((i) => i.key !== key),
  );
}
