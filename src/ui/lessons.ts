/**
 * The concept page split into lessons: each `##` section is one, with its own deep link
 * (#lesson=<slug>). The text before the first `##` is an introduction, not a lesson.
 */

export const lessonSlug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export interface LessonSource {
  /** Null for the introduction. */
  slug: string | null;
  /** The heading as plain words, for labels. */
  title: string;
  /** The Markdown of the section, its heading included. */
  body: string;
}

/** Split Markdown at its `##` headings, skipping lines inside fenced blocks. */
export function splitLessons(source: string): LessonSource[] {
  const out: LessonSource[] = [{ slug: null, title: '', body: '' }];
  const lines: string[][] = [[]];
  let fence = false;
  for (const line of source.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const m = fence ? null : /^## +(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      out.push({ slug: lessonSlug(m[1]!), title: plainTitle(m[1]!), body: '' });
      lines.push([]);
    }
    lines[lines.length - 1]!.push(line);
  }
  out.forEach((l, i) => (l.body = lines[i]!.join('\n')));
  return out.filter((l) => l.slug !== null || l.body.trim() !== '');
}

/** Heading Markdown as plain words: no code marks, emphasis or link targets. */
function plainTitle(md: string): string {
  return md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .trim();
}

/**
 * Watch for the reader reaching an element (a lesson's end): it calls `reached` once the element
 * has been fully on screen, in a visible tab, for `dwell` milliseconds. A quick scroll past it
 * does not count.
 */
export function onReach(node: Element, reached: () => void, dwell = 1200): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new IntersectionObserver(
    ([entry]) => {
      clearTimeout(timer);
      if (!entry?.isIntersecting) return;
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') reached();
      }, dwell);
    },
    { threshold: 1 },
  );
  observer.observe(node);
  return () => {
    clearTimeout(timer);
    observer.disconnect();
  };
}
