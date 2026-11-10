/**
 * Names shared by the page (offline.svelte.ts), the build (precache.ts) and the worker (sw.js,
 * plain JavaScript that repeats the message names; precache.test.ts checks that they match).
 */

/** The <meta name> in every built page that holds its build's version. */
export const BUILD_META = 'stepwise-build';

/** Message to a worker: reply on the given port with your version. */
export const ASK_VERSION = 'version';

/** Message to a waiting worker: take over now. */
export const SKIP_WAITING = 'skip-waiting';

/** Message to the active worker: reply with what is still missing for every page offline. */
export const ASK_STATUS = 'status';

/** Message to the active worker: fetch and keep these files (or all that are missing). */
export const DOWNLOAD = 'download';

/** The worker's answer to ASK_STATUS. */
export interface OfflineStatus {
  /** How many of the build's files are not kept yet, and about how many bytes they are. */
  count: number;
  bytes: number;
  /** How many files the build has in all. */
  total: number;
}

/** The worker's reports while it downloads; the last one has `finished`. */
export interface DownloadProgress {
  done: number;
  count: number;
  bytes: number;
  total: number;
  failed: number;
  finished: boolean;
}
