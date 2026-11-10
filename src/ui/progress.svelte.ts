import { listeners } from '../engine/listeners';
import { readJson, removeJson, writeJson } from '../engine/storage';
import {
  emptyProgress,
  mergeProgress,
  now,
  parseProgress,
  PROGRESS_KEY,
  resetProgress,
  type Progress,
} from '../progress/progress';

export { now };

const stored = (): Progress => parseProgress(readJson<unknown>(PROGRESS_KEY, null));

/**
 * The reader's progress (src/progress/progress.ts), shared by the pages and the catalog. Each
 * change merges in what another tab may have stored meanwhile before it writes, and a change in
 * another tab shows here at once.
 */
class ProgressStore {
  current = $state.raw<Progress>(typeof localStorage === 'undefined' ? emptyProgress() : stored());
  private changes = listeners();

  /** Called after the reader's own changes here (the account sync writes them back). */
  onChange(listener: () => void): () => void {
    return this.changes.add(listener);
  }

  update(change: (p: Progress) => Progress): void {
    const next = change(mergeProgress(this.current, stored()));
    this.current = next;
    writeJson(PROGRESS_KEY, next);
    this.changes.emit();
  }

  /** "Reset my progress": empty here, and a reset time that empties other copies when merged. */
  reset(): void {
    const next = resetProgress(now());
    this.current = next;
    writeJson(PROGRESS_KEY, next);
    this.changes.emit();
  }

  /** Merge in another copy (the account's). Not a change of the reader's, so nobody is told. */
  mergeIn(other: Progress): void {
    const next = mergeProgress(mergeProgress(this.current, stored()), other);
    this.current = next;
    writeJson(PROGRESS_KEY, next);
  }

  /** Forget the progress kept here ("Delete my StepWise data"): nothing, and no reset time. */
  clear(): void {
    this.current = emptyProgress();
    removeJson(PROGRESS_KEY);
  }

  /** Another tab wrote: take its changes. */
  reload(): void {
    this.current = mergeProgress(this.current, stored());
  }
}

export const progress = new ProgressStore();

if (typeof addEventListener === 'function') {
  addEventListener('storage', (e) => {
    if (e.key === null || e.key === `stepwise:${PROGRESS_KEY}`) progress.reload();
  });
}
