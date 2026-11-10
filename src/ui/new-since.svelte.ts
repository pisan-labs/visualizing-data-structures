import { listeners } from '../engine/listeners';
import { readJson, removeJson, writeJson } from '../engine/storage';
import { isReleaseId, laterRelease, latestRelease } from '../releases';

/**
 * The newest release the reader has seen (src/releases.ts), for "New since your last visit" on
 * the home page. Kept in this browser and, signed in, in the account
 * (app_stepwise.preferences.last_release, through src/account/sync.svelte.ts).
 */
export const LAST_RELEASE_KEY = 'last-release';

const read = (): string | null => {
  const v = readJson<unknown>(LAST_RELEASE_KEY, null);
  return isReleaseId(v) ? v : null;
};

export const seen = $state({ last: typeof localStorage === 'undefined' ? null : read() });

const changes = listeners();

/** Called after the reader saw a release here. Returns an unsubscribe. */
export const onSeenChange = changes.add;

function store(id: string | null): boolean {
  const next = laterRelease(laterRelease(seen.last, read()), id);
  if (next === seen.last && next === read()) return false;
  seen.last = next;
  if (next) writeJson(LAST_RELEASE_KEY, next);
  return true;
}

/** The reader has seen this release (Dismiss, or a first visit). */
export function markSeen(id: string): void {
  if (store(id)) changes.emit();
}

/** The account says the reader has seen this one (only a later one changes anything). */
export function applySeen(id: string | null): void {
  store(id);
}

/** Forget it here ("Delete my StepWise data"). */
export function clearSeen(): void {
  seen.last = null;
  removeJson(LAST_RELEASE_KEY);
}

/**
 * On the home page: a first visit (nothing seen yet) records the latest release without showing
 * anything new. A signed-in reader's account may know their last release, so `settled` (the
 * start-up account check and first sync) comes first.
 */
export async function noteFirstVisit(settled: Promise<void>): Promise<void> {
  if (seen.last !== null) return;
  await settled;
  if (seen.last === null) markSeen(latestRelease().id);
}
