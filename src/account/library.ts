/**
 * Examples in an account, as the examples panel uses them: saving the page's work, and copying
 * the examples saved in this browser into the account.
 */
import { readJson, writeJson, type LibraryItem } from '../engine/storage';
import type { SavedExample } from '../engine/types';
import {
  asAccountError,
  LIMITS,
  type AccountBackend,
  type AccountError,
  type AccountExample,
} from './backend';

/** Save the page's work in the account under this name. */
export function saveToAccount(
  backend: AccountBackend,
  title: string,
  example: SavedExample,
): Promise<AccountExample> {
  const name = title.slice(0, LIMITS.title);
  return backend.createExample({
    viz: example.viz,
    title: name,
    example: { ...example, title: name },
  });
}

/** Which browser examples went into which account, so a second copy skips them. */
const COPIED = 'account-copied';

function copiedKeys(userId: string): string[] {
  const all = readJson<Record<string, unknown>>(COPIED, {});
  const mine = all && typeof all === 'object' ? all[userId] : undefined;
  return Array.isArray(mine) ? mine.filter((k): k is string => typeof k === 'string') : [];
}

function markCopied(userId: string, key: string): void {
  const all = readJson<Record<string, unknown>>(COPIED, {});
  const base = all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  writeJson(COPIED, { ...base, [userId]: [...copiedKeys(userId), key] });
}

/** Forget which browser examples went into this account (its examples were deleted). */
export function forgetCopied(userId: string): void {
  const all = readJson<Record<string, unknown>>(COPIED, {});
  if (!all || typeof all !== 'object' || Array.isArray(all) || !(userId in all)) return;
  const { [userId]: _gone, ...rest } = all;
  writeJson(COPIED, rest);
}

/** The browser's saved examples (every page's) not yet copied into this account. */
export function notYetCopied(userId: string, library: LibraryItem[]): LibraryItem[] {
  const done = new Set(copiedKeys(userId));
  return library.filter((item) => !done.has(item.key));
}

/**
 * Copy the browser's saved examples into the account, oldest first so the newest ends up on top,
 * skipping ones already copied. Each one is marked as it lands, so a copy that stops halfway
 * (no network) carries on where it stopped next time. Never throws.
 */
export async function copyBrowserExamples(
  backend: AccountBackend,
  userId: string,
  library: LibraryItem[],
): Promise<{ copied: number; left: number; error: AccountError | null }> {
  const todo = notYetCopied(userId, library).reverse();
  let copied = 0;
  for (const item of todo) {
    try {
      await backend.createExample({
        viz: item.example.viz,
        title: item.title.slice(0, LIMITS.title),
        notes: (item.example.notes ?? '').slice(0, LIMITS.notes),
        example: item.example,
      });
    } catch (e) {
      return { copied, left: todo.length - copied, error: asAccountError(e) };
    }
    markCopied(userId, item.key);
    copied++;
  }
  return { copied, left: 0, error: null };
}
