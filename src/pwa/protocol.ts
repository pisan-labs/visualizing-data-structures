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
