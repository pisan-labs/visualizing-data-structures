/**
 * A reader's progress, kept in the browser: the lessons read (the `##` sections of a concept
 * page), the concept checks answered right, and practice results, per page. It is one versioned
 * object under one storage key. Every item carries the time it was set, so two copies (two
 * devices, or the browser and an account, PLAN.md section 18 slice 2) merge without losing
 * anything: see `mergeProgress`.
 */

export const PROGRESS_KEY = 'progress';
export const PROGRESS_VERSION = 1;

/**
 * A lesson marked read (or unticked: `done` false), or a concept check answered right. When two
 * copies disagree, the later one wins.
 */
export interface Mark {
  done: boolean;
  at: string;
}

/**
 * A practice question's first try: a copy records only one, since a second try after the page
 * showed the answer says nothing about what the reader knew. When two copies both have one, the
 * later wins, like a mark. (The earlier winning would sound fairer, but a reset could then remove
 * the winner and leave nothing, depending on the order copies were merged in.)
 */
export interface Attempt {
  right: boolean;
  at: string;
}

/**
 * The lessons and checks a page had when the reader last saw its concept page, so the catalog
 * can tell a finished page without loading it.
 */
export interface Outline {
  lessons: string[];
  checks: string[];
  at: string;
}

export interface PageProgress {
  /** Lesson slug (as in #lesson=<slug>) to its mark. */
  lessons: Record<string, Mark>;
  /** Concept check id (see `checkId`) to its mark. */
  checks: Record<string, Mark>;
  /** Practice question key (`<set>-<number>`, see `attemptKey`) to its first try. */
  practice: Record<string, Attempt>;
  outline?: Outline;
}

export interface Progress {
  version: typeof PROGRESS_VERSION;
  /** "Reset my progress": everything set at or before this time is gone, in every copy. */
  resetAt?: string;
  pages: Record<string, PageProgress>;
}

export const emptyProgress = (): Progress => ({ version: PROGRESS_VERSION, pages: {} });

const time = (at: string | undefined): number => (at === undefined ? -Infinity : Date.parse(at));

/** A time as stored: ISO 8601 in UTC, so equal times are equal strings. Null if not a time. */
function cleanTime(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) && Math.abs(t) <= 8.64e15 ? new Date(t).toISOString() : null;
}

const KEY = /^[\w.:-]{1,120}$/;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function cleanItems<T>(raw: unknown, flag: 'done' | 'right'): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isRecord(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!KEY.test(k) || !isRecord(v) || typeof v[flag] !== 'boolean') continue;
    const at = cleanTime(v.at);
    if (at) out[k] = { [flag]: v[flag], at } as T;
  }
  return out;
}

function cleanOutline(raw: unknown): Outline | undefined {
  if (!isRecord(raw)) return undefined;
  const at = cleanTime(raw.at);
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && KEY.test(x)) : null;
  const lessons = list(raw.lessons);
  const checks = list(raw.checks);
  return at && lessons && checks ? { lessons, checks, at } : undefined;
}

/**
 * Read an untrusted copy (from storage, a file or a server). Anything malformed is dropped, and
 * a copy of another version reads as empty.
 */
export function parseProgress(raw: unknown): Progress {
  if (!isRecord(raw) || raw.version !== PROGRESS_VERSION) return emptyProgress();
  const out = emptyProgress();
  const resetAt = cleanTime(raw.resetAt);
  if (resetAt) out.resetAt = resetAt;
  if (isRecord(raw.pages)) {
    for (const [id, page] of Object.entries(raw.pages)) {
      if (!KEY.test(id) || !isRecord(page)) continue;
      const p: PageProgress = {
        lessons: cleanItems<Mark>(page.lessons, 'done'),
        checks: cleanItems<Mark>(page.checks, 'done'),
        practice: cleanItems<Attempt>(page.practice, 'right'),
      };
      const outline = cleanOutline(page.outline);
      if (outline) p.outline = outline;
      out.pages[id] = p;
    }
  }
  return prune(out);
}

/** The later mark wins; at the same time, read beats unread, so the choice is the same both ways. */
function laterMark(x: Mark, y: Mark): Mark {
  const d = time(x.at) - time(y.at);
  if (d !== 0) return d > 0 ? x : y;
  return x.done ? x : y;
}

/** The later try wins; at the same time, the wrong answer wins (the cautious choice). */
function laterAttempt(x: Attempt, y: Attempt): Attempt {
  const d = time(x.at) - time(y.at);
  if (d !== 0) return d > 0 ? x : y;
  return x.right ? y : x;
}

function laterOutline(x: Outline, y: Outline): Outline {
  const d = time(x.at) - time(y.at);
  if (d !== 0) return d > 0 ? x : y;
  return JSON.stringify(x) >= JSON.stringify(y) ? x : y;
}

function mergeItems<T>(
  a: Record<string, T>,
  b: Record<string, T>,
  pick: (x: T, y: T) => T,
): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in out ? pick(out[k]!, v) : v;
  return out;
}

const emptyPage = (): PageProgress => ({ lessons: {}, checks: {}, practice: {} });

function keepAfter<T extends { at: string }>(items: Record<string, T>, after: number) {
  return Object.fromEntries(Object.entries(items).filter(([, v]) => time(v.at) > after));
}

/** Drop what a reset removed, and pages left with nothing in them. */
function prune(p: Progress): Progress {
  const after = time(p.resetAt);
  const pages: Record<string, PageProgress> = {};
  for (const [id, page] of Object.entries(p.pages)) {
    const kept: PageProgress = {
      lessons: keepAfter(page.lessons, after),
      checks: keepAfter(page.checks, after),
      practice: keepAfter(page.practice, after),
    };
    if (page.outline && time(page.outline.at) > after) kept.outline = page.outline;
    const empty =
      !kept.outline &&
      [kept.lessons, kept.checks, kept.practice].every((x) => Object.keys(x).length === 0);
    if (!empty) pages[id] = kept;
  }
  return { version: PROGRESS_VERSION, ...(p.resetAt ? { resetAt: p.resetAt } : {}), pages };
}

/**
 * Merge two copies of a reader's progress, item by item: each lesson, check and practice question
 * keeps the later of its two records, and the later reset removes everything set before it in
 * either copy. The result is the same whichever order the copies come in or are grouped in, and
 * merging a copy with itself changes nothing, so copies can be merged as often as they meet.
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const resetAt = time(a.resetAt) >= time(b.resetAt) ? a.resetAt : b.resetAt;
  const reset = resetAt ? { resetAt } : {};
  // Apply the reset to both copies first: an item it removes must not win against one it keeps.
  const x0 = prune({ ...a, ...reset });
  const y0 = prune({ ...b, ...reset });
  const pages: Record<string, PageProgress> = {};
  for (const id of new Set([...Object.keys(x0.pages), ...Object.keys(y0.pages)])) {
    const x = x0.pages[id] ?? emptyPage();
    const y = y0.pages[id] ?? emptyPage();
    const page: PageProgress = {
      lessons: mergeItems(x.lessons, y.lessons, laterMark),
      checks: mergeItems(x.checks, y.checks, laterMark),
      practice: mergeItems(x.practice, y.practice, laterAttempt),
    };
    const outline =
      x.outline && y.outline ? laterOutline(x.outline, y.outline) : (x.outline ?? y.outline);
    if (outline) page.outline = outline;
    pages[id] = page;
  }
  return { version: PROGRESS_VERSION, ...reset, pages };
}

/** Start over: no items, and a reset time that removes the items in every other copy too. */
export const resetProgress = (at: string): Progress => ({
  version: PROGRESS_VERSION,
  resetAt: at,
  pages: {},
});

function withPage(p: Progress, viz: string, change: (page: PageProgress) => PageProgress) {
  return { ...p, pages: { ...p.pages, [viz]: change(p.pages[viz] ?? emptyPage()) } };
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Note the page's lessons and checks, keeping the old time if nothing changed. */
export function withOutline(
  p: Progress,
  viz: string,
  outline: { lessons: string[]; checks: string[] },
  at: string,
): Progress {
  const old = p.pages[viz]?.outline;
  if (old && sameList(old.lessons, outline.lessons) && sameList(old.checks, outline.checks))
    return p;
  return withPage(p, viz, (page) => ({ ...page, outline: { ...outline, at } }));
}

/** Tick or untick a lesson. */
export function setLesson(
  p: Progress,
  viz: string,
  slug: string,
  done: boolean,
  at: string,
): Progress {
  return withPage(p, viz, (page) => ({
    ...page,
    lessons: { ...page.lessons, [slug]: { done, at } },
  }));
}

/**
 * Mark a lesson read because the reader reached its end. A lesson already marked, or unticked
 * by the reader, keeps its mark.
 */
export function reachLesson(p: Progress, viz: string, slug: string, at: string): Progress {
  return p.pages[viz]?.lessons[slug] ? p : setLesson(p, viz, slug, true, at);
}

/** A concept check answered right. */
export function setCheckRight(p: Progress, viz: string, id: string, at: string): Progress {
  return withPage(p, viz, (page) => ({
    ...page,
    checks: { ...page.checks, [id]: { done: true, at } },
  }));
}

/** A practice question checked. Only the first try counts. */
export function recordAttempt(
  p: Progress,
  viz: string,
  key: string,
  right: boolean,
  at: string,
): Progress {
  if (p.pages[viz]?.practice[key]) return p;
  return withPage(p, viz, (page) => ({
    ...page,
    practice: { ...page.practice, [key]: { right, at } },
  }));
}

/** The key of question `index` (from 0) of practice set `seed`: the same in every set size. */
export const attemptKey = (seed: number, index: number): string => `${seed}-${index + 1}`;

/** A concept check's id: a hash of its question, so adding a check elsewhere keeps the others. */
export function checkId(question: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < question.length; i++) h = Math.imul(h ^ question.charCodeAt(i), 0x01000193);
  return `c${(h >>> 0).toString(36)}`;
}

export interface PageSummary {
  lessonsRead: number;
  lessonsTotal: number;
  checksRight: number;
  checksTotal: number;
  practiceRight: number;
  practiceTried: number;
  /** Something done here: a lesson read, a check answered right or a question tried. */
  started: boolean;
  /** Every lesson read and every check answered right (the page has at least one lesson). */
  finished: boolean;
}

/**
 * Counts for one page. `outline` is the page's lessons and checks as it is now; the catalog,
 * which does not load the pages, leaves it out and uses the outline last seen.
 */
export function pageSummary(
  p: Progress,
  viz: string,
  outline?: { lessons: string[]; checks: string[] },
): PageSummary {
  const page = p.pages[viz] ?? emptyPage();
  const known = outline ?? page.outline;
  const lessons = known?.lessons ?? Object.keys(page.lessons);
  const checks = known?.checks ?? Object.keys(page.checks);
  const lessonsRead = lessons.filter((s) => page.lessons[s]?.done).length;
  const checksRight = checks.filter((c) => page.checks[c]?.done).length;
  const attempts = Object.values(page.practice);
  const practiceRight = attempts.filter((a) => a.right).length;
  const marked = [...Object.values(page.lessons), ...Object.values(page.checks)];
  return {
    lessonsRead,
    lessonsTotal: lessons.length,
    checksRight,
    checksTotal: checks.length,
    practiceRight,
    practiceTried: attempts.length,
    started: attempts.length > 0 || marked.some((m) => m.done),
    finished:
      !!known &&
      lessons.length > 0 &&
      lessonsRead === lessons.length &&
      checksRight === checks.length,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The summary in words, for a page and for the catalog's tooltips. Empty when nothing is set. */
export function summaryText(s: PageSummary): string {
  const parts: string[] = [];
  if (s.lessonsTotal) parts.push(`${s.lessonsRead} of ${plural(s.lessonsTotal, 'lesson')} read`);
  if (s.checksTotal) parts.push(`${s.checksRight} of ${plural(s.checksTotal, 'check')} right`);
  if (s.practiceTried)
    parts.push(`practice ${s.practiceRight} of ${s.practiceTried} right on the first try`);
  return parts.join(', ');
}

/** The time now, as items store it. */
export const now = (): string => new Date().toISOString();
