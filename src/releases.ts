/**
 * What changed on the site, newest last. The home page shows a reader the releases newer than the
 * last one they saw ("New since your last visit", src/ui/NewSince.svelte), and
 * scripts/prerender.mjs writes the same list to dist/releases.json for the platform's email about
 * new pages.
 *
 * Add a release at the end. An id never changes once published: readers' browsers and accounts
 * keep the id of the last release they saw, and the email job remembers which ones it sent.
 *
 * Adding a release sends an email. Since 13 November the platform's app-notify reads
 * dist/notify-feed.json (src/notify-feed.ts) every day at 15:17 UTC and emails each new id the
 * next run to every reader with notify_new_pages on; a changed id is emailed again.
 */

export interface Release {
  /** The date and a short name, as in 2026-11-08-wave-7. */
  id: string;
  /** The day it went out (YYYY-MM-DD). */
  date: string;
  title: string;
  /** One line about it. */
  note: string;
  /** Pages new in this release (page ids, as in src/viz/catalog.ts). */
  pages: string[];
}

export const releases: Release[] = [
  {
    id: '2026-11-08-wave-7',
    date: '2026-11-08',
    title: '62 new pages',
    note: 'The standard topics no page covered yet: searching and sorting, balanced and spatial trees, heaps, hashing and sketches, strings, graphs, dynamic programming, numbers and parsing.',
    pages: [
      'interpolation-search',
      'exponential-search',
      'ternary-search',
      'comb-sort',
      'gnome-sort',
      'introsort',
      'timsort',
      'bitonic-sort',
      'cartesian-tree',
      'scapegoat-tree',
      'aa-tree',
      'interval-tree',
      'persistent-bst',
      'kd-tree',
      'quadtree',
      'closest-pair',
      'segment-intersection',
      'delaunay',
      'd-ary-heap',
      'min-max-heap',
      'pairing-heap',
      'rope',
      'merkle-tree',
      'bloom-filter',
      'cuckoo-hashing',
      'robin-hood-hashing',
      'consistent-hashing',
      'count-min-sketch',
      'hyperloglog',
      'z-algorithm',
      'aho-corasick',
      'manacher',
      'burrows-wheeler',
      'lz-compression',
      'euler-path',
      'graph-coloring',
      'bidirectional-search',
      'boruvka',
      'johnson',
      'lca',
      'pagerank',
      'dp-lis',
      'dp-rod-cutting',
      'dp-subset-sum',
      'dp-matrix-chain',
      'dp-palindrome',
      'activity-selection',
      'interval-partitioning',
      'fractional-knapsack',
      'euclid',
      'mod-pow',
      'sieve',
      'rsa',
      'karatsuba',
      'fft',
      'fisher-yates',
      'reservoir-sampling',
      'cfg-to-cnf',
      'll1-parsing',
      'lr0-parsing',
      'lba',
      'rice-theorem',
    ],
  },
  {
    id: '2026-11-09-wave-8',
    date: '2026-11-09',
    title: '12 new pages, and the older pages reviewed',
    note: 'Problem-solving techniques, three algorithms and four theory pages. The 129 older pages were checked again: 89 fixes to practice answers, explanations and narration.',
    pages: [
      'two-pointers',
      'sliding-window',
      'monotonic-stack',
      'monotonic-queue',
      'string-hashing',
      'push-relabel',
      'karger-min-cut',
      'strassen',
      'myhill-nerode',
      'regex-derivatives',
      'post-correspondence',
      'busy-beaver',
    ],
  },
  {
    id: '2026-11-10-features',
    date: '2026-11-10',
    title: 'Sign in, Present tools, worksheets and more',
    note: 'Optional sign-in for your examples, settings and progress; pen and pointer in Present mode; Save picture; keyboard shortcuts (press ?); printable worksheets; progress; recent pages; an offline app; lesson lists.',
    pages: [],
  },
];

/** A release id: the date, then words of lower-case letters and digits joined by "-". */
export const RELEASE_ID = /^\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)+$/;

export const isReleaseId = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 64 && RELEASE_ID.test(v);

export const latestRelease = (list: Release[] = releases): Release => list[list.length - 1]!;

/**
 * Release order: by date, then by place in the list. An id this build does not know comes from a
 * newer build, so it sorts after the known ones of its day.
 */
function compareRelease(a: string, b: string, list: Release[]): number {
  const rank = (id: string) => {
    const i = list.findIndex((r) => r.id === id);
    return i < 0 ? list.length : i;
  };
  const da = a.slice(0, 10);
  const db = b.slice(0, 10);
  if (da !== db) return da < db ? -1 : 1;
  const d = rank(a) - rank(b);
  if (d !== 0) return d;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The later of two "last release seen" ids (either may be missing). */
export function laterRelease(
  a: string | null,
  b: string | null,
  list: Release[] = releases,
): string | null {
  if (!isReleaseId(a)) return isReleaseId(b) ? b : null;
  if (!isReleaseId(b)) return a;
  return compareRelease(a, b, list) >= 0 ? a : b;
}

/** The releases after `last`, newest first. Nothing when there is no last one (a first visit). */
export function releasesSince(last: string | null, list: Release[] = releases): Release[] {
  if (!isReleaseId(last)) return [];
  return list.filter((r) => compareRelease(r.id, last, list) > 0).reverse();
}
